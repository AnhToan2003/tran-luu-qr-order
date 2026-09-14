import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { getCollections, transaction } from '../db.js';
import { ApiError } from '../errors.js';
import { OrderService } from '../services/orderService.js';
import { orderJson, productJson } from '../serialize.js';
import { dateRange, vietnamDate } from '../time.js';
import { courtCode, id, productFields, productPatch, stock, items as itemsSchema } from '../validation.js';
import { signCourtCode } from '../services/qrSign.js';
import { broadcastEvent } from '../websocket.js';
import type { AuditLogDoc, OrderDoc, OrderItemDoc } from '../types.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

async function recordAuditLog(
  adminUsername: string,
  action: AuditLogDoc['action'],
  targetId?: string,
  details: Record<string, unknown> = {},
  ip?: string
) {
  try {
    const c = getCollections();
    await c.auditLogs.insertOne({
      auditId: randomUUID(),
      adminUsername: adminUsername || 'admin',
      action,
      targetId,
      details,
      ip,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[AuditLog] Error recording log:', (err as Error).message);
  }
}

adminRouter.get('/settings', async (_req, res) => res.json((await getCollections().appSettings.findOne({ key: 'system_config' }))?.value));
adminRouter.patch('/settings', async (req, res) => {
  const value = z.object({ isAcceptingOrders: z.boolean() }).strict().parse(req.body);
  await getCollections().appSettings.updateOne({ key: 'system_config' }, { $set: { 'value.isAcceptingOrders': value.isAcceptingOrders, updatedAt: new Date() } });
  await recordAuditLog(res.locals.admin, 'settings_update', 'system_config', { isAcceptingOrders: value.isAcceptingOrders }, req.ip);
  res.json(value);
});

adminRouter.get('/orders/active', async (_req, res) => {
  const c = getCollections();
  const open = await c.orders.find({ status: { $in: ['new', 'accepted', 'preparing'] } }).sort({ createdAt: 1 }).toArray();
  // Bao gồm tất cả các đơn nợ chưa thanh toán từ mọi ngày trước + đơn đã thanh toán giao trong hôm nay
  // Giới hạn 1000 để tránh response khổng lồ khi có nhiều nợ cũ tích lũy
  const delivered = await c.orders.find({
    $or: [
      { status: 'delivered', paymentStatus: { $ne: 'paid' } },
      { status: 'delivered', paymentStatus: 'paid', deliveredAt: dateRange('today') }
    ]
  }).sort({ deliveredAt: -1, createdAt: -1 }).limit(1000).toArray();
  res.json([...open, ...delivered].map(orderJson));
});

adminRouter.post('/orders/:id/payment', async (req, res) => {
  const { paymentStatus } = z.object({ paymentStatus: z.enum(['paid', 'unpaid']) }).strict().parse(req.body);
  const updated = await OrderService.updatePayment(id.parse(req.params.id), paymentStatus);
  await recordAuditLog(res.locals.admin, 'order_update', req.params.id, { paymentStatus }, req.ip);
  res.json(orderJson(updated));
});

adminRouter.post('/orders/:id/transition', async (req, res) => {
  const { targetStatus } = z.object({ targetStatus: z.enum(['preparing', 'delivered']) }).strict().parse(req.body);
  res.json(orderJson(await OrderService.transition(id.parse(req.params.id), targetStatus)));
});

adminRouter.post('/orders/:id/deliver-and-pay', async (req, res) => {
  const { paymentStatus } = z.object({ paymentStatus: z.enum(['paid', 'unpaid']) }).strict().parse(req.body);
  const order = await OrderService.deliverAndPay(id.parse(req.params.id), paymentStatus);
  await recordAuditLog(res.locals.admin, 'order_update', req.params.id, { action: 'deliver_and_pay', paymentStatus, totalVnd: order.totalVnd }, req.ip);
  res.json(orderJson(order));
});

adminRouter.post('/orders/:id/cancel', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).strict().parse(req.body);
  const cancelled = await OrderService.cancel(id.parse(req.params.id), reason, res.locals.admin);
  await recordAuditLog(res.locals.admin, 'order_cancel', req.params.id, { reason, courtName: cancelled.courtNameSnapshot, totalVnd: cancelled.totalVnd }, req.ip);
  res.json(orderJson(cancelled));
});

