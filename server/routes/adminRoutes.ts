import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { getCollections, transaction } from '../db.js';
import { ApiError } from '../errors.js';
import { OrderService } from '../services/orderService.js';
import { orderJson, productJson } from '../serialize.js';
import { dateRange } from '../time.js';
import { courtCode, id, productFields, productPatch, stock } from '../validation.js';
import type { AuditLogDoc } from '../types.js';

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

adminRouter.get('/settings',async(_req,res)=>res.json((await getCollections().appSettings.findOne({key:'system_config'}))?.value));
adminRouter.patch('/settings',async(req,res)=>{
  const value = z.object({isAcceptingOrders:z.boolean()}).strict().parse(req.body);
  await getCollections().appSettings.updateOne({key:'system_config'},{$set:{'value.isAcceptingOrders':value.isAcceptingOrders,updatedAt:new Date()}});
  await recordAuditLog(res.locals.admin, 'settings_update', 'system_config', { isAcceptingOrders: value.isAcceptingOrders }, req.ip);
  res.json(value);
});
adminRouter.get('/orders/active',async(_req,res)=>{
  const c = getCollections();
  const open = await c.orders.find({status:{$in:['new','accepted','preparing']}}).sort({createdAt:1}).toArray();
  const delivered = await c.orders.find({status:'delivered',deliveredAt:dateRange('today')}).sort({deliveredAt:-1}).toArray();
  res.json([...open,...delivered].map(orderJson));
});
adminRouter.post('/orders/:id/transition',async(req,res)=>{
  const {targetStatus} = z.object({targetStatus:z.enum(['preparing','delivered'])}).strict().parse(req.body);
  res.json(orderJson(await OrderService.transition(id.parse(req.params.id),targetStatus)));
});
adminRouter.post('/orders/:id/cancel',async(req,res)=>{
  const {reason} = z.object({reason:z.string().trim().min(1).max(300)}).strict().parse(req.body);
  const cancelled = await OrderService.cancel(id.parse(req.params.id),reason,res.locals.admin);
  await recordAuditLog(res.locals.admin, 'order_cancel', req.params.id, { reason, courtName: cancelled.courtNameSnapshot, totalVnd: cancelled.totalVnd }, req.ip);
  res.json(orderJson(cancelled));
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
    if(product.stock) await c.inventoryMovements.insertOne({productId:product.productId,delta:product.stock,reason:'stock_intake',operationId:randomUUID(),stockAfter:product.stock,createdAt:now},{session});
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
  const input = z.object({clientRequestId:id,delta:z.number().int().min(-1_000_000).max(1_000_000).optional(),setAbsoluteStock:stock.optional(),expectedStock:stock.optional(),reason:z.enum(['stock_intake','stock_adjustment','quick_restock']).default('stock_intake')}).strict()
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
    await c.products.updateOne({productId},{$set:{stock:nextStock,updatedAt:now},$inc:{version:1}},{session});
    await c.inventoryMovements.insertOne({productId,delta:nextStock-current.stock,reason:input.reason,operationId,stockAfter:nextStock,createdAt:now},{session});
    return {id:productId,stock:nextStock};
  });
  await recordAuditLog(res.locals.admin, 'stock_adjustment', productId, { reason: input.reason, stockAfter: result.stock }, req.ip);
  res.json(result);
});

adminRouter.get('/courts',async(_req,res)=>res.json((await getCollections().courts.find({deletedAt:null}).sort({sortOrder:1}).toArray()).map(c=>({id:c.courtId,code:c.code,name:c.name,isActive:c.isActive,sortOrder:c.sortOrder}))));
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
      { courtNameSnapshot: regex }
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
    products:[{$unwind:'$items'},{$group:{_id:'$items.productId',name:{$last:'$items.nameSnapshot'},bottles:{$sum:'$items.quantity'},ice:{$sum:'$items.iceQuantity'},revenue:{$sum:'$items.lineTotalVnd'}}},{$sort:{bottles:-1}}]
  }}];
  const [summary] = await c.orders.aggregate(pipeline).toArray();
  const [pending] = await c.orders.aggregate([{$match:{status:{$in:['new','accepted','preparing']}}},{$group:{_id:null,total:{$sum:'$totalVnd'},count:{$sum:1}}}]).toArray();
  const products = summary?.products || [];
  res.json({timeFilter,totalRevenueVnd:summary?.totals[0]?.revenue||0,totalOrdersDelivered:summary?.totals[0]?.orders||0,
    uncollectedRevenueVnd:pending?.total||0,totalOrdersUncollected:pending?.count||0,
    totalBottlesDelivered:products.reduce((n:number,p:{bottles:number})=>n+p.bottles,0),totalIceServed:products.reduce((n:number,p:{ice:number})=>n+p.ice,0),byCourt:summary?.courts||[],bestSellers:products});
});


