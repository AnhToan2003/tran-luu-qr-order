import { getCollections } from '../db';
import { OrderDoc, OrderItemDoc, InventoryMovementDoc } from '../types';

export interface PlaceOrderInput {
  sessionHash: string;
  clientRequestId: string;
  courtCode: string;
  items: {
    productId: string;
    quantity: number;
    iceQuantity: number;
  }[];
}

export class OrderService {
  /**
   * Đặt đơn hàng mới với tính nguyên tử (BR-04, BR-05, BR-09, BR-13, BR-14)
   */
  static async placeOrder(input: PlaceOrderInput): Promise<OrderDoc> {
    const colls = getCollections();

    // 1. Kiểm tra Idempotency
    const existingOrder = await colls.orders.findOne({
      customerSessionHash: input.sessionHash,
      clientRequestId: input.clientRequestId
    });
    if (existingOrder) {
      console.log(`[OrderService] Idempotent hit: Order ${existingOrder.displayCode} already exists.`);
      return existingOrder;
    }

    // 2. Kiểm tra công tắc hệ thống (BR-25)
    const settings = await colls.appSettings.findOne({ key: 'system_config' });
    if (settings && settings.value.isAcceptingOrders === false) {
      const err = new Error('SHOP_CLOSED: Quầy nước hiện đang tạm dừng nhận đơn');
      (err as any).statusCode = 400;
      throw err;
    }

    // 3. Kiểm tra Sân thi đấu (BR-01, BR-02)
    const court = await colls.courts.findOne({ code: input.courtCode, isActive: true, deletedAt: null });
    if (!court) {
      const err = new Error(`COURT_NOT_FOUND: Không tìm thấy sân ${input.courtCode} hoặc sân đã ngừng hoạt động`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (!input.items || input.items.length === 0) {
      const err = new Error('INVALID_ITEMS: Giỏ hàng không có sản phẩm');
      (err as any).statusCode = 400;
      throw err;
    }

    // 4. Trừ kho nguyên tử từng món (Atomic Conditional Decrement with Compensating Rollback)
    const decrementedList: { productId: string; quantity: number }[] = [];
    const orderItems: OrderItemDoc[] = [];
    let totalVnd = 0;

    try {
      for (const item of input.items) {
        if (item.quantity < 1) {
          throw new Error('INVALID_QUANTITY: Số lượng chai phải lớn hơn hoặc bằng 1');
        }
        // BR-13: Clamp ice quantity
        const iceQty = Math.max(0, Math.min(item.quantity, item.iceQuantity || 0));

        // Atomic decrement with condition stock >= quantity
        const updatedProduct = await colls.products.findOneAndUpdate(
          {
            productId: item.productId,
            isAvailable: true,
            deletedAt: null,
            stock: { $gte: item.quantity }
          },
          {
            $inc: { stock: -item.quantity },
            $set: { updatedAt: new Date() }
          },
          { returnDocument: 'after' }
        );

        if (!updatedProduct) {
          // Lấy thông tin sản phẩm để báo lỗi chi tiết
          const currentProd = await colls.products.findOne({ productId: item.productId });
          const prodName = currentProd ? currentProd.name : item.productId;
          const currentStock = currentProd ? currentProd.stock : 0;
          const err = new Error(`OUT_OF_STOCK: Sản phẩm "${prodName}" không đủ số lượng (Hiện còn: ${currentStock}, yêu cầu: ${item.quantity})`);
          (err as any).statusCode = 409;
          throw err;
        }

        decrementedList.push({ productId: item.productId, quantity: item.quantity });

        const lineTotal = item.quantity * updatedProduct.priceVnd;
        totalVnd += lineTotal;

        orderItems.push({
          productId: updatedProduct.productId,
          nameSnapshot: updatedProduct.name,
          volumeSnapshot: updatedProduct.volume,
          unitPriceVnd: updatedProduct.priceVnd,
          quantity: item.quantity,
          iceQuantity: iceQty,
          lineTotalVnd: lineTotal
        });
      }

      // 5. Tạo đơn hàng và chuyển thẳng sang Quầy tiếp nhận ngay lập tức
      const now = new Date();
      const editableUntil = now; // Bỏ thời gian chờ 60 giây
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      const displayCode = `#TL-${court.code}${randomSuffix}`;
      const orderId = `ord-${Date.now()}-${randomSuffix}`;

      const orderDoc: OrderDoc = {
        orderId,
        displayCode,
        clientRequestId: input.clientRequestId,
        courtId: court.courtId,
        courtNameSnapshot: court.name,
        customerSessionHash: input.sessionHash,
        status: 'accepted', // Đơn vào thẳng Quầy nhận ngay
        totalVnd,
        items: orderItems,
        createdAt: now,
        editableUntil: now,
        acceptedAt: now,
        preparingAt: null,
        deliveredAt: null,
        cancelledAt: null,
        version: 1,
        updatedAt: now
      };

      await colls.orders.insertOne(orderDoc);

      // 6. Ghi nhật ký biến động kho (Audit log)
      const movements: InventoryMovementDoc[] = orderItems.map(item => ({
        productId: item.productId,
        delta: -item.quantity,
        reason: 'order_created',
        orderId,
        operationId: `mov-${orderId}-${item.productId}`,
        stockAfter: 0, // audit marker
        createdAt: now
      }));
      await colls.inventoryMovements.insertMany(movements);

      console.log(`[OrderService] Order ${displayCode} created for ${court.name}, total: ${totalVnd}đ`);
      return orderDoc;
    } catch (error) {
      // COMPENSATING ROLLBACK: Nếu bất kỳ sản phẩm nào thất bại, hoàn trả lại toàn bộ tồn kho đã trừ!
      if (decrementedList.length > 0) {
        console.warn('[OrderService] Error during order placement, rolling back decremented stock...', decrementedList);
        for (const dec of decrementedList) {
          await colls.products.updateOne(
            { productId: dec.productId },
            { $inc: { stock: dec.quantity }, $set: { updatedAt: new Date() } }
          );
        }
      }
      throw error;
    }
  }

  /**
   * Sửa đơn hàng trong 60 giây (BR-09, BR-14)
   */
  static async editOrder(
    sessionHash: string,
    orderId: string,
    newItems: { productId: string; quantity: number; iceQuantity: number }[]
  ): Promise<OrderDoc> {
    const colls = getCollections();
    const order = await colls.orders.findOne({ orderId, customerSessionHash: sessionHash });

    if (!order) {
      const err = new Error('ORDER_NOT_FOUND: Không tìm thấy đơn hàng hoặc không có quyền sở hữu');
      (err as any).statusCode = 404;
      throw err;
    }

    const now = new Date();
    if (now.getTime() >= order.editableUntil.getTime() || order.status !== 'new') {
      const err = new Error('ORDER_EDIT_EXPIRED: Đã hết thời hạn 60 giây để chỉnh sửa đơn');
      (err as any).statusCode = 400;
      throw err;
    }

    // Tính toán độ lệch số lượng (delta = cũ - mới)
    // Nếu delta < 0 (cần lấy thêm): phải kiểm tra stock
    const oldItemsMap = new Map(order.items.map(i => [i.productId, i.quantity]));
    const updatedOrderItems: OrderItemDoc[] = [];
    let newTotalVnd = 0;

    for (const item of newItems) {
      const oldQty = oldItemsMap.get(item.productId) || 0;
      const deltaQty = item.quantity - oldQty; // số chai cần lấy thêm (nếu > 0) hoặc trả lại (nếu < 0)

      if (deltaQty > 0) {
        // Cần lấy thêm: kiểm tra và trừ kho
        const prod = await colls.products.findOneAndUpdate(
          { productId: item.productId, stock: { $gte: deltaQty }, isAvailable: true },
          { $inc: { stock: -deltaQty }, $set: { updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
        if (!prod) {
          const err = new Error(`OUT_OF_STOCK: Sản phẩm ${item.productId} không đủ để thêm vào đơn`);
          (err as any).statusCode = 409;
          throw err;
        }
        const lineTotal = item.quantity * prod.priceVnd;
        newTotalVnd += lineTotal;
        updatedOrderItems.push({
          productId: prod.productId,
          nameSnapshot: prod.name,
          volumeSnapshot: prod.volume,
          unitPriceVnd: prod.priceVnd,
          quantity: item.quantity,
          iceQuantity: Math.min(item.quantity, item.iceQuantity),
          lineTotalVnd: lineTotal
        });
      } else {
        // Giảm hoặc giữ nguyên: hoàn lại kho phần dư
        const prod = await colls.products.findOneAndUpdate(
          { productId: item.productId },
          { $inc: { stock: -deltaQty }, $set: { updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
        if (prod) {
          const lineTotal = item.quantity * prod.priceVnd;
          newTotalVnd += lineTotal;
          updatedOrderItems.push({
            productId: prod.productId,
            nameSnapshot: prod.name,
            volumeSnapshot: prod.volume,
            unitPriceVnd: prod.priceVnd,
            quantity: item.quantity,
            iceQuantity: Math.min(item.quantity, item.iceQuantity),
            lineTotalVnd: lineTotal
          });
        }
      }
    }

    // Hoàn kho cho những sản phẩm bị xóa hẳn khỏi đơn
    const newProductIds = new Set(newItems.map(i => i.productId));
    for (const oldItem of order.items) {
      if (!newProductIds.has(oldItem.productId)) {
        await colls.products.updateOne(
          { productId: oldItem.productId },
          { $inc: { stock: oldItem.quantity }, $set: { updatedAt: new Date() } }
        );
      }
    }

    // Cập nhật đơn hàng (GIỮ NGUYÊN created_at và editable_until theo BR-09!)
    const result = await colls.orders.findOneAndUpdate(
      { orderId },
      {
        $set: {
          items: updatedOrderItems,
          totalVnd: newTotalVnd,
          version: order.version + 1,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return result!;
  }

  /**
   * Hủy đơn hàng trong 60 giây (BR-09, BR-12, BR-14)
   */
  static async cancelOrder(sessionHash: string, orderId: string): Promise<OrderDoc> {
    const colls = getCollections();
    const order = await colls.orders.findOne({ orderId, customerSessionHash: sessionHash });

    if (!order) {
      const err = new Error('ORDER_NOT_FOUND: Không tìm thấy đơn hàng hoặc không có quyền hủy');
      (err as any).statusCode = 404;
      throw err;
    }

    const now = new Date();
    if (now.getTime() >= order.editableUntil.getTime() || order.status !== 'new') {
      const err = new Error('ORDER_CANCEL_EXPIRED: Đã hết thời hạn 60 giây để hủy đơn');
      (err as any).statusCode = 400;
      throw err;
    }

    // Hoàn trả 100% tồn kho
    for (const item of order.items) {
      await colls.products.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity }, $set: { updatedAt: new Date() } }
      );
      await colls.inventoryMovements.insertOne({
        productId: item.productId,
        delta: item.quantity,
        reason: 'order_cancelled',
        orderId,
        operationId: `mov-cancel-${orderId}-${item.productId}`,
        stockAfter: 0,
        createdAt: new Date()
      });
    }

    const updated = await colls.orders.findOneAndUpdate(
      { orderId },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          version: order.version + 1,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    console.log(`[OrderService] Order ${order.displayCode} cancelled by customer within 60s window.`);
    return updated!;
  }

  /**
   * Chuyển trạng thái đơn tại Quầy thu ngân (BR-08, BR-10, BR-22)
   */
  static async transitionOrderStatus(
    orderId: string,
    targetStatus: 'accepted' | 'preparing' | 'delivered'
  ): Promise<OrderDoc> {
    const colls = getCollections();
    const order = await colls.orders.findOne({ orderId });

    if (!order) {
      const err = new Error('ORDER_NOT_FOUND: Đơn hàng không tồn tại');
      (err as any).statusCode = 404;
      throw err;
    }

    const now = new Date();

    if (targetStatus === 'accepted') {
      const updated = await colls.orders.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status: 'accepted',
            acceptedAt: now,
            version: order.version + 1,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );
      return updated!;
    }

    if (targetStatus === 'preparing') {
      const updated = await colls.orders.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status: 'preparing',
            preparingAt: now,
            version: order.version + 1,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );
      return updated!;
    }

    if (targetStatus === 'delivered') {
      if (order.status === 'delivered' || order.status === 'cancelled') {
        const err = new Error('INVALID_TRANSITION: Đơn hàng đã đóng, không thể giao lại');
        (err as any).statusCode = 400;
        throw err;
      }

      // 1-Chạm hoàn tất giao hàng & thu tiền từ bất kỳ trạng thái nào (new, accepted, preparing)
      const updated = await colls.orders.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status: 'delivered',
            deliveredAt: now,
            acceptedAt: order.acceptedAt || now,
            version: order.version + 1,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );
      console.log(`[OrderService] Order ${order.displayCode} delivered & collected ${order.totalVnd}đ`);
      return updated!;
    }

    throw new Error(`UNSUPPORTED_STATUS: Không hỗ trợ trạng thái ${targetStatus}`);
  }

  /**
   * Lấy danh sách đơn mở cho Quầy điều hành (Polling 3-5s)
   */
  static async getActiveOrdersForAdmin(): Promise<OrderDoc[]> {
    const colls = getCollections();
    return colls.orders
      .find({ status: { $in: ['new', 'accepted', 'preparing'] } })
      .sort({ createdAt: 1 })
      .toArray();
  }

  /**
   * Lấy danh sách đơn của Khách hàng hiện tại
   */
  static async getCustomerOrders(sessionHash: string): Promise<OrderDoc[]> {
    const colls = getCollections();
    return colls.orders
      .find({ customerSessionHash: sessionHash })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  }
}