adminRouter.post('/orders/create-pos', async (req, res) => {
  const schema = z.object({
    clientRequestId: id,
    items: itemsSchema
  }).strict();

  const input = schema.parse(req.body);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    type: 'pos',
    items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))
  })).digest('hex');

  const c = getCollections();
  const existingQuery = {
    customerSessionHash: `admin:${res.locals.admin}`,
    clientRequestId: input.clientRequestId
  };

  const check = (order: OrderDoc) => {
    if (order.requestFingerprint && order.requestFingerprint !== fingerprint) {
      throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã dùng cho giỏ hàng khác');
    }
    return order;
  };

  const existing = await c.orders.findOne(existingQuery);
  if (existing) {
    return res.json(orderJson(check(existing)));
  }

  try {
    const order = await transaction(async session => {
      const duplicate = await c.orders.findOne(existingQuery, { session });
      if (duplicate) return check(duplicate);

      const now = new Date();
      const orderId = randomUUID();
      const orderItems: OrderItemDoc[] = [];

      for (const item of input.items) {
        const product = await c.products.findOneAndUpdate(
          { productId: item.productId, isAvailable: true, deletedAt: null, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, version: 1 }, $set: { updatedAt: now } },
          { session, returnDocument: 'after' }
        );
        if (!product) {
          throw new ApiError(409, 'OUT_OF_STOCK', 'Sản phẩm không đủ tồn kho để bán tại quầy');
        }

        orderItems.push({
          productId: item.productId,
          nameSnapshot: product.name,
          volumeSnapshot: product.volume,
          costPriceVnd: product.costPriceVnd || 0,
          unitPriceVnd: product.priceVnd,
          quantity: item.quantity,
          iceQuantity: item.iceQuantity,
          lineTotalVnd: product.priceVnd * item.quantity
        });

        await c.inventoryMovements.insertOne({
          productId: item.productId,
          delta: -item.quantity,
          reason: 'counter_pos_order',
          orderId,
          operationId: `pos:${orderId}:${item.productId}`,
          stockAfter: product.stock,
          createdAt: now,
          productNameSnapshot: product.name,
          volumeSnapshot: product.volume,
          costPriceVnd: product.costPriceVnd || 0,
          sellingPriceVnd: product.priceVnd,
          totalCostVnd: (product.costPriceVnd || 0) * item.quantity,
          note: 'Bán trực tiếp tại quầy POS'
        }, { session });
      }

      const totalVnd = orderItems.reduce((acc, i) => acc + i.lineTotalVnd, 0);
      const day = vietnamDate(now).replaceAll('-', '');
      const counter = await c.appSettings.findOneAndUpdate(
        { key: `order_sequence:pos:${day}` },
        { $inc: { 'value.sequence': 1 }, $set: { updatedAt: now } },
        { session, upsert: true, returnDocument: 'after' }
      );
      const seq = counter?.value?.sequence || 1;
      const displayCode = `#TL-POS-${day}-${String(seq).padStart(4, '0')}`;

      const newOrder: OrderDoc = {
        orderId,
        displayCode,
        courtId: 'counter',
        courtNameSnapshot: 'Tại quầy',
        customerName: 'Khách tại quầy',
        customerPhone: '',
        customerSessionHash: `admin:${res.locals.admin}`,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        status: 'delivered',
        paymentStatus: 'paid',
        paidAt: now,
        totalVnd,
        items: orderItems,
        createdAt: now,
        editableUntil: now,
        acceptedAt: now,
        preparingAt: now,
        deliveredAt: now,
        cancelledAt: null,
        version: 1,
        updatedAt: now
      };

      await c.orders.insertOne(newOrder, { session });
      return newOrder;
    });

    await recordAuditLog(res.locals.admin, 'order_create', order.orderId, {
      courtName: 'Tại quầy (POS)',
      totalVnd: order.totalVnd,
      status: 'delivered',
      paymentStatus: 'paid'
    }, req.ip);

    broadcastEvent({
      type: 'stock_updated',
      timestamp: new Date().toISOString()
    });

    res.status(201).json(orderJson(order));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const winner = await c.orders.findOne(existingQuery);
      if (winner) return res.json(orderJson(check(winner)));
    }
    throw error;
  }
});
adminRouter.post('/orders/create-for-court',async(req,res)=>{
  const order = await OrderService.placeOrder(`admin:${res.locals.admin}`,req.body);
  await recordAuditLog(res.locals.admin, 'order_create', order.orderId, { courtName: order.courtNameSnapshot, totalVnd: order.totalVnd }, req.ip);
  res.status(201).json(orderJson(order));
});

adminRouter.get('/products',async(_req,res)=>res.json((await getCollections().products.find({deletedAt:null}).sort({category:1,name:1}).toArray()).map(productJson)));
adminRouter.post('/products',async(req,res)=>{
  const input = productFields.strict().parse(req.body);
  const now = new Date();
  const product = {...input,productId:randomUUID(),createdAt:now,updatedAt:now,deletedAt:null,version:1};
  await transaction(async session=>{
    const c = getCollections();
    await c.products.insertOne(product,{session});
    if(product.stock) await c.inventoryMovements.insertOne({
      productId:product.productId,
      delta:product.stock,
      reason:'stock_intake',
      operationId:randomUUID(),
      stockAfter:product.stock,
      createdAt:now,
      productNameSnapshot: product.name,
      volumeSnapshot: product.volume,
      costPriceVnd: product.costPriceVnd ?? 0,
      sellingPriceVnd: product.priceVnd,
      totalCostVnd: (product.costPriceVnd ?? 0) * product.stock,
      note: 'Khởi tạo sản phẩm mới'
    },{session});
  });
  await recordAuditLog(res.locals.admin, 'product_create', product.productId, { name: product.name, priceVnd: product.priceVnd, stock: product.stock }, req.ip);
  res.status(201).json(productJson(product));
});
adminRouter.patch('/products/:id',async(req,res)=>{
  const input = productPatch.parse(req.body);
  const productId = id.parse(req.params.id);
  const updated = await transaction(async session=>{
    const c = getCollections();
    const current = await c.products.findOne({productId,deletedAt:null},{session});
    if(!current) throw new ApiError(404,'NOT_FOUND','Không tìm thấy sản phẩm');
    const {expectedStock,...fields} = input;
    if(fields.stock !== undefined && expectedStock !== current.stock) throw new ApiError(409,'STOCK_CHANGED','Tồn kho vừa thay đổi. Vui lòng tải lại trước khi điều chỉnh.');
    const now = new Date();
    const result = await c.products.findOneAndUpdate({productId,version:current.version},{$set:{...fields,updatedAt:now},$inc:{version:1}},{session,returnDocument:'after'});
    if(!result) throw new ApiError(409,'CONFLICT','Sản phẩm vừa thay đổi');
    if(fields.stock !== undefined && fields.stock !== current.stock) await c.inventoryMovements.insertOne({productId,delta:fields.stock-current.stock,reason:'stock_adjustment',operationId:randomUUID(),stockAfter:fields.stock,createdAt:now},{session});
    return result;
  });
  await recordAuditLog(res.locals.admin, 'product_update', productId, { name: updated.name, changes: input }, req.ip);
  broadcastEvent({ type: 'stock_updated', data: { productId, stock: updated.stock }, timestamp: new Date().toISOString() });
  res.json(productJson(updated));
});
adminRouter.delete('/products/:id',async(req,res)=>{
  const productId = id.parse(req.params.id);
  const updated = await getCollections().products.findOneAndUpdate({productId,deletedAt:null},{$set:{deletedAt:new Date(),isAvailable:false,updatedAt:new Date()},$inc:{version:1}},{returnDocument:'after'});
  if(!updated) throw new ApiError(404,'NOT_FOUND','Không tìm thấy sản phẩm');
  await recordAuditLog(res.locals.admin, 'product_delete', productId, { name: updated.name }, req.ip);
  res.json({id:updated.productId});
});
adminRouter.get('/products/:id/movements',async(req,res)=>{
  res.json(await getCollections().inventoryMovements.find({productId:id.parse(req.params.id)}).sort({createdAt:-1}).limit(100).toArray());
});
adminRouter.post('/products/:id/stock',async(req,res)=>{
  const input = z.object({
    clientRequestId: id,
    delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    setAbsoluteStock: stock.optional(),
    expectedStock: stock.optional(),
    costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    note: z.string().trim().max(200).optional(),
    reason: z.enum(['stock_intake','stock_adjustment','quick_restock']).default('stock_intake')
  }).strict()
    .refine(v=>(v.delta !== undefined)!==(v.setAbsoluteStock !== undefined),'Chọn nhập kho hoặc đặt tồn kho').parse(req.body);
  const productId = id.parse(req.params.id);
  const operationId = `stock:${res.locals.admin}:${input.clientRequestId}`;
  const result = await transaction(async session=>{
    const c = getCollections();
    const receipt = await c.inventoryMovements.findOne({operationId},{session});
    if(receipt) {
      if(receipt.productId !== productId) throw new ApiError(409,'REQUEST_CONFLICT','Mã yêu cầu đã được sử dụng');
      return {id:productId,stock:receipt.stockAfter};
    }
    const current = await c.products.findOne({productId,deletedAt:null},{session});
    if(!current) throw new ApiError(404,'NOT_FOUND','Không tìm thấy sản phẩm');
    if(input.setAbsoluteStock !== undefined && current.stock !== input.expectedStock) throw new ApiError(409,'STOCK_CHANGED','Tồn kho đã thay đổi. Vui lòng tải lại.');
    const nextStock = stock.parse(input.setAbsoluteStock ?? current.stock+input.delta!);
    const now = new Date();
    const delta = nextStock - current.stock;

    const productUpdate: Record<string, any> = { stock: nextStock, updatedAt: now };
    if (input.costPriceVnd !== undefined) {
      productUpdate.costPriceVnd = input.costPriceVnd;
    }
    if (input.sellingPriceVnd !== undefined) {
      productUpdate.priceVnd = input.sellingPriceVnd;
    }

    await c.products.updateOne({productId},{$set:productUpdate,$inc:{version:1}},{session});

    const activeCostPrice = input.costPriceVnd ?? current.costPriceVnd ?? 0;
    const activeSellingPrice = input.sellingPriceVnd ?? current.priceVnd;
    const totalCostVnd = delta > 0 ? activeCostPrice * delta : 0;

    await c.inventoryMovements.insertOne({
      productId,
      delta,
      reason: input.reason,
      operationId,
      stockAfter: nextStock,
      createdAt: now,
      productNameSnapshot: current.name,
      volumeSnapshot: current.volume,
      costPriceVnd: activeCostPrice,
      sellingPriceVnd: activeSellingPrice,
      totalCostVnd,
      note: input.note
    },{session});
    return {id:productId,stock:nextStock,costPriceVnd:activeCostPrice,sellingPriceVnd:activeSellingPrice};
  });
  await recordAuditLog(res.locals.admin, 'stock_adjustment', productId, { reason: input.reason, stockAfter: result.stock }, req.ip);
  broadcastEvent({ type: 'stock_updated', data: { productId, stock: result.stock }, timestamp: new Date().toISOString() });
  res.json(result);
});

