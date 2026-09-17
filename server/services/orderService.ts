import { createHash, randomUUID } from 'node:crypto';
import { getCollections, transaction } from '../db.js';
import { ApiError } from '../errors.js';
import { placeOrderSchema } from '../validation.js';
import { broadcastEvent } from '../websocket.js';
import { invalidateCatalogCache } from '../redis.js';
import { vietnamDate } from '../time.js';
import type { OrderDoc, OrderItemDoc, PaymentAuditRecord } from '../types.js';

export interface OrderPlacementContext {
  sessionHash: string;
  courtCode: string;
  courtId?: string;
  courtNameSnapshot?: string;
}

export class OrderService {
  static async placeOrder(
    context: OrderPlacementContext | string,
    raw: unknown
  ): Promise<OrderDoc> {
    const input = placeOrderSchema.parse(raw);
    const sessionHash = typeof context === 'string' ? context : context.sessionHash;
    const targetCourtCode = (typeof context === 'object' && context.courtCode) ? context.courtCode : input.courtCode;

    if (!targetCourtCode) {
      throw new ApiError(400, 'INVALID_INPUT', 'Thiếu thông tin mã sân để đặt đơn.');
    }

    const fingerprint = createHash('sha256').update(JSON.stringify({
      courtCode: targetCourtCode,
      items: [...input.items].sort((a,b) => a.productId.localeCompare(b.productId))
    })).digest('hex');

    const c = getCollections();
    const existingQuery = { customerSessionHash: sessionHash, clientRequestId: input.clientRequestId };
    const check = (order: OrderDoc) => {
      if (order.requestFingerprint && order.requestFingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã dùng cho giỏ hàng khác');
      }
      return order;
    };
    const existing = await c.orders.findOne(existingQuery);
    if (existing) return check(existing);
    try {
      const createdOrder = await transaction(async session => {
        const duplicate = await c.orders.findOne(existingQuery, { session });
        if (duplicate) return check(duplicate);
        const config = await c.appSettings.findOne({ key: 'system_config' }, { session });
        if (!config || !config.value?.isAcceptingOrders) throw new ApiError(409, 'SHOP_CLOSED', 'Quầy đang tạm dừng nhận đơn');
        const court = await c.courts.findOne({ code: targetCourtCode, isActive: true, deletedAt: null }, { session });
        if (!court) throw new ApiError(404, 'COURT_NOT_FOUND', 'Sân không tồn tại hoặc đang ngừng nhận đơn');
        const orderId = randomUUID();
        const now = new Date();
        const orderItems: OrderItemDoc[] = [];
        for(const item of input.items) {
          const product = await c.products.findOneAndUpdate({productId:item.productId,isAvailable:true,deletedAt:null,stock:{$gte:item.quantity}},{$inc:{stock:-item.quantity,version:1},$set:{updatedAt:now}},{session,returnDocument:'after'});
          if(!product) throw new ApiError(409,'OUT_OF_STOCK','Sản phẩm không còn bán hoặc không đủ tồn kho. Vui lòng cập nhật giỏ hàng.');
          orderItems.push({
            ...item,
            nameSnapshot: product.name,
            volumeSnapshot: product.volume,
            costPriceVnd: product.costPriceVnd || 0,
            unitPriceVnd: product.priceVnd,
            lineTotalVnd: product.priceVnd * item.quantity
          });
          await c.inventoryMovements.insertOne({productId:item.productId,delta:-item.quantity,reason:'order_created',orderId,operationId:`order:${orderId}:${item.productId}`,stockAfter:product.stock,createdAt:now},{session});
        }
        const day = vietnamDate(now).replaceAll('-','');
        const counter = await c.appSettings.findOneAndUpdate({key:`order_sequence:${day}`},{$inc:{'value.sequence':1},$set:{updatedAt:now}},{session,upsert:true,returnDocument:'after'});
        const order: OrderDoc = {
          orderId,
          displayCode:`#TL-${day}-${String(counter!.value.sequence).padStart(4,'0')}`,
          ...existingQuery,
          courtId:court.courtId,
          courtNameSnapshot:court.name,
          customerName: input.customerName || 'Khách tại sân',
          customerPhone: input.customerPhone || '',
          paymentStatus: 'unpaid',
          paidAt: null,
          requestFingerprint:fingerprint,
          items:orderItems,
          totalVnd:orderItems.reduce((sum,i)=>sum+i.lineTotalVnd,0),
          status:'accepted',
          createdAt:now,
          editableUntil: new Date(now.getTime() + 60_000), // createdAt + 60s theo thiết kế
          acceptedAt:now,
          updatedAt:now,
          version:1
        };
        await c.orders.insertOne(order,{session});
        return order;
      });
      broadcastEvent({
        type: 'order_created',
        data: createdOrder,
        sessionHash: createdOrder.customerSessionHash,
        timestamp: new Date().toISOString()
      });
      broadcastEvent({
        type: 'stock_updated',
        timestamp: new Date().toISOString()
      });
      await invalidateCatalogCache();
      return createdOrder;
    } catch(error) {
      if((error as {code?:number}).code === 11000) {
        const winner = await c.orders.findOne(existingQuery);
        if(winner) return check(winner);
      }
      throw error;
    }
  }
  static async updatePayment(
    orderId: string,
    paymentStatus: 'paid' | 'unpaid',
    paymentMethod?: 'cash' | 'transfer' | null,
    changedBy = 'admin',
    reason?: string
  ) {
    const updated = await transaction(async session => {
      const c = getCollections();
      const order = await c.orders.findOne({ orderId }, { session });
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

      const prevStatus = order.paymentStatus || 'unpaid';
      if (prevStatus === 'paid' && paymentStatus === 'unpaid') {
        const trimmedReason = (reason || '').trim();
        if (trimmedReason.length < 3) {
          throw new ApiError(400, 'REASON_REQUIRED', 'Bắt buộc cung cấp lý do khi chuyển đơn đã thanh toán về chưa thanh toán (tối thiểu 3 ký tự)');
        }
      }

      const now = new Date();
      const isPaid = paymentStatus === 'paid';
      const resolvedPaymentMethod = isPaid ? (paymentMethod !== undefined ? paymentMethod : (order.paymentMethod || 'cash')) : null;

      const historyRecord: PaymentAuditRecord = {
        from: prevStatus,
        to: paymentStatus,
        changedBy,
        reason: reason?.trim() || undefined,
        paymentMethod: resolvedPaymentMethod,
        at: now
      };

      const updateDoc: any = {
        $set: {
          paymentStatus,
          paymentMethod: resolvedPaymentMethod,
          paidAt: isPaid ? (order.paidAt || now) : null,
          updatedAt: now
        },
        $inc: { version: 1 }
      };

      if (prevStatus !== paymentStatus || reason) {
        updateDoc.$push = { paymentHistory: historyRecord };
      }

      const res = await c.orders.findOneAndUpdate(
        { orderId, version: order.version },
        updateDoc,
        { session, returnDocument: 'after' }
      );
      if (!res) throw new ApiError(409, 'CONFLICT', 'Đơn vừa được cập nhật, vui lòng tải lại');
      return res;
    });
    broadcastEvent({
      type: 'order_updated',
      data: updated,
      sessionHash: updated.customerSessionHash,
      timestamp: new Date().toISOString()
    });
    return updated;
  }
  static async transition(orderId: string, target: 'preparing'|'delivered') {
    const updated = await transaction(async session => {
      const c = getCollections();
      const order = await c.orders.findOne({orderId},{session});
      if(!order) throw new ApiError(404,'NOT_FOUND','Không tìm thấy đơn');
      if(order.status === target) return order;
      const allowed = target === 'preparing' ? ['new','accepted'] : ['new','accepted','preparing'];
      if(!allowed.includes(order.status)) throw new ApiError(409,'INVALID_TRANSITION','Đơn đã đóng hoặc không thể chuyển ngược trạng thái');
      const now = new Date();
      const res = await c.orders.findOneAndUpdate({orderId,status:order.status,version:order.version},{$set:{status:target,updatedAt:now,...(target==='delivered'?{deliveredAt:now}:{preparingAt:now})},$inc:{version:1}},{session,returnDocument:'after'});
      if(!res) throw new ApiError(409,'CONFLICT','Đơn vừa được cập nhật, vui lòng tải lại');
      return res;
    });
    broadcastEvent({
      type: 'order_updated',
      data: updated,
      sessionHash: updated.customerSessionHash,
      timestamp: new Date().toISOString()
    });
    return updated;
  }
  static async deliverAndPay(
    orderId: string,
    paymentStatus: 'paid' | 'unpaid',
    paymentMethod?: 'cash' | 'transfer' | null,
    changedBy = 'admin',
    reason?: string
  ) {
    const updated = await transaction(async session => {
      const c = getCollections();
      const order = await c.orders.findOne({ orderId }, { session });
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');
      if (order.status === 'cancelled') throw new ApiError(409, 'INVALID_TRANSITION', 'Đơn đã bị hủy');
      const now = new Date();
      const isPaid = paymentStatus === 'paid';
      const resolvedPaymentMethod = isPaid ? (paymentMethod !== undefined ? paymentMethod : (order.paymentMethod || 'cash')) : null;
      const prevStatus = order.paymentStatus || 'unpaid';

      if (prevStatus === 'paid' && paymentStatus === 'unpaid') {
        if (!reason || reason.trim().length < 3) {
          throw new ApiError(400, 'REASON_REQUIRED', 'Bắt buộc nhập lý do khi chuyển trạng thái từ Đã thanh toán sang Chưa thanh toán (tối thiểu 3 ký tự).');
        }
      }

      const updateDoc: any = {
        $set: {
          status: 'delivered',
          paymentStatus,
          paymentMethod: resolvedPaymentMethod,
          paidAt: isPaid ? (order.paidAt || now) : null,
          deliveredAt: order.deliveredAt || now,
          updatedAt: now
        },
        $inc: { version: 1 }
      };

      if (prevStatus !== paymentStatus) {
        const historyRecord: PaymentAuditRecord = {
          from: prevStatus,
          to: paymentStatus,
          changedBy,
          reason: reason?.trim() || 'deliver_and_pay',
          paymentMethod: resolvedPaymentMethod,
          at: now
        };
        updateDoc.$push = { paymentHistory: historyRecord };
      }

      const res = await c.orders.findOneAndUpdate(
        { orderId, version: order.version },
        updateDoc,
        { session, returnDocument: 'after' }
      );
      if (!res) throw new ApiError(409, 'CONFLICT', 'Đơn vừa được cập nhật, vui lòng tải lại');
      return res;
    });
    broadcastEvent({
      type: 'order_updated',
      data: updated,
      sessionHash: updated.customerSessionHash,
      timestamp: new Date().toISOString()
    });
    return updated;
  }
  static async cancel(orderId: string, reason: string, admin: string) {
    const updated = await transaction(async session=>{
      const c = getCollections();
      const order = await c.orders.findOne({orderId},{session});
      if(!order) throw new ApiError(404,'NOT_FOUND','Không tìm thấy đơn');
      if(order.status === 'cancelled') return order;
      if(order.status === 'delivered') throw new ApiError(409,'ORDER_CLOSED','Không thể hủy đơn đã giao và thu tiền');
      const now = new Date();
      const res = await c.orders.findOneAndUpdate({orderId,status:order.status,version:order.version},{$set:{status:'cancelled',cancelReason:reason,cancelledBy:admin,cancelledAt:now,updatedAt:now},$inc:{version:1}},{session,returnDocument:'after'});
      if(!res) throw new ApiError(409,'CONFLICT','Đơn vừa được cập nhật');
      for(const item of order.items) {
        const product = await c.products.findOneAndUpdate({productId:item.productId},{$inc:{stock:item.quantity,version:1},$set:{updatedAt:now}},{session,returnDocument:'after'});
        if(!product) throw new ApiError(409,'PRODUCT_MISSING','Không tìm thấy sản phẩm để hoàn kho');
        await c.inventoryMovements.insertOne({productId:item.productId,delta:item.quantity,reason:'order_cancelled',orderId,operationId:`cancel:${orderId}:${item.productId}`,stockAfter:product.stock,createdAt:now},{session});
      }
      return res;
    });
    broadcastEvent({
      type: 'order_updated',
      data: updated,
      sessionHash: updated.customerSessionHash,
      timestamp: new Date().toISOString()
    });
    broadcastEvent({
      type: 'stock_updated',
      timestamp: new Date().toISOString()
    });
    await invalidateCatalogCache();
    return updated;
  }
}