adminRouter.get('/backup/full', async (_req, res) => {
  const c = getCollections();
  const [products, courts, orders, settings, auditLogs, inventoryMovements] = await Promise.all([
    c.products.find({ deletedAt: null }).sort({ category: 1, name: 1 }).toArray(),
    c.courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
    c.orders.find({}).sort({ createdAt: -1 }).toArray(),
    c.appSettings.findOne({ key: 'system_config' }),
    c.auditLogs.find({}).sort({ createdAt: -1 }).toArray(),
    c.inventoryMovements.find({}).sort({ createdAt: -1 }).toArray()
  ]);

  const fullBackup = {
    system: 'Sân Cầu Lông Trần Lựu',
    backupType: 'full_system',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    stats: {
      productsCount: products.length,
      courtsCount: courts.length,
      ordersCount: orders.length,
      auditLogsCount: auditLogs.length,
      inventoryCount: inventoryMovements.length
    },
    products: products.map(productJson),
    courts: courts.map(court => ({ courtId: court.courtId, code: court.code, name: court.name, isActive: court.isActive, sortOrder: court.sortOrder })),
    orders: orders.map(orderJson),
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
  let importedProducts = 0;
  let importedCourts = 0;
  let importedOrders = 0;

  // 1. Khôi phục sản phẩm nếu có
  const rawProducts = Array.isArray(body) ? body : Array.isArray(body.products) ? body.products : null;
  if (rawProducts && rawProducts.length > 0) {
    for (const item of rawProducts) {
      const parsed = productFields.partial({ imageSvg: true, tag: true, isAvailable: true }).safeParse(item);
      if (!parsed.success) continue;
      const prodId = item.productId || item.id || randomUUID();
      await c.products.updateOne(
        { productId: prodId },
        {
          $set: {
            name: parsed.data.name,
            volume: parsed.data.volume,
            category: parsed.data.category,
            priceVnd: parsed.data.priceVnd,
            stock: parsed.data.stock,
            tag: parsed.data.tag || '',
            imageSvg: parsed.data.imageSvg || '',
            isAvailable: parsed.data.isAvailable !== false,
            deletedAt: null,
            updatedAt: now
          },
          $setOnInsert: {
            productId: prodId,
            version: 1,
            createdAt: now
          }
        },
        { upsert: true }
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
        { upsert: true }
      );
      importedCourts++;
    }
  }

  // 3. Khôi phục đơn hàng nếu có (từ file sao lưu toàn hệ thống hoặc archive)
  if (Array.isArray(body.orders) && body.orders.length > 0) {
    for (const o of body.orders) {
      if (!o.orderId && !o.id) continue;
      const orderId = o.orderId || o.id;
      const existing = await c.orders.findOne({ orderId });
      if (!existing && o.courtId && Array.isArray(o.items)) {
        await c.orders.insertOne({
          orderId,
          displayCode: o.displayCode || `TL-${orderId.slice(-4)}`,
          clientRequestId: o.clientRequestId || randomUUID(),
          courtId: o.courtId,
          courtNameSnapshot: o.courtName || o.courtNameSnapshot || '',
          customerSessionHash: o.customerSessionHash || 'restored',
          status: o.status || 'delivered',
          totalVnd: Number(o.totalVnd) || 0,
          version: Number(o.version) || 1,
          items: o.items.map((i: any) => ({
            productId: i.productId,
            nameSnapshot: i.name || i.nameSnapshot || '',
            volumeSnapshot: i.volume || i.volumeSnapshot || '',
            unitPriceVnd: Number(i.unitPrice || i.unitPriceVnd) || 0,
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
        });
        importedOrders++;
      }
    }
  }

  // Nếu không có bất kỳ dữ liệu nào được import
  if (importedProducts === 0 && importedCourts === 0 && importedOrders === 0) {
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
  const summaryMsg = summaryParts.join(', ');

  await recordAuditLog(res.locals.admin, 'catalog_import', undefined, { importedProducts, importedCourts, importedOrders }, req.ip);
  res.json({ ok: true, importedCount: importedProducts, importedCourts, importedOrders, message: `Đã khôi phục thành công: ${summaryMsg}!` });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const logs = await getCollections().auditLogs.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  res.json({ logs });
});

// ===== SAFE DATA CLEAN / PURGE API (AFTER 1 MONTH ARCHIVE) =====
function parseCleanDateFilter(input: {
  startDate?: string;
  endDate?: string;
  customDate?: string;
  beforeDate?: string;
  days?: string;
  before?: string;
}): { dateFilter: Record<string, Date>; rangeLabel: string; beforeDateIso: string } {
  if (input.days === 'all' || input.days === '0') {
    return {
      dateFilter: { $lte: new Date() },
      rangeLabel: 'Toàn bộ đơn cũ đã xong & nhật ký',
      beforeDateIso: new Date().toISOString()
    };
  }

  const startDateStr = input.startDate?.trim() || '';
  const endDateStr = input.endDate?.trim() || input.customDate?.trim() || '';
  if (startDateStr || endDateStr) {
    const filter: Record<string, Date> = {};
    if (startDateStr) filter.$gte = new Date(startDateStr + 'T00:00:00+07:00');
    if (endDateStr) filter.$lte = new Date(endDateStr + 'T23:59:59.999+07:00');
    const label = startDateStr && endDateStr
      ? `Từ ${new Date(startDateStr).toLocaleDateString('vi-VN')} đến ${new Date(endDateStr).toLocaleDateString('vi-VN')}`
      : startDateStr ? `Từ ${new Date(startDateStr).toLocaleDateString('vi-VN')}` : `Trước ${new Date(endDateStr).toLocaleDateString('vi-VN')}`;
    const iso = endDateStr ? new Date(endDateStr + 'T23:59:59.999+07:00').toISOString() : new Date().toISOString();
    return { dateFilter: filter, rangeLabel: label, beforeDateIso: iso };
  }
  const beforeStr = input.beforeDate || input.before;
  if (beforeStr) {
    const cutoff = new Date(beforeStr);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
      beforeDateIso: cutoff.toISOString()
    };
  }
  const days = parseInt(input.days || '30', 10);
  const cutoff = new Date(Date.now() - (isNaN(days) ? 30 : days) * 24 * 60 * 60 * 1000);
  return {
    dateFilter: { $lt: cutoff },
    rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
    beforeDateIso: cutoff.toISOString()
  };
}

adminRouter.get('/clean/preview', async (req, res) => {
  const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(req.query as any);
  const c = getCollections();
  const [ordersCount, inventoryCount, auditLogsCount, activeOrdersPreserved] = await Promise.all([
    c.orders.countDocuments({ status: { $in: ['delivered', 'cancelled'] }, createdAt: dateFilter }),
    c.inventoryMovements.countDocuments({ createdAt: dateFilter }),
    c.auditLogs.countDocuments({ createdAt: dateFilter }),
    c.orders.countDocuments({ status: { $in: ['new', 'accepted', 'preparing'] } })
  ]);

  res.json({
    rangeLabel,
    beforeDate: beforeDateIso,
    ordersCount,
    inventoryCount,
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
  let deletedAuditLogs = 0;

  if (input.includeOrders) {
    const r = await c.orders.deleteMany({
      status: { $in: ['delivered', 'cancelled'] },
      createdAt: dateFilter
    });
    deletedOrders = r.deletedCount;
  }

  if (input.includeInventory) {
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
    deletedAuditLogs,
    cleaned: {
      ordersDeleted: deletedOrders,
      inventoryMovementsDeleted: deletedInventory,
      auditLogsDeleted: deletedAuditLogs
    }
  });
});