adminRouter.get('/inventory/intake-history', async (req, res) => {
  const c = getCollections();
  const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 500);
  const skip = (page - 1) * limit;

  const query: any = {
    delta: { $gt: 0 },
    reason: { $nin: ['order_cancelled', 'order_refunded'] }
  };
  if (req.query.productId && req.query.productId !== 'all') {
    query.productId = String(req.query.productId);
  }

  const timePreset = String(req.query.timePreset || 'all');
  if (timePreset !== 'all') {
    const now = new Date();
    if (timePreset === 'today') {
      query.createdAt = dateRange('today');
    } else if (timePreset === '7days') {
      query.createdAt = { $gte: new Date(now.getTime() - 7 * 86400000) };
    } else if (timePreset === '30days') {
      query.createdAt = { $gte: new Date(now.getTime() - 30 * 86400000) };
    }
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    query.$or = [
      { productNameSnapshot: regex },
      { note: regex },
      { operationId: regex }
    ];
  }

  const [aggregationResult] = await c.inventoryMovements.aggregate([
    { $match: query },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalBatches: { $sum: 1 },
              totalQuantity: { $sum: '$delta' },
              totalCostValueVnd: { $sum: { $ifNull: ['$totalCostVnd', { $multiply: ['$costPriceVnd', '$delta'] }] } },
              totalExpectedRevenueVnd: { $sum: { $multiply: ['$sellingPriceVnd', '$delta'] } }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit }
        ]
      }
    }
  ]).toArray();

  const totalBatches = aggregationResult?.summary[0]?.totalBatches || 0;
  const totalQuantity = aggregationResult?.summary[0]?.totalQuantity || 0;
  const totalCostValue = aggregationResult?.summary[0]?.totalCostValueVnd || 0;
  const totalExpectedRevenue = aggregationResult?.summary[0]?.totalExpectedRevenueVnd || 0;
  const totalExpectedProfit = totalExpectedRevenue - totalCostValue;
  const overallMarginPct = totalExpectedRevenue > 0 ? Math.round(((totalExpectedProfit / totalExpectedRevenue) * 100) * 10) / 10 : 0;
  const totalItems = aggregationResult?.totalCount[0]?.count || 0;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  const rawItems = aggregationResult?.items || [];
  const productIds = Array.from(new Set<string>(rawItems.map((m: any) => String(m.productId))));
  const products = await c.products.find({ productId: { $in: productIds } }).toArray();
  const productMap = new Map(products.map(p => [p.productId, p]));

  const items = rawItems.map((m: any) => {
    const product = productMap.get(m.productId);
    const productName = m.productNameSnapshot || product?.name || 'Sản phẩm';
    const volume = m.volumeSnapshot || product?.volume || '';
    const costPrice = m.costPriceVnd ?? product?.costPriceVnd ?? 0;
    const sellingPrice = m.sellingPriceVnd ?? product?.priceVnd ?? 0;
    const quantity = m.delta;
    const totalCost = m.totalCostVnd ?? (costPrice * quantity);
    const expectedRevenue = sellingPrice * quantity;
    const profitMarginVnd = expectedRevenue - totalCost;

    return {
      id: m._id ? m._id.toString() : m.operationId,
      operationId: m.operationId,
      productId: m.productId,
      productName,
      volume,
      reason: m.reason,
      quantity,
      costPriceVnd: costPrice,
      sellingPriceVnd: sellingPrice,
      totalCostVnd: totalCost,
      expectedRevenueVnd: expectedRevenue,
      profitMarginVnd,
      profitMarginPct: expectedRevenue > 0 ? Math.round(((profitMarginVnd / expectedRevenue) * 100) * 10) / 10 : 0,
      stockAfter: m.stockAfter,
      note: m.note || (m.reason === 'stock_intake' ? 'Nhập hàng vào kho' : 'Điều chỉnh tồn kho tăng'),
      createdAt: m.createdAt
    };
  });

  res.json({
    items,
    page,
    limit,
    totalItems,
    totalPages,
    summary: {
      totalBatches,
      totalQuantity,
      totalCostValueVnd: totalCostValue,
      totalExpectedRevenueVnd: totalExpectedRevenue,
      totalExpectedProfitVnd: totalExpectedProfit,
      overallMarginPct
    }
  });
});

