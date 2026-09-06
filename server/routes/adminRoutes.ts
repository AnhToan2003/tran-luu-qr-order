import { Router, Request, Response } from 'express';
import { OrderService } from '../services/orderService';
import { getCollections } from '../db';

export const adminRouter = Router();

// ==========================================
// 1. ORDERS TAB (QUẦY ĐIỀU HÀNH)
// ==========================================

// GET /api/admin/orders/active — Polling quầy (3-5s)
adminRouter.get('/orders/active', async (_req: Request, res: Response) => {
  try {
    const orders = await OrderService.getActiveOrdersForAdmin();
    const colls = getCollections();
    const delivered = await colls.orders
      .find({ status: 'delivered' })
      .sort({ deliveredAt: -1 })
      .limit(20)
      .toArray();

    const allDisplayOrders = [...orders, ...delivered];

    return res.json(allDisplayOrders.map(o => ({
      id: o.orderId,
      displayCode: o.displayCode,
      courtId: o.courtId,
      courtName: o.courtNameSnapshot,
      status: o.status,
      totalVnd: o.totalVnd,
      createdAt: o.createdAt.getTime(),
      editableUntil: o.editableUntil.getTime(),
      acceptedAt: o.acceptedAt ? o.acceptedAt.getTime() : null,
      preparingAt: o.preparingAt ? o.preparingAt.getTime() : null,
      deliveredAt: o.deliveredAt ? o.deliveredAt.getTime() : null,
      items: o.items.map(i => ({
        productId: i.productId,
        name: i.nameSnapshot,
        volume: i.volumeSnapshot,
        unitPrice: i.unitPriceVnd,
        quantity: i.quantity,
        iceQuantity: i.iceQuantity,
        lineTotal: i.lineTotalVnd
      }))
    })));
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/admin/orders/:id/transition — Chuyển bước quầy
adminRouter.post('/orders/:id/transition', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id as string;
    const { targetStatus } = req.body;

    const updated = await OrderService.transitionOrderStatus(orderId, targetStatus);

    return res.json({
      orderId: updated.orderId,
      displayCode: updated.displayCode,
      status: updated.status,
      acceptedAt: updated.acceptedAt?.getTime(),
      preparingAt: updated.preparingAt?.getTime(),
      deliveredAt: updated.deliveredAt?.getTime()
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ code: err.message.split(':')[0], message: err.message });
  }
});

// ==========================================
// 2. PRODUCTS & INVENTORY (CRUD SẢN PHẨM & KHO)
// ==========================================

// GET /api/admin/products — Danh sách sản phẩm
adminRouter.get('/products', async (_req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const products = await colls.products
      .find({ deletedAt: null })
      .sort({ category: 1, name: 1 })
      .toArray();

    return res.json(products.map(p => ({
      id: p.productId,
      name: p.name,
      volume: p.volume,
      category: p.category,
      priceVnd: p.priceVnd,
      stock: p.stock,
      tag: p.tag,
      isAvailable: p.isAvailable,
      imageSvg: p.imageSvg
    })));
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/admin/products — Thêm sản phẩm mới (BR-18)
adminRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const { name, volume, category, priceVnd, stock, tag, imageSvg } = req.body;

    if (!name || !priceVnd || priceVnd <= 0) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Tên và giá sản phẩm không hợp lệ' });
    }

    const productId = `prod-${Date.now()}`;
    const newProduct = {
      productId,
      name: name.trim(),
      volume: volume ? volume.trim() : 'Chai',
      category: category || 'water',
      priceVnd: parseInt(priceVnd, 10),
      stock: parseInt(stock, 10) || 0,
      tag: tag ? tag.trim() : '',
      imageSvg: imageSvg || '',
      isAvailable: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    await colls.products.insertOne(newProduct as any);
    console.log(`[AdminAPI] Product created: ${newProduct.name} (${newProduct.productId})`);

    return res.status(201).json({
      id: newProduct.productId,
      name: newProduct.name,
      volume: newProduct.volume,
      priceVnd: newProduct.priceVnd,
      stock: newProduct.stock
    });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/admin/products/:id — Cập nhật sản phẩm
adminRouter.patch('/products/:id', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const productId = req.params.id as string;
    const { name, volume, category, priceVnd, tag, isAvailable, stock, imageSvg } = req.body;

    const updateFields: any = { updatedAt: new Date() };
    if (name) updateFields.name = name.trim();
    if (volume) updateFields.volume = volume.trim();
    if (category) updateFields.category = category;
    if (priceVnd !== undefined) updateFields.priceVnd = parseInt(priceVnd, 10);
    if (tag !== undefined) updateFields.tag = tag.trim();
    if (isAvailable !== undefined) updateFields.isAvailable = !!isAvailable;
    if (imageSvg !== undefined) updateFields.imageSvg = imageSvg;

    if (stock !== undefined) {
      const targetStock = Math.max(0, parseInt(stock, 10));
      const current = await colls.products.findOne({ productId });
      if (current && current.stock !== targetStock) {
        const diff = targetStock - current.stock;
        updateFields.stock = targetStock;
        await colls.inventoryMovements.insertOne({
          productId,
          delta: diff,
          reason: 'stock_adjustment',
          operationId: `edit-stock-${productId}-${Date.now()}`,
          stockAfter: targetStock,
          createdAt: new Date()
        });
      }
    }

    const updated = await colls.products.findOneAndUpdate(
      { productId },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' });
    }

    return res.json({
      id: updated.productId,
      name: updated.name,
      priceVnd: updated.priceVnd,
      stock: updated.stock,
      isAvailable: updated.isAvailable
    });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/admin/products/:id — Xóa mềm sản phẩm (BR-18, BR-20)
adminRouter.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const productId = req.params.id as string;

    const updated = await colls.products.findOneAndUpdate(
      { productId },
      { $set: { deletedAt: new Date(), isAvailable: false, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' });
    }

    console.log(`[AdminAPI] Product soft-deleted: ${updated.name}`);
    return res.json({ message: 'Xóa sản phẩm thành công', id: productId });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/admin/products/:id/stock — Nhập hàng / Điều chỉnh tồn
adminRouter.post('/products/:id/stock', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const productId = req.params.id as string;
    const { delta, reason, setAbsoluteStock } = req.body;

    if (setAbsoluteStock !== undefined) {
      // Điều chỉnh tồn tuyệt đối
      const targetStock = Math.max(0, parseInt(setAbsoluteStock, 10));
      const current = await colls.products.findOne({ productId });
      if (!current) return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' });

      const diff = targetStock - current.stock;
      const updated = await colls.products.findOneAndUpdate(
        { productId },
        { $set: { stock: targetStock, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      await colls.inventoryMovements.insertOne({
        productId,
        delta: diff,
        reason: 'stock_adjustment',
        operationId: `stock-adj-${productId}-${Date.now()}`,
        stockAfter: targetStock,
        createdAt: new Date()
      });

      return res.json({ id: updated?.productId, stock: updated?.stock });
    }

    if (typeof delta !== 'number' || delta === 0) {
      return res.status(400).json({ code: 'INVALID_DELTA', message: 'Số lượng biến động không hợp lệ' });
    }

    const updated = await colls.products.findOneAndUpdate(
      { productId, stock: { $gte: -delta } },
      { $inc: { stock: delta }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({ code: 'STOCK_BELOW_ZERO', message: 'Tồn kho không thể nhỏ hơn 0' });
    }

    await colls.inventoryMovements.insertOne({
      productId,
      delta,
      reason: reason || 'stock_intake',
      operationId: `admin-stock-${productId}-${Date.now()}`,
      stockAfter: updated.stock,
      createdAt: new Date()
    });

    return res.json({
      id: updated.productId,
      name: updated.name,
      stock: updated.stock
    });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 3. COURTS & QR CODES (CRUD SÂN & MÃ QR)
// ==========================================

// GET /api/admin/courts — Danh sách sân
adminRouter.get('/courts', async (_req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courts = await colls.courts
      .find({ deletedAt: null })
      .sort({ sortOrder: 1 })
      .toArray();

    return res.json(courts.map(c => ({
      id: c.courtId,
      code: c.code,
      name: c.name,
      isActive: c.isActive,
      sortOrder: c.sortOrder
    })));
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/admin/courts — Thêm sân mới (BR-01)
adminRouter.post('/courts', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Mã sân và tên sân không được để trống' });
    }

    const cleanCode = code.trim().padStart(2, '0');
    const existing = await colls.courts.findOne({ code: cleanCode, deletedAt: null });
    if (existing) {
      return res.status(409).json({ code: 'DUPLICATE_CODE', message: `Sân với mã ${cleanCode} đã tồn tại` });
    }

    const courtCount = await colls.courts.countDocuments({ deletedAt: null });
    const newCourt = {
      courtId: `court-uuid-${cleanCode}`,
      code: cleanCode,
      name: name.trim(),
      sortOrder: courtCount + 1,
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await colls.courts.insertOne(newCourt as any);
    console.log(`[AdminAPI] Court added: ${newCourt.name} (${cleanCode})`);

    return res.status(201).json(newCourt);
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/admin/courts/:id — Sửa tên sân / Bật tắt sân (BR-20)
adminRouter.patch('/courts/:id', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courtId = req.params.id as string;
    const { name, isActive } = req.body;

    const updateFields: any = { updatedAt: new Date() };
    if (name) updateFields.name = name.trim();
    if (isActive !== undefined) updateFields.isActive = !!isActive;

    const updated = await colls.courts.findOneAndUpdate(
      { courtId },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sân' });
    }

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/admin/courts/:id — Xóa sân (BR-21: Chặn xóa sân có đơn mở)
adminRouter.delete('/courts/:id', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courtId = req.params.id as string;

    const court = await colls.courts.findOne({ courtId });
    if (!court) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sân' });
    }

    // BR-21: Kiểm tra xem sân có đơn nào đang mở hay không (kể cả đơn trong 60s, mới, đã nhận, đang chuẩn bị)
    const activeOrdersCount = await colls.orders.countDocuments({
      courtId,
      status: { $in: ['new', 'accepted', 'preparing'] }
    });

    if (activeOrdersCount > 0) {
      return res.status(409).json({
        code: 'COURT_HAS_ACTIVE_ORDERS',
        message: `Không thể xóa ${court.name} vì đang có ${activeOrdersCount} đơn hàng chưa hoàn tất!`
      });
    }

    await colls.courts.findOneAndUpdate(
      { courtId },
      { $set: { deletedAt: new Date(), isActive: false, updatedAt: new Date() } }
    );

    console.log(`[AdminAPI] Court soft-deleted: ${court.name}`);
    return res.json({ message: `Đã xóa ${court.name} thành công`, courtId });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 4. REPORTS & REVENUE (BÁO CÁO DOANH THU & THỐNG KÊ)
// ==========================================

// GET /api/admin/reports/summary — Thống kê doanh thu theo bộ lọc
adminRouter.get('/reports/summary', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const timeFilter = (req.query.timeFilter as string) || 'today'; // 'today', 'yesterday', '7days', 'month', 'all'

    const now = new Date();
    // Tính toán mốc biên ngày giờ Việt Nam (UTC+7)
    let startDate = new Date();

    if (timeFilter === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeFilter === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeFilter === '7days') {
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeFilter === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(0); // All time
    }

    // BR-22: Doanh thu THỰC THU chỉ tính các đơn có status = 'delivered'
    const deliveredOrders = await colls.orders
      .find({
        status: 'delivered',
        deliveredAt: { $gte: startDate }
      })
      .toArray();

    // Các đơn chưa thu tiền (đang mở)
    const uncollectedOrders = await colls.orders
      .find({
        status: { $in: ['new', 'accepted', 'preparing'] }
      })
      .toArray();

    let totalRevenueVnd = 0;
    let totalBottlesDelivered = 0;
    let totalIceServed = 0;
    const courtRevenueMap: Record<string, { name: string; revenue: number; ordersCount: number }> = {};
    const productSalesMap: Record<string, { name: string; bottles: number; revenue: number }> = {};

    for (const ord of deliveredOrders) {
      totalRevenueVnd += ord.totalVnd;

      // Group by Court (BR-23)
      if (!courtRevenueMap[ord.courtId]) {
        courtRevenueMap[ord.courtId] = { name: ord.courtNameSnapshot, revenue: 0, ordersCount: 0 };
      }
      courtRevenueMap[ord.courtId].revenue += ord.totalVnd;
      courtRevenueMap[ord.courtId].ordersCount += 1;

      // Group by Product
      for (const itm of ord.items) {
        totalBottlesDelivered += itm.quantity;
        totalIceServed += itm.iceQuantity;

        if (!productSalesMap[itm.productId]) {
          productSalesMap[itm.productId] = { name: itm.nameSnapshot, bottles: 0, revenue: 0 };
        }
        productSalesMap[itm.productId].bottles += itm.quantity;
        productSalesMap[itm.productId].revenue += itm.lineTotalVnd;
      }
    }

    const uncollectedRevenueVnd = uncollectedOrders.reduce((sum, o) => sum + o.totalVnd, 0);

    // Xếp hạng bán chạy nhất theo số chai
    const bestSellers = Object.values(productSalesMap).sort((a, b) => b.bottles - a.bottles);

    return res.json({
      timeFilter,
      totalRevenueVnd,
      uncollectedRevenueVnd,
      totalOrdersDelivered: deliveredOrders.length,
      totalOrdersUncollected: uncollectedOrders.length,
      totalBottlesDelivered,
      totalIceServed,
      byCourt: Object.values(courtRevenueMap).sort((a, b) => b.revenue - a.revenue),
      bestSellers
    });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/admin/reports/history — Lịch sử đơn hàng (BR-24: Không tự xóa lịch sử)
adminRouter.get('/reports/history', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courtId = req.query.courtId as string;
    const status = req.query.status as string;

    const query: any = {};
    if (courtId && courtId !== 'all') query.courtId = courtId;
    if (status && status !== 'all') query.status = status;

    const orders = await colls.orders
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return res.json(orders.map(o => ({
      id: o.orderId,
      displayCode: o.displayCode,
      courtId: o.courtId,
      courtName: o.courtNameSnapshot,
      status: o.status,
      totalVnd: o.totalVnd,
      createdAt: o.createdAt.getTime(),
      editableUntil: o.editableUntil.getTime(),
      deliveredAt: o.deliveredAt ? o.deliveredAt.getTime() : null,
      cancelledAt: o.cancelledAt ? o.cancelledAt.getTime() : null,
      items: o.items.map(i => ({
        productId: i.productId,
        name: i.nameSnapshot,
        volume: i.volumeSnapshot,
        unitPrice: i.unitPriceVnd,
        quantity: i.quantity,
        iceQuantity: i.iceQuantity,
        lineTotal: i.lineTotalVnd
      }))
    })));
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/admin/settings — Bật/tắt nhận đơn toàn sân (BR-25)
adminRouter.patch('/settings', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const { isAcceptingOrders } = req.body;

    await colls.appSettings.updateOne(
      { key: 'system_config' },
      {
        $set: {
          'value.isAcceptingOrders': !!isAcceptingOrders,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return res.json({ isAcceptingOrders: !!isAcceptingOrders });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/admin/courts/:id/toggle — Bật/tắt nhận đơn cho từng Sân (Set On/Off cho Sân)
adminRouter.patch('/courts/:id/toggle', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courtId = req.params.id as string;

    const court = await colls.courts.findOne({ courtId });
    if (!court) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy sân' });
    }

    const nextActive = court.isActive === false ? true : false;
    const updated = await colls.courts.findOneAndUpdate(
      { courtId },
      { $set: { isActive: nextActive, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    return res.json({
      courtId: updated?.courtId,
      name: updated?.name,
      isActive: updated?.isActive
    });
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/admin/orders/create-for-court — Quầy tạo đơn trực tiếp cho Sân (Set Order cho Sân)
adminRouter.post('/orders/create-for-court', async (req: Request, res: Response) => {
  try {
    const { courtCode, items } = req.body;
    if (!courtCode) {
      return res.status(400).json({ code: 'MISSING_COURT', message: 'Vui lòng chọn sân!' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 'EMPTY_ITEMS', message: 'Vui lòng chọn ít nhất 1 sản phẩm!' });
    }

    const colls = getCollections();
    const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
    if (!court) {
      return res.status(404).json({ code: 'COURT_NOT_FOUND', message: `Không tìm thấy sân ${courtCode}` });
    }

    const decrementedList: { productId: string; quantity: number }[] = [];
    const orderItems: any[] = [];
    let totalVnd = 0;

    try {
      for (const item of items) {
        if (item.quantity < 1) continue;
        const iceQty = Math.max(0, Math.min(item.quantity, item.iceQuantity || 0));

        const updatedProduct = await colls.products.findOneAndUpdate(
          {
            productId: item.productId,
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
          const current = await colls.products.findOne({ productId: item.productId });
          const prodName = current ? current.name : item.productId;
          throw new Error(`Sản phẩm "${prodName}" không đủ tồn kho (còn ${current?.stock || 0}, cần ${item.quantity})`);
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

      if (orderItems.length === 0) {
        throw new Error('Vui lòng chọn số lượng sản phẩm lớn hơn 0');
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const daySeq = (await colls.orders.countDocuments({ createdAt: { $gte: todayStart } })) + 1;
      const displayCode = `#TL-${court.code}${daySeq.toString().padStart(2, '0')}`;
      const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date();

      const newOrder = {
        orderId,
        displayCode,
        courtId: court.courtId,
        courtNameSnapshot: court.name,
        customerSessionHash: 'counter-admin-pos',
        clientRequestId: `admin-pos-${Date.now()}`,
        status: 'accepted', // Quầy tạo trực tiếp nên vào thẳng Đã nhận đơn
        totalVnd,
        items: orderItems,
        createdAt: now,
        editableUntil: now, // Không cần 60s chờ hủy của khách
        acceptedAt: now,
        preparingAt: null,
        deliveredAt: null,
        cancelledAt: null,
        cancelReason: null,
        version: 1
      };

      await colls.orders.insertOne(newOrder as any);

      for (const dec of decrementedList) {
        const prod = await colls.products.findOne({ productId: dec.productId });
        await colls.inventoryMovements.insertOne({
          productId: dec.productId,
          delta: -dec.quantity,
          reason: 'counter_pos_order',
          operationId: `${orderId}-${dec.productId}`,
          stockAfter: prod ? prod.stock : 0,
          createdAt: now
        });
      }

      return res.status(201).json({
        orderId: newOrder.orderId,
        displayCode: newOrder.displayCode,
        courtName: newOrder.courtNameSnapshot,
        status: newOrder.status,
        totalVnd: newOrder.totalVnd,
        createdAt: newOrder.createdAt.getTime(),
        items: newOrder.items
      });
    } catch (err: any) {
      for (const dec of decrementedList) {
        await colls.products.updateOne(
          { productId: dec.productId },
          { $inc: { stock: dec.quantity }, $set: { updatedAt: new Date() } }
        );
      }
      return res.status(400).json({ code: 'CREATE_ORDER_FAILED', message: err.message });
    }
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