adminRouter.get('/courts', async (_req, res) => {
  const courts = await getCollections().courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray();
  res.json(courts.map(c => ({
    id: c.courtId,
    code: c.code,
    name: c.name,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    sig: signCourtCode(c.code)
  })));
});
adminRouter.post('/courts',async(req,res)=>{
  const input = z.object({code:courtCode,name:z.string().trim().min(1).max(100)}).strict().parse(req.body);
  const c = getCollections();
  const existing = await c.courts.findOne({code:input.code});
  if(existing) throw new ApiError(409,'DUPLICATE_CODE','Mã sân đã tồn tại trong hệ thống, vui lòng dùng mã khác');
  const now = new Date();
  const court = {...input,courtId:randomUUID(),sortOrder:Number(input.code),isActive:true,deletedAt:null,createdAt:now,updatedAt:now};
  await c.courts.insertOne(court);
  res.status(201).json({id:court.courtId,...input,isActive:true});
});
adminRouter.patch('/courts/:id',async(req,res)=>{
  const input = z.object({name:z.string().trim().min(1).max(100).optional(),isActive:z.boolean().optional()}).strict().parse(req.body);
  const result = await getCollections().courts.findOneAndUpdate({courtId:id.parse(req.params.id),deletedAt:null},{$set:{...input,updatedAt:new Date()}},{returnDocument:'after'});
  if(!result) throw new ApiError(404,'NOT_FOUND','Không tìm thấy sân');
  res.json({id:result.courtId,code:result.code,name:result.name,isActive:result.isActive});
});
adminRouter.delete('/courts/:id',async(req,res)=>{
  const courtId = id.parse(req.params.id);
  await transaction(async session=>{
    const c = getCollections();
    const court = await c.courts.findOneAndUpdate({courtId,deletedAt:null},{$set:{deletedAt:new Date(),isActive:false,updatedAt:new Date()}},{session});
    if(!court) throw new ApiError(404,'NOT_FOUND','Không tìm thấy sân');
    if(await c.orders.countDocuments({courtId,status:{$in:['new','accepted','preparing']}},{session})) throw new ApiError(409,'COURT_HAS_ACTIVE_ORDERS','Sân đang có đơn chưa hoàn tất');
  });
  res.json({courtId});
});

adminRouter.get('/reports/history',async(req,res)=>{
  const query = z.object({
    courtId: id.optional(),
    status: z.enum(['all','new','accepted','preparing','delivered','cancelled']).optional(),
    paymentStatus: z.enum(['all','unpaid','paid']).optional(),
    timePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    before: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    page: z.coerce.number().int().min(1).optional(),
    cursor: id.optional()
  }).parse(req.query);

  const baseFilter: Record<string,unknown> = {};
  if(query.courtId && query.courtId !== 'all') baseFilter.courtId = query.courtId;
  if(query.status && query.status !== 'all') baseFilter.status = query.status;
  if(query.paymentStatus && query.paymentStatus !== 'all') baseFilter.paymentStatus = query.paymentStatus;

  if (query.startDate || query.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (query.startDate) dateFilter.$gte = new Date(query.startDate + 'T00:00:00+07:00');
    if (query.endDate) dateFilter.$lte = new Date(query.endDate + 'T23:59:59.999+07:00');
    baseFilter.createdAt = dateFilter;
  } else if (query.timePreset && ['today', 'yesterday', '7days', 'month'].includes(query.timePreset)) {
    baseFilter.createdAt = dateRange(query.timePreset as any);
  }

  if (query.search && query.search.trim()) {
    const q = query.search.trim();
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    baseFilter.$or = [
      { displayCode: regex },
      { 'items.nameSnapshot': regex },
      { courtNameSnapshot: regex },
      { customerName: regex },
      { customerPhone: regex }
    ];
  }

  const c = getCollections();

  // Aggregate summary stats for the filtered set (without pagination cursor)
  const [summaryAgg] = await c.orders.aggregate([
    { $match: baseFilter },
    {
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenueVnd: {
                $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$totalVnd', 0] }
              }
            }
          }
        ],
        bottles: [
          { $unwind: '$items' },
          {
            $group: {
              _id: null,
              totalBottles: { $sum: '$items.quantity' },
              totalIce: { $sum: '$items.iceQuantity' }
            }
          }
        ]
      }
    }
  ]).toArray();

  const totalMatched = summaryAgg?.stats?.[0]?.totalOrders || 0;
  const totalRevenueVnd = summaryAgg?.stats?.[0]?.totalRevenueVnd || 0;
  const totalBottles = summaryAgg?.bottles?.[0]?.totalBottles || 0;

  const queryFilter: Record<string, unknown> = { ...baseFilter };
  if(query.cursor) {
    const cursorOrder = await c.orders.findOne({orderId:query.cursor});
    if(!cursorOrder) throw new ApiError(400,'INVALID_CURSOR','Mốc lịch sử không hợp lệ');
    const cursorCond = [{createdAt:{$lt:cursorOrder.createdAt}},{createdAt:cursorOrder.createdAt,orderId:{$lt:cursorOrder.orderId}}];
    if (queryFilter.$or) {
      queryFilter.$and = [{ $or: queryFilter.$or }, { $or: cursorCond }];
      delete queryFilter.$or;
    } else {
      queryFilter.$or = cursorCond;
    }
  }

  const pageNumber = query.page || 1;
  const pageSize = query.limit;
  const skip = query.cursor ? 0 : (pageNumber - 1) * pageSize;
  const list = await c.orders.find(queryFilter).sort({createdAt:-1,orderId:-1}).skip(skip).limit(pageSize + 1).toArray();
  const page = list.slice(0, pageSize);

  res.json({
    orders: page.map(orderJson),
    nextCursor: list.length > pageSize ? page.at(-1)!.orderId : null,
    totalMatched,
    page: pageNumber,
    totalPages: Math.ceil(totalMatched / pageSize) || 1,
    limit: pageSize,
    summary: {
      totalRevenueVnd,
      totalBottles
    }
  });
});
adminRouter.get('/reports/summary',async(req,res)=>{
  const timeFilter = z.enum(['today','yesterday','7days','month','all']).default('today').parse(req.query.timeFilter);
  const c = getCollections();
  const pipeline = [{$match:{status:'delivered',deliveredAt:dateRange(timeFilter)}},{$facet:{
    totals:[{$group:{_id:null,revenue:{$sum:'$totalVnd'},orders:{$sum:1}}}],
    courts:[{$group:{_id:'$courtId',name:{$last:'$courtNameSnapshot'},revenue:{$sum:'$totalVnd'},ordersCount:{$sum:1}}},{$sort:{revenue:-1}}],
    products:[{$unwind:'$items'},{$group:{
      _id:'$items.productId',
      name:{$last:'$items.nameSnapshot'},
      bottles:{$sum:'$items.quantity'},
      ice:{$sum:'$items.iceQuantity'},
      revenue:{$sum:'$items.lineTotalVnd'},
      cost:{$sum:{$multiply:[{$ifNull:['$items.costPriceVnd',0]},'$items.quantity']}}
    }},{$sort:{revenue:-1}}]
  }}];
  const [[summary], [pending], [unpaid]] = await Promise.all([
    c.orders.aggregate(pipeline).toArray(),
    c.orders.aggregate([{$match:{status:{$in:['new','accepted','preparing']}}},{$group:{_id:null,total:{$sum:'$totalVnd'},count:{$sum:1}}}]).toArray(),
    c.orders.aggregate([{$match:{paymentStatus:'unpaid',status:{$ne:'cancelled'}}},{$group:{_id:null,total:{$sum:'$totalVnd'},count:{$sum:1}}}]).toArray()
  ]);
  
  const rawProducts = summary?.products || [];
  const products = rawProducts.map((p: any) => {
    const cost = p.cost || 0;
    const revenue = p.revenue || 0;
    const profit = revenue - cost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
    return {
      ...p,
      cost,
      profit,
      profitMargin: margin
    };
  });

  const totalRevenueVnd = summary?.totals[0]?.revenue || 0;
  const totalCostVnd = products.reduce((acc: number, p: any) => acc + (p.cost || 0), 0);
  const totalProfitVnd = totalRevenueVnd - totalCostVnd;
  const overallMargin = totalRevenueVnd > 0 ? Math.round((totalProfitVnd / totalRevenueVnd) * 1000) / 10 : 0;

  res.json({
    timeFilter,
    totalRevenueVnd,
    totalCostVnd,
    totalProfitVnd,
    profitMarginPercent: overallMargin,
    totalOrdersDelivered: summary?.totals[0]?.orders || 0,
    uncollectedRevenueVnd: pending?.total || 0,
    totalOrdersUncollected: pending?.count || 0,
    unpaidRevenueVnd: unpaid?.total || 0,
    unpaidOrdersCount: unpaid?.count || 0,
    totalBottlesDelivered: products.reduce((n:number,p:{bottles:number})=>n+p.bottles,0),
    byCourt: summary?.courts || [],
    bestSellers: products
  });
});


// ===== SAFE DATA CLEAN / PURGE HELPER =====
function parseCleanDateFilter(input: {
  startDate?: string;
  endDate?: string;
  customDate?: string;
  beforeDate?: string;
  days?: string;
  before?: string;
}): { dateFilter: Record<string, Date>; rangeLabel: string; beforeDateIso: string } {
  // 1. Toàn bộ đơn cũ đã xong
  if (input.days === 'all' || input.days === '0') {
    return {
      dateFilter: { $lte: new Date() },
      rangeLabel: 'Toàn bộ đơn cũ đã xong & nhật ký',
      beforeDateIso: new Date().toISOString()
    };
  }

  // 2. Chọn ngày cụ thể (tùy chỉnh mốc hoặc khoảng ngày)
  const startDateStr = input.startDate?.trim() || '';
  const endDateStr = input.endDate?.trim() || input.customDate?.trim() || '';
  if (startDateStr || endDateStr) {
    const filter: Record<string, Date> = {};
    if (startDateStr) filter.$gte = new Date(startDateStr + 'T00:00:00+07:00');
    if (endDateStr) filter.$lte = new Date(endDateStr + 'T23:59:59.999+07:00');
    const label = startDateStr && endDateStr
      ? `Từ ${new Date(startDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')} đến ${new Date(endDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`
      : startDateStr
      ? `Từ ngày ${new Date(startDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`
      : `Trước ngày ${new Date(endDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`;
    const iso = endDateStr
      ? new Date(endDateStr + 'T23:59:59.999+07:00').toISOString()
      : new Date().toISOString();
    return { dateFilter: filter, rangeLabel: label, beforeDateIso: iso };
  }

  // 3. Nếu truyền trực tiếp beforeDate
  const beforeStr = input.beforeDate || input.before;
  if (beforeStr) {
    const cutoff = beforeStr.includes('T') ? new Date(beforeStr) : new Date(beforeStr + 'T23:59:59.999+07:00');
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  // 4. Mặc định tính chuẩn theo lịch tháng từ ngày hôm nay (theo múi giờ Việt Nam GMT+7)
  const now = new Date();
  const vnFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [currentYear, currentMonth, currentDay] = vnFormatter.format(now).split('-').map(Number);
  const daysStr = input.days || '30';

  if (daysStr === '30' || daysStr === '1m') {
    // Đúng 1 tháng trước tính từ ngày hôm nay
    const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(currentDay, maxDays);
    const targetIsoDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    const cutoff = new Date(`${targetIsoDate}T23:59:59.999+07:00`);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (1 tháng trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  if (daysStr === '90' || daysStr === '3m') {
    // Đúng 3 tháng trước tính từ ngày hôm nay
    let targetMonth = currentMonth - 3;
    let targetYear = currentYear;
    if (targetMonth <= 0) {
      targetMonth += 12;
      targetYear -= 1;
    }
    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(currentDay, maxDays);
    const targetIsoDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    const cutoff = new Date(`${targetIsoDate}T23:59:59.999+07:00`);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (3 tháng trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  if (daysStr === '7' || daysStr === '1w') {
    // Đúng 1 tuần (7 ngày) trước
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (1 tuần trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  const days = parseInt(daysStr, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    dateFilter: { $lt: cutoff },
    rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
    beforeDateIso: cutoff.toISOString()
  };
}

adminRouter.get('/backup/full', async (_req, res) => {
  const c = getCollections();

  const [products, courts, orders, settings, auditLogs, inventoryMovements, orderSequences] = await Promise.all([
    c.products.find({ deletedAt: null }).sort({ category: 1, name: 1 }).toArray(),
    c.courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
    c.orders.find({}).sort({ createdAt: -1 }).toArray(),
    c.appSettings.findOne({ key: 'system_config' }),
    c.auditLogs.find({}).sort({ createdAt: -1 }).toArray(),
    c.inventoryMovements.find({}).sort({ createdAt: -1 }).toArray(),
    c.appSettings.find({ key: { $regex: '^order_sequence:' } }).toArray()
  ]);

  const fullBackup = {
    system: 'Sân Cầu Lông Trần Lựu',
    backupType: 'full_system',
    schemaVersion: '2.0.0',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    stats: {
      productsCount: products.length,
      courtsCount: courts.length,
      ordersCount: orders.length,
      auditLogsCount: auditLogs.length,
      inventoryCount: inventoryMovements.length,
      stockIntakeCount: inventoryMovements.filter(m => ['stock_intake', 'quick_restock', 'stock_adjustment'].includes(m.reason)).length,
      orderSequencesCount: orderSequences.length
    },
    products: products.map(productJson),
    courts: courts.map(court => ({ courtId: court.courtId, code: court.code, name: court.name, isActive: court.isActive, sortOrder: court.sortOrder })),
    orders: orders.map(orderJson),
    orderSequences: orderSequences.map(s => ({
      key: s.key,
      value: {
        sequence: typeof s.value?.sequence === 'number'
          ? s.value.sequence
          : (typeof s.value === 'number' ? s.value : 1)
      }
    })),
    auditLogs,
    inventoryMovements,
    settings: settings?.value || null
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tran_luu_full_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(fullBackup);
});

adminRouter.post('/catalog/import', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_IMPORT', 'Định dạng tệp JSON không hợp lệ');
  }

  const c = getCollections();
  const now = new Date();

  // Tiền kiểm tra (Pre-validation) trước khi ghi vào bất kỳ collection nào
  if (Array.isArray(body.courts) && body.courts.length > 0) {
    const seenCodes = new Set<string>();
    for (const item of body.courts) {
      if (item.code) {
        const codeStr = String(item.code).trim();
        if (seenCodes.has(codeStr)) {
          throw new ApiError(409, 'DUPLICATE', `Mã sân ${codeStr} bị trùng lặp trong tệp nhập.`);
        }
        seenCodes.add(codeStr);
        const existing = await c.courts.findOne({ code: codeStr, deletedAt: null });
        if (existing && item.courtId && existing.courtId !== item.courtId) {
          throw new ApiError(409, 'DUPLICATE', `Mã sân ${codeStr} đã tồn tại trong hệ thống với ID khác (${existing.courtId}).`);
        }
      }
    }
  }

  let importedProducts = 0;
  let importedCourts = 0;
  let importedOrders = 0;
  let importedSequences = 0;
  let importedSettings = 0;
  let importedMovements = 0;
  let importedAudit = 0;

  // Thực thi khôi phục trong transaction để bảo đảm tính nguyên tử (atomic rollback nếu gặp lỗi)
  await transaction(async session => {
    // 1. Khôi phục sản phẩm nếu có
    const rawProducts = Array.isArray(body) ? body : Array.isArray(body.products) ? body.products : null;
    if (rawProducts && rawProducts.length > 0) {
      for (const item of rawProducts) {
        const parsed = productFields.partial({ imageSvg: true, tag: true, isAvailable: true }).safeParse(item);
        if (!parsed.success) continue;
        const prodId = item.productId || item.id || randomUUID();
        const costPriceVnd = (item.costPriceVnd !== undefined) ? Number(item.costPriceVnd) : (parsed.data.costPriceVnd !== undefined ? Number(parsed.data.costPriceVnd) : undefined);

        const updateSet: Record<string, any> = {
          name: parsed.data.name,
          volume: parsed.data.volume,
          category: parsed.data.category,
          priceVnd: parsed.data.priceVnd,
          tag: parsed.data.tag || '',
          imageSvg: parsed.data.imageSvg || '',
          isAvailable: parsed.data.isAvailable !== false,
          deletedAt: null,
          updatedAt: now
        };
        if (costPriceVnd !== undefined) {
          updateSet.costPriceVnd = costPriceVnd;
        }

        // Bảo vệ tồn kho: nếu sản phẩm đã có trong DB, không ghi đè số lượng tồn kho đang bán
        await c.products.updateOne(
          { productId: prodId },
          {
            $set: updateSet,
            $setOnInsert: {
              productId: prodId,
              stock: parsed.data.stock ?? 0,
              version: 1,
              createdAt: now
            }
          },
          { session, upsert: true }
        );
        importedProducts++;
      }
    }

    // 2. Khôi phục sân đấu nếu có
    if (Array.isArray(body.courts) && body.courts.length > 0) {
      for (const item of body.courts) {
        if (!item.code || !item.name) continue;
        const courtId = item.courtId || item.id || randomUUID();
        await c.courts.updateOne(
          { courtId },
          {
            $set: {
              code: String(item.code),
              name: String(item.name),
              sortOrder: Number(item.sortOrder || item.code),
              isActive: item.isActive !== false,
              deletedAt: null,
              updatedAt: now
            },
            $setOnInsert: {
              courtId,
              createdAt: now
            }
          },
          { session, upsert: true }
        );
        importedCourts++;
      }
    }

    // 3. Khôi phục đơn hàng nếu có (từ file sao lưu toàn hệ thống hoặc archive)
    if (Array.isArray(body.orders) && body.orders.length > 0) {
      for (const o of body.orders) {
        if (!o.orderId && !o.id) continue;
        const orderId = o.orderId || o.id;
        const existing = await c.orders.findOne({ orderId }, { session });
        if (!existing && o.courtId && Array.isArray(o.items)) {
          await c.orders.insertOne({
            orderId,
            displayCode: o.displayCode || `TL-${orderId.slice(-4)}`,
            clientRequestId: o.clientRequestId || randomUUID(),
            courtId: o.courtId,
            courtNameSnapshot: o.courtName || o.courtNameSnapshot || '',
            customerName: o.customerName || '',
            customerPhone: o.customerPhone || '',
            customerSessionHash: o.customerSessionHash || 'restored',
            paymentStatus: o.paymentStatus || 'unpaid',
            paidAt: o.paidAt ? new Date(o.paidAt) : null,
            status: o.status || 'delivered',
            totalVnd: Number(o.totalVnd) || 0,
            version: Number(o.version) || 1,
            items: o.items.map((i: any) => ({
              productId: i.productId,
              nameSnapshot: i.name || i.nameSnapshot || '',
              volumeSnapshot: i.volume || i.volumeSnapshot || '',
              unitPriceVnd: Number(i.unitPrice || i.unitPriceVnd) || 0,
              costPriceVnd: Number(i.costPrice || i.costPriceVnd) || 0,
              quantity: Number(i.quantity) || 1,
              iceQuantity: Number(i.iceQuantity) || 0,
              lineTotalVnd: Number(i.lineTotal || i.lineTotalVnd) || 0
            })),
            createdAt: o.createdAt ? new Date(o.createdAt) : now,
            updatedAt: o.updatedAt ? new Date(o.updatedAt) : now,
            editableUntil: o.editableUntil ? new Date(o.editableUntil) : now,
            acceptedAt: o.acceptedAt ? new Date(o.acceptedAt) : null,
            preparingAt: o.preparingAt ? new Date(o.preparingAt) : null,
            deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
            cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
            cancelReason: o.cancelReason || null
          }, { session });
          importedOrders++;
        }
      }
    }

    // 4. Khôi phục sequence (bộ đếm mã đơn) - hỗ trợ cả { sequence: number } lẫn number
    if (Array.isArray(body.orderSequences) && body.orderSequences.length > 0) {
      for (const seq of body.orderSequences) {
        if (seq && typeof seq.key === 'string') {
          const seqNum = typeof seq.value === 'number'
            ? seq.value
            : (typeof seq.value?.sequence === 'number' ? seq.value.sequence : null);
          if (typeof seqNum === 'number') {
            await c.appSettings.updateOne(
              { key: seq.key },
              {
                $max: { 'value.sequence': seqNum },
                $set: { updatedAt: now },
                $setOnInsert: { key: seq.key }
              },
              { session, upsert: true }
            );
            importedSequences++;
          }
        }
      }
    }

    // 5. Khôi phục cấu hình hệ thống (settings) nếu có
    if (body.settings && typeof body.settings === 'object') {
      const updateFields: Record<string, any> = { updatedAt: now };
      if (body.settings.isAcceptingOrders !== undefined) {
        updateFields['value.isAcceptingOrders'] = Boolean(body.settings.isAcceptingOrders);
      }
      if (body.settings.chimeIntervalSeconds !== undefined) {
        updateFields['value.chimeIntervalSeconds'] = Number(body.settings.chimeIntervalSeconds);
      }
      if (body.settings.editWindowSeconds !== undefined) {
        updateFields['value.editWindowSeconds'] = Number(body.settings.editWindowSeconds);
      }
      await c.appSettings.updateOne(
        { key: 'system_config' },
        { $set: updateFields, $setOnInsert: { key: 'system_config' } },
        { session, upsert: true }
      );
      importedSettings++;
    }

    // 6. Khôi phục lịch sử kho & nhập hàng (inventoryMovements) nếu có
    const rawMovements = Array.isArray(body.inventoryMovements) ? body.inventoryMovements : (Array.isArray(body.inventory) ? body.inventory : null);
    if (rawMovements && rawMovements.length > 0) {
      for (const mov of rawMovements) {
        if (mov.operationId && mov.productId && typeof mov.delta === 'number') {
          const existing = await c.inventoryMovements.findOne({ operationId: mov.operationId }, { session });
          if (!existing) {
            await c.inventoryMovements.insertOne({
              productId: mov.productId,
              delta: Number(mov.delta),
              reason: mov.reason || 'stock_intake',
              orderId: mov.orderId || null,
              operationId: mov.operationId,
              stockAfter: Number(mov.stockAfter) || 0,
              productNameSnapshot: mov.productNameSnapshot || '',
              volumeSnapshot: mov.volumeSnapshot || '',
              costPriceVnd: Number(mov.costPriceVnd) || 0,
              sellingPriceVnd: Number(mov.sellingPriceVnd) || 0,
              totalCostVnd: Number(mov.totalCostVnd) || 0,
              note: mov.note || '',
              createdAt: mov.createdAt ? new Date(mov.createdAt) : now
            }, { session });
            importedMovements++;
          }
        }
      }
    }

    // 7. Khôi phục nhật ký kiểm toán (auditLogs) nếu có
    if (Array.isArray(body.auditLogs) && body.auditLogs.length > 0) {
      for (const log of body.auditLogs) {
        if (log.auditId && log.adminUsername && log.action) {
          const existing = await c.auditLogs.findOne({ auditId: log.auditId }, { session });
          if (!existing) {
            await c.auditLogs.insertOne({
              auditId: log.auditId,
              adminUsername: log.adminUsername,
              action: log.action,
              targetId: log.targetId,
              details: log.details || {},
              ip: log.ip,
              createdAt: log.createdAt ? new Date(log.createdAt) : now
            }, { session });
            importedAudit++;
          }
        }
      }
    }
  });

  // Nếu không có bất kỳ dữ liệu nào được import
  if (importedProducts === 0 && importedCourts === 0 && importedOrders === 0 && importedSequences === 0 && importedSettings === 0 && importedMovements === 0 && importedAudit === 0) {
    if (body.archiveType === 'periodic_cleanup') {
      const stats = body.stats;
      const count = (stats?.ordersCount || 0) + (body.orders?.length || 0);
      if (count === 0) {
        throw new ApiError(
          400,
          'EMPTY_ARCHIVE',
          `Tệp bạn tải lên là "Bản lưu trữ dữ liệu cũ" nhưng đang rỗng (0 đơn hàng do toàn bộ đơn trên hệ thống đều là đơn mới). Tệp này không chứa danh mục sản phẩm. Để sao lưu và khôi phục sản phẩm, vui lòng bấm nút "Tải sao lưu danh mục" ở thẻ bên trái!`
        );
      }
    }
    throw new ApiError(
      400,
      'INVALID_IMPORT',
      'Tệp JSON không chứa danh sách sản phẩm hay đơn hàng hợp lệ. Vui lòng chọn tệp sao lưu do hệ thống tạo (tran_luu_catalog_...json hoặc tran_luu_full_backup_...json).'
    );
  }

  const summaryParts: string[] = [];
  if (importedProducts > 0) summaryParts.push(`${importedProducts} sản phẩm`);
  if (importedCourts > 0) summaryParts.push(`${importedCourts} sân`);
  if (importedOrders > 0) summaryParts.push(`${importedOrders} đơn hàng`);
  if (importedSequences > 0) summaryParts.push(`${importedSequences} bộ đếm mã đơn`);
  if (importedSettings > 0) summaryParts.push('cấu hình hệ thống');
  if (importedMovements > 0) summaryParts.push(`${importedMovements} biến động kho / phiếu nhập`);
  if (importedAudit > 0) summaryParts.push(`${importedAudit} nhật ký`);
  const summaryMsg = summaryParts.join(', ');

  await recordAuditLog(res.locals.admin, 'catalog_import', undefined, { importedProducts, importedCourts, importedOrders, importedSequences, importedSettings, importedMovements }, req.ip);
  res.json({
    ok: true,
    importedCount: importedProducts,
    importedCourts,
    importedOrders,
    importedSequences,
    importedSettings,
    importedMovements,
    message: `Đã khôi phục thành công: ${summaryMsg}!`
  });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '15'), 10) || 15, 1), 100);
  const skip = (page - 1) * limit;

  const [total, logs] = await Promise.all([
    getCollections().auditLogs.countDocuments({}),
    getCollections().auditLogs.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    logs,
    total,
    page,
    limit,
    totalPages
  });
});

// ===== SAFE DATA CLEAN / PURGE API (AFTER 1 MONTH ARCHIVE) =====

adminRouter.get('/clean/preview', async (req, res) => {
  const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(req.query as any);
  const c = getCollections();
  const [ordersCount, inventoryCount, auditLogsCount, activeOrdersPreserved, intakeCount] = await Promise.all([
    c.orders.countDocuments({
      createdAt: dateFilter,
      $or: [
        { status: 'cancelled' },
        { status: 'delivered', paymentStatus: 'paid' }
      ]
    }),
    c.inventoryMovements.countDocuments({ createdAt: dateFilter }),
    c.auditLogs.countDocuments({ createdAt: dateFilter }),
    c.orders.countDocuments({
      $or: [
        { status: { $in: ['new', 'accepted', 'preparing'] } },
        { status: 'delivered', paymentStatus: { $ne: 'paid' } }
      ]
    }),
    c.inventoryMovements.countDocuments({
      createdAt: dateFilter,
      reason: { $in: ['stock_intake', 'quick_restock', 'stock_adjustment'] }
    })
  ]);

  res.json({
    rangeLabel,
    beforeDate: beforeDateIso,
    ordersCount,
    inventoryCount,
    intakeCount,
    auditLogsCount,
    activeOrdersPreserved
  });
});


adminRouter.post('/clean/purge', async (req, res) => {
  const schema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    beforeDate: z.string().optional(),
    days: z.string().optional(),
    customDate: z.string().optional(),
    includeOrders: z.boolean().default(true),
    includeInventory: z.boolean().default(true),
    includeAuditLogs: z.boolean().default(true)
  });
  const input = schema.parse(req.body);
  const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(input);

  const c = getCollections();
  let deletedOrders = 0;
  let deletedInventory = 0;
  let deletedIntake = 0;
  let deletedAuditLogs = 0;

  if (input.includeOrders) {
    const r = await c.orders.deleteMany({
      createdAt: dateFilter,
      $or: [
        { status: 'cancelled' },
        { status: 'delivered', paymentStatus: 'paid' }
      ]
    });
    deletedOrders = r.deletedCount;
  }

  if (input.includeInventory) {
    deletedIntake = await c.inventoryMovements.countDocuments({
      createdAt: dateFilter,
      reason: { $in: ['stock_intake', 'quick_restock', 'stock_adjustment'] }
    });
    const r = await c.inventoryMovements.deleteMany({
      createdAt: dateFilter
    });
    deletedInventory = r.deletedCount;
  }

  if (input.includeAuditLogs) {
    const r = await c.auditLogs.deleteMany({
      createdAt: dateFilter
    });
    deletedAuditLogs = r.deletedCount;
  }

  await recordAuditLog(
    res.locals.admin,
    'data_cleaned',
    undefined,
    {
      rangeLabel,
      beforeDate: beforeDateIso,
      cleaned: {
        ordersDeleted: deletedOrders,
        inventoryMovementsDeleted: deletedInventory,
        stockIntakeDeleted: deletedIntake,
        auditLogsDeleted: deletedAuditLogs
      }
    },
    req.ip
  );

  res.json({
    ok: true,
    rangeLabel,
    deletedOrders,
    deletedInventory,
    deletedIntake,
    deletedAuditLogs,
    cleaned: {
      ordersDeleted: deletedOrders,
      inventoryMovementsDeleted: deletedInventory,
      stockIntakeDeleted: deletedIntake,
      auditLogsDeleted: deletedAuditLogs
    }
  });
});
