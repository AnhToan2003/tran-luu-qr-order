import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin, hashPassword, verifyPassword, requirePermission, revokeUserSessions, revokeRoleSessions } from '../auth.js';
import { getCollections, transaction, snapshotRead } from '../db.js';
import { ApiError } from '../errors.js';
import { OrderService } from '../services/orderService.js';
import { orderJson, productJson } from '../serialize.js';
import { dateRange, vietnamDate } from '../time.js';
import { courtCode, id, productFields, productPatch, stock, items as itemsSchema } from '../validation.js';
import { signCourtCode } from '../services/qrSign.js';
import { broadcastEvent } from '../websocket.js';
import { cacheDel, invalidateCatalogCache } from '../redis.js';
import type { AuditLogDoc, OrderDoc, OrderItemDoc } from '../types.js';
import { migrateBackupToV2 } from '../utils/backupMigration.js';

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
adminRouter.patch('/settings', requirePermission(['orders', 'rbac']), async (req, res) => {
  const value = z.object({ isAcceptingOrders: z.boolean() }).strict().parse(req.body);
  await getCollections().appSettings.updateOne({ key: 'system_config' }, { $set: { 'value.isAcceptingOrders': value.isAcceptingOrders, updatedAt: new Date() } });
  await recordAuditLog(res.locals.admin, 'settings_update', 'system_config', { isAcceptingOrders: value.isAcceptingOrders }, req.ip);
  res.json(value);
});

// Endpoint bảo mật: Xác thực mật khẩu quản trị viên trước khi thực hiện thao tác nhạy cảm (Nhập hàng, CRUD sản phẩm)
adminRouter.post('/auth/verify-action-password', async (req, res) => {
  const { password } = z.object({ password: z.string().min(1, 'Vui lòng nhập mật khẩu quản trị viên') }).parse(req.body);
  const currentAdmin = res.locals.admin;
  const currentUserId = res.locals.userId;
  const c = getCollections();

  let isValid = false;

  // 1. Kiểm tra nếu là DB Admin User
  if (currentUserId) {
    const user = await c.adminUsers.findOne({ userId: currentUserId, isActive: true });
    if (user && user.passwordHash) {
      isValid = verifyPassword(password, user.passwordHash);
    }
  }

  // 2. Kiểm tra nếu là ENV Admin
  if (!isValid && process.env.ADMIN_PASSWORD_HASH) {
    isValid = verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
  }

  // 3. Chế độ phát triển dev fallback
  if (!isValid && process.env.NODE_ENV !== 'production' && (password === 'admin123' || password === 'admin')) {
    isValid = true;
  }

  if (!isValid) {
    await recordAuditLog(currentAdmin, 'failed_action_password_verify', undefined, { ip: req.ip }, req.ip);
    throw new ApiError(403, 'INVALID_PASSWORD', 'Mật khẩu quản trị viên không chính xác. Thao tác bị từ chối!');
  }

  await recordAuditLog(currentAdmin, 'action_password_verified', undefined, { ip: req.ip }, req.ip);
  res.json({ ok: true, message: 'Xác thực mật khẩu quản trị thành công', timestamp: Date.now() });
});

adminRouter.get('/categories', async (_req, res) => {
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'drink_categories' });
  const defaultCategories: Array<{ id: string; name: string }> = [
    { id: 'water', name: 'Nước suối' },
    { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
    { id: 'soda', name: 'Nước ngọt có gas' },
    { id: 'energy', name: 'Nước tăng lực' },
    { id: 'tea', name: 'Trà & Cà phê' },
    { id: 'juice', name: 'Nước ép & Sữa' },
    { id: 'food', name: 'Mì ly & Đồ ăn' }
  ];
  let categories: Array<{ id: string; name: string; productCount?: number }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultCategories];

  const existingProductCats = await c.products.distinct('category', { deletedAt: null });
  for (const cat of existingProductCats) {
    if (cat && !categories.some(c => c.id === cat || c.name.toLowerCase() === String(cat).toLowerCase())) {
      categories.push({ id: String(cat), name: String(cat) });
    }
  }

  // Đếm số lượng sản phẩm đang có của từng hạng mục
  const counts = await c.products.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();

  const countMap = new Map<string, number>();
  for (const item of counts) {
    countMap.set(String(item._id), item.count);
  }

  const categoriesWithCount = categories.map(cat => ({
    ...cat,
    productCount: countMap.get(cat.id) || countMap.get(cat.name) || 0
  }));

  res.json({ categories: categoriesWithCount });
});

adminRouter.post('/categories', requirePermission('drink-intake'), async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'drink_categories' });
  const defaultCategories: Array<{ id: string; name: string }> = [
    { id: 'water', name: 'Nước suối' },
    { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
    { id: 'soda', name: 'Nước ngọt có gas' },
    { id: 'energy', name: 'Nước tăng lực' },
    { id: 'tea', name: 'Trà & Cà phê' },
    { id: 'juice', name: 'Nước ép & Sữa' },
    { id: 'food', name: 'Mì ly & Đồ ăn' }
  ];
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultCategories];

  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.json({ category: existing, categories });
  }

  const id = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `cat_${Date.now()}`;

  const newCat = { id, name };
  categories.push(newCat);
  await c.appSettings.updateOne(
    { key: 'drink_categories' },
    { $set: { value: categories, updatedAt: new Date() } },
    { upsert: true }
  );
  await recordAuditLog(res.locals.admin, 'category_create', id, { name }, req.ip);
  res.status(201).json({ category: newCat, categories });
});

adminRouter.put('/categories/:id', requirePermission('drink-intake'), async (req, res) => {
  const targetId = String(req.params.id).trim();
  const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'drink_categories' });
  const defaultCategories: Array<{ id: string; name: string }> = [
    { id: 'water', name: 'Nước suối' },
    { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
    { id: 'soda', name: 'Nước ngọt có gas' },
    { id: 'energy', name: 'Nước tăng lực' },
    { id: 'tea', name: 'Trà & Cà phê' },
    { id: 'juice', name: 'Nước ép & Sữa' },
    { id: 'food', name: 'Mì ly & Đồ ăn' }
  ];
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultCategories];

  const index = categories.findIndex(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
  if (index === -1) {
    categories.push({ id: targetId, name });
  } else {
    categories[index].name = name;
  }

  await c.appSettings.updateOne(
    { key: 'drink_categories' },
    { $set: { value: categories, updatedAt: new Date() } },
    { upsert: true }
  );

  await invalidateCatalogCache();
  await recordAuditLog(res.locals.admin, 'category_update', targetId, { newName: name }, req.ip);
  res.json({ ok: true, id: targetId, name, categories });
});

adminRouter.delete('/categories/:id', requirePermission('drink-intake'), async (req, res) => {
  const targetId = String(req.params.id).trim();
  const c = getCollections();

  const doc = await c.appSettings.findOne({ key: 'drink_categories' });
  const defaultCategories: Array<{ id: string; name: string }> = [
    { id: 'water', name: 'Nước suối' },
    { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
    { id: 'soda', name: 'Nước ngọt có gas' },
    { id: 'energy', name: 'Nước tăng lực' },
    { id: 'tea', name: 'Trà & Cà phê' },
    { id: 'juice', name: 'Nước ép & Sữa' },
    { id: 'food', name: 'Mì ly & Đồ ăn' }
  ];
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultCategories];
  const targetCat = categories.find(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
  const targetName = targetCat ? targetCat.name : targetId;

  // Kiểm tra xem có sản phẩm nào đang dùng hạng mục này không (cả theo ID lẫn tên)
  const productFilter = {
    $or: [{ category: targetId }, { category: targetName }],
    deletedAt: null
  };
  const inUseCount = await c.products.countDocuments(productFilter);

  const moveTo = typeof req.query.moveTo === 'string' ? req.query.moveTo.trim() : typeof req.body?.moveTo === 'string' ? req.body.moveTo.trim() : undefined;
  const cascadeDelete = req.query.cascadeDelete === 'true' || req.body?.cascadeDelete === true;

  if (inUseCount > 0) {
    if (cascadeDelete) {
      // Soft-delete toàn bộ sản phẩm thuộc hạng mục này
      await c.products.updateMany(productFilter, {
        $set: { deletedAt: new Date(), isAvailable: false, updatedAt: new Date() },
        $inc: { version: 1 }
      });
    } else if (moveTo) {
      // Chuyển toàn bộ sản phẩm sang hạng mục mới (hoặc uncategorized)
      await c.products.updateMany(productFilter, {
        $set: { category: moveTo, updatedAt: new Date() },
        $inc: { version: 1 }
      });
    } else {
      throw new ApiError(400, 'CATEGORY_IN_USE', `Hạng mục "${targetName}" đang có ${inUseCount} sản phẩm sử dụng. Vui lòng chọn hạng mục chuyển đổi hoặc xóa kèm sản phẩm.`);
    }
  }

  categories = categories.filter(c => c.id !== targetId && c.name.toLowerCase() !== targetId.toLowerCase());

  await c.appSettings.updateOne(
    { key: 'drink_categories' },
    { $set: { value: categories, updatedAt: new Date() } },
    { upsert: true }
  );

  await invalidateCatalogCache();
  await recordAuditLog(res.locals.admin, 'category_delete', targetId, {
    targetName,
    affectedCount: inUseCount,
    actionTaken: cascadeDelete ? 'cascade_deleted_products' : (moveTo ? `moved_to_${moveTo}` : 'none')
  }, req.ip);

  res.json({ ok: true, id: targetId, categories, affectedCount: inUseCount });
});

adminRouter.get('/orders/active', requirePermission('orders'), async (_req, res) => {
  const c = getCollections();
  const open = await c.orders.find({
    orderType: { $ne: 'sports_pos' },
    status: { $in: ['new', 'accepted', 'preparing'] }
  }).sort({ createdAt: 1 }).toArray();
  // Bao gồm tất cả các đơn nước nợ chưa thanh toán + đơn nước đã thanh toán giao trong hôm nay
  const delivered = await c.orders.find({
    orderType: { $ne: 'sports_pos' },
    $or: [
      { status: 'delivered', paymentStatus: { $ne: 'paid' } },
      { status: 'delivered', paymentStatus: 'paid', deliveredAt: dateRange('today') }
    ]
  }).sort({ deliveredAt: -1, createdAt: -1 }).limit(1000).toArray();
  res.json([...open, ...delivered].map(orderJson));
});

adminRouter.post('/orders/:id/payment', requirePermission(['orders', 'sports-pos']), async (req, res) => {
  const { paymentStatus, paymentMethod, reason } = z.object({
    paymentStatus: z.enum(['paid', 'unpaid']),
    paymentMethod: z.enum(['cash', 'transfer']).optional(),
    reason: z.string().trim().max(300).optional()
  }).strict().parse(req.body);
  const orderId = id.parse(req.params.id);
  const c = getCollections();
  const existing = await c.orders.findOne({ orderId });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

  const perms = (res.locals.permissions as string[]) || [];
  const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
  if (existing.orderType === 'sports_pos') {
    if (!isAdmin && !perms.includes('sports-pos')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
    }
  } else {
    if (!isAdmin && !perms.includes('orders')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
    }
  }

  const updated = await OrderService.updatePayment(orderId, paymentStatus, paymentMethod, res.locals.admin, reason);
  await recordAuditLog(res.locals.admin, 'payment_status_update', orderId, {
    paymentStatus,
    paymentMethod: updated.paymentMethod,
    reason: reason || null
  }, req.ip);
  res.json(orderJson(updated));
});

adminRouter.post('/orders/:id/transition', requirePermission(['orders', 'sports-pos']), async (req, res) => {
  const { targetStatus } = z.object({ targetStatus: z.enum(['preparing', 'delivered']) }).strict().parse(req.body);
  const orderId = id.parse(req.params.id);
  const c = getCollections();
  const existing = await c.orders.findOne({ orderId });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

  const perms = (res.locals.permissions as string[]) || [];
  const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
  if (existing.orderType === 'sports_pos') {
    if (!isAdmin && !perms.includes('sports-pos')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
    }
  } else {
    if (!isAdmin && !perms.includes('orders')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
    }
  }

  res.json(orderJson(await OrderService.transition(orderId, targetStatus)));
});

adminRouter.post('/orders/:id/deliver-and-pay', requirePermission(['orders', 'sports-pos']), async (req, res) => {
  const { paymentStatus, paymentMethod, reason } = z.object({
    paymentStatus: z.enum(['paid', 'unpaid']),
    paymentMethod: z.enum(['cash', 'transfer']).optional(),
    reason: z.string().trim().max(300).optional()
  }).strict().parse(req.body);
  const orderId = id.parse(req.params.id);
  const c = getCollections();
  const existing = await c.orders.findOne({ orderId });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

  const perms = (res.locals.permissions as string[]) || [];
  const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
  if (existing.orderType === 'sports_pos') {
    if (!isAdmin && !perms.includes('sports-pos')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
    }
  } else {
    if (!isAdmin && !perms.includes('orders')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
    }
  }

  const order = await OrderService.deliverAndPay(orderId, paymentStatus, paymentMethod, res.locals.admin, reason);
  await recordAuditLog(res.locals.admin, 'order_update', orderId, { action: 'deliver_and_pay', paymentStatus, paymentMethod, totalVnd: order.totalVnd, reason: reason || null }, req.ip);
  res.json(orderJson(order));
});

adminRouter.post('/orders/:id/cancel', requirePermission(['orders', 'sports-pos']), async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).strict().parse(req.body);
  const orderId = id.parse(req.params.id);
  const c = getCollections();
  const existing = await c.orders.findOne({ orderId });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

  const perms = (res.locals.permissions as string[]) || [];
  const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
  if (existing.orderType === 'sports_pos') {
    if (!isAdmin && !perms.includes('sports-pos')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
    }
  } else {
    if (!isAdmin && !perms.includes('orders')) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
    }
  }

  const cancelled = await OrderService.cancel(orderId, reason, res.locals.admin);
  await recordAuditLog(res.locals.admin, 'order_cancel', orderId, { reason, courtName: cancelled.courtNameSnapshot, totalVnd: cancelled.totalVnd }, req.ip);
  res.json(orderJson(cancelled));
});

adminRouter.post('/orders/create-pos', requirePermission('orders'), async (req, res) => {
  const schema = z.object({
    clientRequestId: id,
    items: itemsSchema,
    paymentStatus: z.enum(['paid', 'unpaid']).optional(),
    paymentMethod: z.enum(['cash', 'transfer']).optional(),
    courtId: z.string().optional()
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
    let targetCourtId = 'counter';
    let targetCourtName = 'Tại quầy';
    if (input.courtId && input.courtId !== 'counter') {
      const foundCourt = await c.courts.findOne({ $or: [{ courtId: input.courtId }, { code: input.courtId }], deletedAt: null });
      if (foundCourt) {
        targetCourtId = foundCourt.courtId;
        targetCourtName = foundCourt.name;
      }
    }

    const isPaid = (input.paymentStatus || 'paid') === 'paid';
    const paymentStatus = isPaid ? 'paid' : 'unpaid';
    const paymentMethod = isPaid ? (input.paymentMethod || 'cash') : null;

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
          note: `Bán trực tiếp tại quầy POS (${targetCourtName})`
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
        courtId: targetCourtId,
        courtNameSnapshot: targetCourtName,
        customerName: targetCourtId === 'counter' ? 'Khách tại quầy' : `Khách tại ${targetCourtName}`,
        customerPhone: '',
        customerSessionHash: `admin:${res.locals.admin}`,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        status: 'delivered',
        paymentStatus,
        paymentMethod,
        paidAt: isPaid ? now : null,
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
      courtName: targetCourtName,
      totalVnd: order.totalVnd,
      status: 'delivered',
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod
    }, req.ip);

    broadcastEvent({
      type: 'order_created',
      data: order,
      sessionHash: order.customerSessionHash,
      timestamp: new Date().toISOString()
    });

    broadcastEvent({
      type: 'stock_updated',
      timestamp: new Date().toISOString()
    });

    await invalidateCatalogCache();
    res.status(201).json(orderJson(order));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const winner = await c.orders.findOne(existingQuery);
      if (winner) return res.json(orderJson(check(winner)));
    }
    throw error;
  }
});
adminRouter.post('/orders/create-for-court', requirePermission('orders'), async (req, res) => {
  const order = await OrderService.placeOrder(`admin:${res.locals.admin}`, req.body);
  await recordAuditLog(res.locals.admin, 'order_create', order.orderId, { courtName: order.courtNameSnapshot, totalVnd: order.totalVnd }, req.ip);
  res.status(201).json(orderJson(order));
});

adminRouter.get('/products', async (_req, res) => {
  res.json((await getCollections().products.find({ deletedAt: null }).sort({ category: 1, name: 1 }).toArray()).map(productJson));
});

adminRouter.post('/products', requirePermission('drink-intake'), async (req, res) => {
  const input = productFields.strict().parse(req.body);
  const now = new Date();
  const product = { ...input, productId: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, version: 1 };
  await transaction(async session => {
    const c = getCollections();
    await c.products.insertOne(product, { session });
    if (product.stock) await c.inventoryMovements.insertOne({
      productId: product.productId,
      delta: product.stock,
      reason: 'stock_intake',
      operationId: randomUUID(),
      stockAfter: product.stock,
      createdAt: now,
      productNameSnapshot: product.name,
      volumeSnapshot: product.volume,
      costPriceVnd: product.costPriceVnd ?? 0,
      sellingPriceVnd: product.priceVnd,
      totalCostVnd: (product.costPriceVnd ?? 0) * product.stock,
      note: 'Khởi tạo sản phẩm mới'
    }, { session });
  });
  await recordAuditLog(res.locals.admin, 'product_create', product.productId, { name: product.name, priceVnd: product.priceVnd, stock: product.stock }, req.ip);
  await invalidateCatalogCache();
  res.status(201).json(productJson(product));
});

adminRouter.patch('/products/:id', requirePermission('drink-intake'), async (req, res) => {
  const input = productPatch.parse(req.body);
  const productId = id.parse(req.params.id);
  const updated = await transaction(async session => {
    const c = getCollections();
    const current = await c.products.findOne({ productId, deletedAt: null }, { session });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
    const { expectedStock, ...fields } = input;
    if (fields.stock !== undefined && expectedStock !== current.stock) throw new ApiError(409, 'STOCK_CHANGED', 'Tồn kho vừa thay đổi. Vui lòng tải lại trước khi điều chỉnh.');
    const now = new Date();
    const result = await c.products.findOneAndUpdate({ productId, version: current.version }, { $set: { ...fields, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
    if (!result) throw new ApiError(409, 'CONFLICT', 'Sản phẩm vừa thay đổi');
    if (fields.stock !== undefined && fields.stock !== current.stock) await c.inventoryMovements.insertOne({ productId, delta: fields.stock - current.stock, reason: 'stock_adjustment', operationId: randomUUID(), stockAfter: fields.stock, createdAt: now }, { session });
    return result;
  });
  await recordAuditLog(res.locals.admin, 'product_update', productId, { name: updated.name, changes: input }, req.ip);
  broadcastEvent({ type: 'stock_updated', data: { productId, stock: updated.stock }, timestamp: new Date().toISOString() });
  await invalidateCatalogCache();
  res.json(productJson(updated));
});

adminRouter.delete('/products/:id', requirePermission('drink-intake'), async (req, res) => {
  const productId = id.parse(req.params.id);
  const updated = await getCollections().products.findOneAndUpdate({ productId, deletedAt: null }, { $set: { deletedAt: new Date(), isAvailable: false, updatedAt: new Date() }, $inc: { version: 1 } }, { returnDocument: 'after' });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
  await recordAuditLog(res.locals.admin, 'product_delete', productId, { name: updated.name }, req.ip);
  await invalidateCatalogCache();
  res.json({ id: updated.productId });
});

adminRouter.get('/products/:id/movements', requirePermission('intake-history'), async (req, res) => {
  res.json(await getCollections().inventoryMovements.find({ productId: id.parse(req.params.id) }).sort({ createdAt: -1 }).limit(100).toArray());
});

adminRouter.post('/products/:id/stock', requirePermission('drink-intake'), async (req, res) => {
  const input = z.object({
    clientRequestId: id,
    delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    setAbsoluteStock: stock.optional(),
    expectedStock: stock.optional(),
    costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    responsiblePerson: z.string().trim().max(100).optional(),
    transferDate: z.string().optional(),
    note: z.string().trim().max(200).optional(),
    reason: z.enum(['stock_intake', 'stock_adjustment', 'quick_restock']).default('stock_intake')
  }).strict()
    .refine(v => (v.delta !== undefined) !== (v.setAbsoluteStock !== undefined), 'Chọn nhập kho hoặc đặt tồn kho').parse(req.body);
  const productId = id.parse(req.params.id);
  const operationId = `stock:${res.locals.admin}:${input.clientRequestId}`;
  const fingerprint = createHash('sha256').update(JSON.stringify({
    productId,
    delta: input.delta,
    setAbsoluteStock: input.setAbsoluteStock,
    expectedStock: input.expectedStock,
    costPriceVnd: input.costPriceVnd,
    sellingPriceVnd: input.sellingPriceVnd,
    responsiblePerson: input.responsiblePerson || '',
    transferDate: input.transferDate || '',
    note: input.note || '',
    reason: input.reason
  })).digest('hex');

  const result = await transaction(async session => {
    const c = getCollections();
    const receipt = await c.inventoryMovements.findOne({ operationId }, { session });
    if (receipt) {
      if (receipt.productId !== productId) throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho sản phẩm khác');
      if ((receipt as any).requestFingerprint && (receipt as any).requestFingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
      }
      if (input.delta !== undefined && receipt.delta !== input.delta) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
      }
      if (input.costPriceVnd !== undefined && receipt.costPriceVnd !== undefined && receipt.costPriceVnd !== input.costPriceVnd) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
      }
      return { id: productId, stock: receipt.stockAfter };
    }
    const current = await c.products.findOne({ productId, deletedAt: null }, { session });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
    if (input.setAbsoluteStock !== undefined && current.stock !== input.expectedStock) throw new ApiError(409, 'STOCK_CHANGED', 'Tồn kho đã thay đổi. Vui lòng tải lại.');
    const nextStock = stock.parse(input.setAbsoluteStock ?? current.stock + input.delta!);
    const now = new Date();
    const delta = nextStock - current.stock;

    const productUpdate: Record<string, any> = { stock: nextStock, updatedAt: now };
    if (input.costPriceVnd !== undefined) {
      productUpdate.costPriceVnd = input.costPriceVnd;
    }
    if (input.sellingPriceVnd !== undefined) {
      productUpdate.priceVnd = input.sellingPriceVnd;
    }

    await c.products.updateOne({ productId }, { $set: productUpdate, $inc: { version: 1 } }, { session });

    const activeCostPrice = input.costPriceVnd ?? current.costPriceVnd ?? 0;
    const activeSellingPrice = input.sellingPriceVnd ?? current.priceVnd;
    const totalCostVnd = delta > 0 ? activeCostPrice * delta : 0;

    await c.inventoryMovements.insertOne({
      productId,
      delta,
      reason: input.reason,
      operationId,
      stockAfter: nextStock,
      requestFingerprint: fingerprint,
      createdAt: now,
      productNameSnapshot: current.name,
      volumeSnapshot: current.volume,
      costPriceVnd: activeCostPrice,
      sellingPriceVnd: activeSellingPrice,
      totalCostVnd,
      responsiblePerson: input.responsiblePerson,
      transferDate: input.transferDate ? new Date(input.transferDate) : now,
      note: input.note
    } as any, { session });
    return { id: productId, stock: nextStock, costPriceVnd: activeCostPrice, sellingPriceVnd: activeSellingPrice };
  });
  await recordAuditLog(res.locals.admin, 'stock_adjustment', productId, { reason: input.reason, stockAfter: result.stock }, req.ip);
  broadcastEvent({ type: 'stock_updated', data: { productId, stock: result.stock }, timestamp: new Date().toISOString() });
  await invalidateCatalogCache();
  res.json(result);
});

adminRouter.post('/inventory/batch-intake', requirePermission('drink-intake'), async (req, res) => {
  const schema = z.object({
    clientRequestId: id.optional(),
    items: z.array(z.object({
      productId: id,
      delta: z.number().int().positive().max(1_000_000),
      costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
      sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional()
    })).min(1, 'Cần ít nhất một món có số lượng nhập lớn hơn 0'),
    transferDate: z.string().optional(),
    responsiblePerson: z.string().trim().min(1, 'Vui lòng nhập tên người phụ trách khi nhập hàng').max(100),
    note: z.string().trim().max(200).optional()
  });
  const input = schema.parse(req.body);
  const c = getCollections();

  // F06: Idempotency check with payload fingerprint verification
  const fingerprint = createHash('sha256').update(JSON.stringify({
    items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)).map(i => ({
      productId: i.productId,
      delta: i.delta,
      costPriceVnd: i.costPriceVnd,
      sellingPriceVnd: i.sellingPriceVnd
    })),
    transferDate: input.transferDate || '',
    responsiblePerson: input.responsiblePerson || '',
    note: input.note || ''
  })).digest('hex');

  if (input.clientRequestId) {
    const existingBatch = await c.appSettings.findOne({ key: `idempotency:drink_batch:${input.clientRequestId}` });
    if (existingBatch) {
      if (existingBatch.fingerprint && existingBatch.fingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
      }
      if (existingBatch.value) {
        return res.json(existingBatch.value);
      }
    }
  }

  // F06: All-or-nothing validation upfront
  const productIds = Array.from(new Set(input.items.map(i => i.productId)));
  const existingProducts = await c.products.find({ productId: { $in: productIds }, deletedAt: null }).toArray();
  if (existingProducts.length !== productIds.length) {
    const foundIds = new Set(existingProducts.map(p => p.productId));
    const missing = productIds.filter(pid => !foundIds.has(pid));
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', `Một hoặc nhiều sản phẩm không tồn tại hoặc đã bị xóa: ${missing.join(', ')}`);
  }

  const intakeBatchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();
  const parsedTransferDate = input.transferDate ? new Date(input.transferDate) : now;

  const result = await transaction(async session => {
    if (input.clientRequestId) {
      const duplicate = await c.appSettings.findOne({ key: `idempotency:drink_batch:${input.clientRequestId}` }, { session });
      if (duplicate) {
        if (duplicate.fingerprint && duplicate.fingerprint !== fingerprint) {
          throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
        }
        if (duplicate.value) return duplicate.value;
      }
    }

    const updatedProducts: Array<{ id: string; name: string; stock: number; delta: number; costPriceVnd: number; totalCostVnd: number }> = [];

    for (const item of input.items) {
      const productUpdate: Record<string, any> = { updatedAt: now };
      if (item.costPriceVnd !== undefined) {
        productUpdate.costPriceVnd = item.costPriceVnd;
      }
      if (item.sellingPriceVnd !== undefined) {
        productUpdate.priceVnd = item.sellingPriceVnd;
      }

      const updated = await c.products.findOneAndUpdate(
        { productId: item.productId, deletedAt: null },
        { $inc: { stock: item.delta, version: 1 }, $set: productUpdate },
        { session, returnDocument: 'after' }
      );
      if (!updated) {
        throw new ApiError(404, 'PRODUCT_NOT_FOUND', `Sản phẩm ${item.productId} không tồn tại`);
      }

      const nextStock = updated.stock;
      const activeCostPrice = item.costPriceVnd ?? updated.costPriceVnd ?? 0;
      const activeSellingPrice = item.sellingPriceVnd ?? updated.priceVnd;
      const totalCostVnd = item.delta * activeCostPrice;
      const operationId = `stock:${res.locals.admin}:${intakeBatchId}:${item.productId}`;

      await c.inventoryMovements.insertOne({
        productId: item.productId,
        delta: item.delta,
        reason: 'stock_intake',
        operationId,
        batchId: intakeBatchId,
        stockAfter: nextStock,
        requestFingerprint: fingerprint,
        createdAt: now,
        productNameSnapshot: updated.name,
        volumeSnapshot: updated.volume,
        costPriceVnd: activeCostPrice,
        sellingPriceVnd: activeSellingPrice,
        totalCostVnd,
        responsiblePerson: input.responsiblePerson,
        transferDate: parsedTransferDate,
        note: input.note ? input.note.trim() : 'Nhập hàng vào kho'
      } as any, { session });

      updatedProducts.push({
        id: item.productId,
        name: updated.name,
        stock: nextStock,
        delta: item.delta,
        costPriceVnd: activeCostPrice,
        totalCostVnd
      });
    }

    const batchResult = { intakeBatchId, count: updatedProducts.length, items: updatedProducts };
    if (input.clientRequestId) {
      await c.appSettings.updateOne(
        { key: `idempotency:drink_batch:${input.clientRequestId}` },
        { $set: { value: batchResult, fingerprint, updatedAt: now } },
        { session, upsert: true }
      );
    }
    return batchResult;
  });

  for (const p of result.items) {
    broadcastEvent({ type: 'stock_updated', data: { productId: p.id, stock: p.stock }, timestamp: new Date().toISOString() });
  }
  await invalidateCatalogCache();
  await recordAuditLog(res.locals.admin, 'batch_stock_intake', result.intakeBatchId, { count: result.count }, req.ip);
  res.json(result);
});

adminRouter.get('/inventory/intake-history', requirePermission('intake-history'), async (req, res) => {
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
      $addFields: {
        effectiveBatchId: {
          $let: {
            vars: {
              rawBatchId: {
                $regexFind: {
                  input: { $ifNull: ['$batchId', ''] },
                  regex: 'batch-[0-9]+-[a-zA-Z0-9]{4,8}',
                  options: 'i'
                }
              },
              foundInOp: {
                $regexFind: {
                  input: { $ifNull: ['$operationId', ''] },
                  regex: 'batch-[0-9]+-[a-zA-Z0-9]{4,8}',
                  options: 'i'
                }
              },
              foundInNote: {
                $regexFind: {
                  input: { $ifNull: ['$note', ''] },
                  regex: 'batch-[0-9]+-[a-zA-Z0-9]{4,8}',
                  options: 'i'
                }
              }
            },
            in: {
              $ifNull: [
                '$$rawBatchId.match',
                {
                  $ifNull: [
                    '$batchId',
                    {
                      $ifNull: [
                        '$$foundInOp.match',
                        {
                          $ifNull: [
                            '$$foundInNote.match',
                            {
                              $concat: [
                                'batch-legacy-',
                                { $ifNull: ['$responsiblePerson', 'admin'] },
                                '-',
                                { $dateToString: { format: '%Y-%m-%d-%H-%M', date: '$createdAt' } }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    },
    {
      $group: {
        _id: '$effectiveBatchId',
        createdAt: { $max: '$createdAt' },
        responsiblePerson: { $first: '$responsiblePerson' },
        note: { $first: '$note' },
        batchQuantity: { $sum: '$delta' },
        batchCostValueVnd: {
          $sum: { $ifNull: ['$totalCostVnd', { $multiply: [{ $ifNull: ['$costPriceVnd', 0] }, '$delta'] }] }
        },
        batchExpectedRevenueVnd: {
          $sum: { $multiply: [{ $ifNull: ['$sellingPriceVnd', 0] }, '$delta'] }
        },
        movements: { $push: '$$ROOT' }
      }
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalBatches: { $sum: 1 },
              totalQuantity: { $sum: '$batchQuantity' },
              totalCostValueVnd: { $sum: '$batchCostValueVnd' },
              totalExpectedRevenueVnd: { $sum: '$batchExpectedRevenueVnd' }
            }
          }
        ],
        totalCount: [{ $count: 'count' }],
        batches: [
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

  const paginatedBatches = aggregationResult?.batches || [];
  const rawItems = paginatedBatches.flatMap((b: any) => b.movements || []);
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

    let batchId = m.batchId;
    if (batchId) {
      const match = batchId.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
      if (match) batchId = match[1];
    }
    if (!batchId && m.operationId) {
      const match = m.operationId.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
      if (match) batchId = match[1];
    }
    if (!batchId && m.note) {
      const match = m.note.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i) || m.note.match(/\(Lô\s+([^)]+)\)/i);
      if (match) batchId = match[1];
    }
    if (!batchId) {
      batchId = m.operationId;
    }

    return {
      id: m._id ? m._id.toString() : m.operationId,
      batchId,
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
      responsiblePerson: (m as any).responsiblePerson || 'Quản trị viên',
      note: ((m.note || (m.reason === 'stock_intake' ? 'Nhập hàng vào kho' : 'Điều chỉnh tồn kho tăng')) as string).replace(/\s*\((?:Lô\s+)?[a-zA-Z0-9_-]+\)/gi, '').trim() || 'Nhập hàng vào kho',
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
adminRouter.post('/courts', requirePermission('courts'), async (req, res) => {
  const input = z.object({ code: courtCode, name: z.string().trim().min(1).max(100) }).strict().parse(req.body);
  const c = getCollections();
  const existing = await c.courts.findOne({ code: input.code });
  if (existing) throw new ApiError(409, 'DUPLICATE_CODE', 'Mã sân đã tồn tại trong hệ thống, vui lòng dùng mã khác');
  const now = new Date();
  const court = { ...input, courtId: randomUUID(), sortOrder: Number(input.code), isActive: true, deletedAt: null, createdAt: now, updatedAt: now };
  await c.courts.insertOne(court);
  res.status(201).json({ id: court.courtId, ...input, isActive: true });
});
adminRouter.patch('/courts/:id', requirePermission('courts'), async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional() }).strict().parse(req.body);
  const result = await getCollections().courts.findOneAndUpdate({ courtId: id.parse(req.params.id), deletedAt: null }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!result) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sân');
  res.json({ id: result.courtId, code: result.code, name: result.name, isActive: result.isActive });
});
adminRouter.delete('/courts/:id', requirePermission('courts'), async (req, res) => {
  const courtId = id.parse(req.params.id);
  await transaction(async session => {
    const c = getCollections();
    const court = await c.courts.findOneAndUpdate({ courtId, deletedAt: null }, { $set: { deletedAt: new Date(), isActive: false, updatedAt: new Date() } }, { session });
    if (!court) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sân');
    if (await c.orders.countDocuments({ courtId, status: { $in: ['new', 'accepted', 'preparing'] } }, { session })) throw new ApiError(409, 'COURT_HAS_ACTIVE_ORDERS', 'Sân đang có đơn chưa hoàn tất');
  });
  res.json({ courtId });
});

adminRouter.get('/reports/history', requirePermission(['order-history', 'sports-order-history']), async (req, res) => {
  const query = z.object({
    courtId: id.optional(),
    status: z.enum(['all','new','accepted','preparing','delivered','cancelled','paid_cash','paid_transfer']).optional(),
    paymentStatus: z.enum(['all','unpaid','paid']).optional(),
    paymentMethod: z.enum(['all','cash','transfer']).optional(),
    orderType: z.enum(['all','drinks','sports_pos']).optional().default('all'),
    timePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    before: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    page: z.coerce.number().int().min(1).optional(),
    cursor: id.optional()
  }).parse(req.query);

  const perms: string[] = res.locals.permissions || [];
  const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
  const isSuperAdmin = perms.includes('*') || (res.locals.admin === envAdminUser && !res.locals.userId) || res.locals.roleId === 'admin';
  const canDrinks = isSuperAdmin || perms.includes('order-history');
  const canSports = isSuperAdmin || perms.includes('sports-order-history');

  if (!canDrinks && !canSports) {
    throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập lịch sử đơn hàng');
  }

  if (!canDrinks && canSports) {
    if (query.orderType === 'drinks') {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền xem lịch sử đơn nước');
    }
    query.orderType = 'sports_pos';
  } else if (canDrinks && !canSports) {
    if (query.orderType === 'sports_pos') {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền xem lịch sử đơn thể thao');
    }
    query.orderType = 'drinks';
  }

  const baseFilter: Record<string,unknown> = {};
  if(query.courtId && query.courtId !== 'all') baseFilter.courtId = query.courtId;

  if (query.orderType === 'drinks') {
    baseFilter.orderType = { $ne: 'sports_pos' };
  } else if (query.orderType === 'sports_pos') {
    baseFilter.orderType = 'sports_pos';
  }

  if (query.status === 'paid_cash') {
    baseFilter.status = 'delivered';
    baseFilter.paymentStatus = 'paid';
    baseFilter.paymentMethod = { $in: ['cash', null, undefined] };
  } else if (query.status === 'paid_transfer') {
    baseFilter.status = 'delivered';
    baseFilter.paymentStatus = 'paid';
    baseFilter.paymentMethod = 'transfer';
  } else if (query.status && query.status !== 'all') {
    baseFilter.status = query.status;
  }

  if (query.paymentMethod && query.paymentMethod !== 'all') {
    if (query.paymentMethod === 'cash') {
      baseFilter.paymentMethod = { $in: ['cash', null, undefined] };
    } else {
      baseFilter.paymentMethod = query.paymentMethod;
    }
    baseFilter.paymentStatus = 'paid';
  }

  if (query.paymentStatus && query.paymentStatus !== 'all' && !baseFilter.paymentStatus) {
    baseFilter.paymentStatus = query.paymentStatus;
  }

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
              totalIce: { $sum: '$items.iceQuantity' },
              totalCostVnd: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', 'delivered'] },
                    { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] },
                    0
                  ]
                }
              }
            }
          }
        ]
      }
    }
  ]).toArray();

  const totalMatched = summaryAgg?.stats?.[0]?.totalOrders || 0;
  const totalRevenueVnd = summaryAgg?.stats?.[0]?.totalRevenueVnd || 0;
  const totalBottles = summaryAgg?.bottles?.[0]?.totalBottles || 0;
  const totalCostVnd = summaryAgg?.bottles?.[0]?.totalCostVnd || 0;
  const totalProfitVnd = Math.max(0, totalRevenueVnd - totalCostVnd);

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
      totalCostVnd,
      totalProfitVnd,
      totalBottles
    }
  });
});
adminRouter.get('/reports/summary', requirePermission('revenue-report'), async (req, res) => {
  const timeFilter = z.enum(['today', 'yesterday', '7days', 'month', 'all']).default('today').parse(req.query.timeFilter);
  const categoryFilter = z.enum(['all', 'drinks', 'sports', 'service']).default('all').parse(req.query.categoryFilter || 'all');
  const c = getCollections();

  const matchStage: any = { status: 'delivered', deliveredAt: dateRange(timeFilter) };
  if (categoryFilter === 'drinks') {
    matchStage.orderType = { $ne: 'sports_pos' };
  } else if (categoryFilter === 'sports' || categoryFilter === 'service') {
    matchStage.orderType = 'sports_pos';
  }

  const pipeline = [{ $match: matchStage }, {
    $facet: {
      totals: [{
        $group: {
          _id: null,
          orders: { $sum: 1 },
          deliveredRevenue: { $sum: '$totalVnd' },
          paidRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
          },
          unpaidDebt: {
            $sum: { $cond: [{ $ne: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
          },
          unpaidOrdersCount: {
            $sum: { $cond: [{ $ne: ['$paymentStatus', 'paid'] }, 1, 0] }
          }
        }
      }],
      courts: [
        {
          $group: {
            _id: '$courtId',
            name: { $last: '$courtNameSnapshot' },
            revenue: { $sum: '$totalVnd' },
            paidRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalVnd', 0] }
            },
            ordersCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } }
      ],
      products: [
        { $unwind: '$items' },
        ...(categoryFilter !== 'all' ? [{
          $match: {
            'items.itemType': categoryFilter === 'drinks' ? { $in: ['drink', null] } : categoryFilter
          }
        }] : []),
        {
          $group: {
            _id: '$items.productId',
            name: { $last: '$items.nameSnapshot' },
            unit: { $last: '$items.volumeSnapshot' },
            itemType: { $last: { $ifNull: ['$items.itemType', 'drink'] } },
            quantity: { $sum: '$items.quantity' },
            ice: { $sum: '$items.iceQuantity' },
            revenue: { $sum: '$items.lineTotalVnd' },
            cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] } }
          }
        },
        { $sort: { revenue: -1 } }
      ],
      breakdown: [
        { $unwind: '$items' },
        {
          $group: {
            _id: { $ifNull: ['$items.itemType', 'drink'] },
            revenue: { $sum: '$items.lineTotalVnd' },
            paidRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$items.lineTotalVnd', 0] }
            },
            cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPriceVnd', 0] }, '$items.quantity'] } },
            quantity: { $sum: '$items.quantity' }
          }
        }
      ],
      paymentMethods: [
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: { $ifNull: ['$paymentMethod', 'cash'] },
            revenue: { $sum: '$totalVnd' },
            count: { $sum: 1 }
          }
        }
      ],
      paymentMethodsByDomain: [
        { $match: { paymentStatus: 'paid' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              itemType: { $ifNull: ['$items.itemType', 'drink'] },
              method: { $ifNull: ['$paymentMethod', 'cash'] }
            },
            revenue: { $sum: '$items.lineTotalVnd' },
            quantity: { $sum: '$items.quantity' }
          }
        }
      ]
    }
  }];

  const paidInPeriodMatch: any = {
    paymentStatus: 'paid',
    paidAt: dateRange(timeFilter)
  };
  if (categoryFilter === 'drinks') {
    paidInPeriodMatch.orderType = { $ne: 'sports_pos' };
  } else if (categoryFilter === 'sports' || categoryFilter === 'service') {
    paidInPeriodMatch.orderType = 'sports_pos';
  }

  const [[summary], [pending], [unpaid], [collectedInPeriod]] = await Promise.all([
    c.orders.aggregate(pipeline).toArray(),
    c.orders.aggregate([{ $match: { status: { $in: ['new', 'accepted', 'preparing'] } } }, { $group: { _id: null, total: { $sum: '$totalVnd' }, count: { $sum: 1 } } }]).toArray(),
    c.orders.aggregate([{ $match: { paymentStatus: 'unpaid', status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$totalVnd' }, count: { $sum: 1 } } }]).toArray(),
    c.orders.aggregate([
      { $match: paidInPeriodMatch },
      {
        $facet: {
          methods: [
            {
              $group: {
                _id: { $ifNull: ['$paymentMethod', 'cash'] },
                revenue: { $sum: '$totalVnd' },
                count: { $sum: 1 }
              }
            }
          ],
          domains: [
            { $unwind: '$items' },
            {
              $group: {
                _id: {
                  itemType: { $ifNull: ['$items.itemType', 'drink'] },
                  method: { $ifNull: ['$paymentMethod', 'cash'] }
                },
                revenue: { $sum: '$items.lineTotalVnd' }
              }
            }
          ]
        }
      }
    ]).toArray()
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

  const domainPmList = summary?.paymentMethodsByDomain || [];
  const getDomainMethodRevenue = (domain: string, method: string) => {
    return domainPmList.find((p: any) => p._id?.itemType === domain && p._id?.method === method)?.revenue || 0;
  };

  const periodMethods = collectedInPeriod?.methods || [];
  const periodDomains = collectedInPeriod?.domains || [];
  const getPeriodDomainRevenue = (domain: string, method: string) => {
    return periodDomains.find((p: any) => p._id?.itemType === domain && p._id?.method === method)?.revenue || 0;
  };

  // Thu tiền thực tế theo ngày thanh toán trong kỳ (strictly không fallback theo deliveredAt để bảo đảm tính chuẩn xác tài chính)
  const periodCash = periodMethods.find((p: any) => p._id === 'cash')?.revenue;
  const periodTransfer = periodMethods.find((p: any) => p._id === 'transfer')?.revenue;

  const totalPaidCash = periodCash ?? 0;
  const totalPaidTransfer = periodTransfer ?? 0;

  let cashRevenue = totalPaidCash;
  let transferRevenue = totalPaidTransfer;
  let collectedRevenue = totalPaidCash + totalPaidTransfer;
  let deliveredRevenue = summary?.totals[0]?.deliveredRevenue || 0;
  let unpaidDebtVnd = summary?.totals[0]?.unpaidDebt || 0;

  if (categoryFilter !== 'all') {
    const domainKey = categoryFilter === 'drinks' ? 'drink' : categoryFilter;
    const catPeriodCash = getPeriodDomainRevenue(domainKey, 'cash') ?? 0;
    const catPeriodTransfer = getPeriodDomainRevenue(domainKey, 'transfer') ?? 0;
    cashRevenue = catPeriodCash;
    transferRevenue = catPeriodTransfer;
    collectedRevenue = cashRevenue + transferRevenue;
    deliveredRevenue = products.reduce((acc: number, p: any) => acc + (p.revenue || 0), 0);
    unpaidDebtVnd = Math.max(0, deliveredRevenue - collectedRevenue);
  }

  // Doanh thu đơn đã giao (tương thích ngược) & Doanh thu thực thu
  const totalRevenueVnd = deliveredRevenue;
  const totalCostVnd = products.reduce((acc: number, p: any) => acc + (p.cost || 0), 0);
  const totalProfitVnd = totalRevenueVnd - totalCostVnd;
  const overallMargin = totalRevenueVnd > 0 ? Math.round((totalProfitVnd / totalRevenueVnd) * 1000) / 10 : 0;

  // Tổng hợp phân bổ theo nhóm — chuẩn hóa công thức đồng nhất giữa tổng thể và nhóm con
  const breakdownRows = summary?.breakdown || [];
  const drinksStat = breakdownRows.find((b: any) => b._id === 'drink') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };
  const sportsStat = breakdownRows.find((b: any) => b._id === 'sports') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };
  const serviceStat = breakdownRows.find((b: any) => b._id === 'service') || { revenue: 0, paidRevenue: 0, cost: 0, quantity: 0 };

  const drinksRevenue = drinksStat.revenue || 0;
  const drinksCost = drinksStat.cost || 0;
  const drinksProfit = drinksRevenue - drinksCost;

  const sportsRevenue = sportsStat.revenue || 0;
  const sportsCost = sportsStat.cost || 0;
  const sportsProfit = sportsRevenue - sportsCost;

  const serviceRevenue = serviceStat.revenue || 0;
  const serviceCost = serviceStat.cost || 0;
  const serviceProfit = serviceRevenue - serviceCost;

  res.json({
    timeFilter,
    categoryFilter,
    totalRevenueVnd,
    collectedRevenue,
    deliveredRevenue,
    unpaidDebtVnd,
    totalCostVnd,
    totalProfitVnd,
    totalCashProfitVnd: collectedRevenue - totalCostVnd,
    profitMarginPercent: overallMargin,
    cashRevenue,
    transferRevenue,
    totalOrdersDelivered: summary?.totals[0]?.orders || 0,
    uncollectedRevenueVnd: pending?.total || 0,
    totalOrdersUncollected: pending?.count || 0,
    unpaidRevenueVnd: unpaid?.total || 0,
    unpaidOrdersCount: unpaid?.count || 0,
    periodUnpaidOrdersCount: summary?.totals[0]?.unpaidOrdersCount || 0,
    totalItemsDelivered: products.reduce((n: number, p: { quantity: number }) => n + p.quantity, 0),
    totalBottlesDelivered: drinksStat.quantity || 0,
    breakdown: {
      drinks: {
        revenue: drinksRevenue,
        collectedRevenue: drinksStat.paidRevenue || (getDomainMethodRevenue('drink', 'cash') + getDomainMethodRevenue('drink', 'transfer')),
        cost: drinksCost,
        profit: drinksProfit,
        cashProfit: (drinksStat.paidRevenue || 0) - drinksCost,
        quantity: drinksStat.quantity || 0,
        cashRevenue: getDomainMethodRevenue('drink', 'cash'),
        transferRevenue: getDomainMethodRevenue('drink', 'transfer')
      },
      sports: {
        revenue: sportsRevenue,
        collectedRevenue: sportsStat.paidRevenue || (getDomainMethodRevenue('sports', 'cash') + getDomainMethodRevenue('sports', 'transfer')),
        cost: sportsCost,
        profit: sportsProfit,
        cashProfit: (sportsStat.paidRevenue || 0) - sportsCost,
        quantity: sportsStat.quantity || 0,
        cashRevenue: getDomainMethodRevenue('sports', 'cash'),
        transferRevenue: getDomainMethodRevenue('sports', 'transfer')
      },
      service: {
        revenue: serviceRevenue,
        collectedRevenue: serviceStat.paidRevenue || (getDomainMethodRevenue('service', 'cash') + getDomainMethodRevenue('service', 'transfer')),
        cost: serviceCost,
        profit: serviceProfit,
        cashProfit: (serviceStat.paidRevenue || 0) - serviceCost,
        quantity: serviceStat.quantity || 0,
        cashRevenue: getDomainMethodRevenue('service', 'cash'),
        transferRevenue: getDomainMethodRevenue('service', 'transfer')
      }
    },
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

adminRouter.get('/backup/full', requirePermission('backup'), async (_req, res) => {
  const c = getCollections();

  const [products, courts, orders, settings, auditLogs, inventoryMovements, orderSequences, sportsItems, sportsMovements, roles, users] = await snapshotRead(async (session) => {
    const p = await c.products.find({ deletedAt: null }, { session }).sort({ category: 1, name: 1 }).toArray();
    const ct = await c.courts.find({ deletedAt: null }, { session }).sort({ sortOrder: 1 }).toArray();
    const ord = await c.orders.find({}, { session }).sort({ createdAt: -1 }).toArray();
    const st = await c.appSettings.findOne({ key: 'system_config' }, { session });
    const al = await c.auditLogs.find({}, { session }).sort({ createdAt: -1 }).toArray();
    const im = await c.inventoryMovements.find({}, { session }).sort({ createdAt: -1 }).toArray();
    const seq = await c.appSettings.find({ key: { $regex: '^order_sequence' } }, { session }).toArray();
    const si = await c.sportsItems.find({ deletedAt: null }, { session }).sort({ category: 1, name: 1 }).toArray();
    const sm = await c.sportsMovements.find({}, { session }).sort({ createdAt: -1 }).toArray();
    const r = await c.roles.find({}, { session }).sort({ isSystem: -1, createdAt: 1 }).toArray();
    const u = await c.adminUsers.find({}, { projection: { passwordHash: 0 }, session }).sort({ createdAt: -1 }).toArray();
    return [p, ct, ord, st, al, im, seq, si, sm, r, u];
  });

  const fullBackup = {
    system: 'Sân Cầu Lông Trần Lựu',
    backupType: 'full_system',
    schemaVersion: '2.0.0',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    stats: {
      productsCount: products.length,
      sportsItemsCount: sportsItems.length,
      courtsCount: courts.length,
      ordersCount: orders.length,
      rolesCount: roles.length,
      usersCount: users.length,
      auditLogsCount: auditLogs.length,
      inventoryCount: inventoryMovements.length,
      sportsMovementsCount: sportsMovements.length,
      stockIntakeCount: inventoryMovements.filter(m => ['stock_intake', 'quick_restock', 'stock_adjustment'].includes(m.reason)).length,
      orderSequencesCount: orderSequences.length
    },
    products: products.map(productJson),
    sportsItems: sportsItems.map(item => ({
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      unit: item.unit,
      costPriceVnd: item.costPriceVnd,
      priceVnd: item.priceVnd,
      stock: item.stock,
      minStockThreshold: item.minStockThreshold ?? 5,
      isService: item.isService,
      isAvailable: item.isAvailable,
      imageSvg: item.imageSvg || '',
      tag: item.tag || ''
    })),
    courts: courts.map(court => ({ courtId: court.courtId, code: court.code, name: court.name, isActive: court.isActive, sortOrder: court.sortOrder })),
    orders: orders.map(o => ({
      id: o.orderId,
      orderId: o.orderId,
      displayCode: o.displayCode,
      clientRequestId: o.clientRequestId,
      requestFingerprint: o.requestFingerprint || null,
      orderType: o.orderType || 'drinks',
      courtId: o.courtId,
      courtName: o.courtNameSnapshot,
      customerName: o.customerName || '',
      customerPhone: o.customerPhone || '',
      customerSessionHash: o.customerSessionHash,
      paymentStatus: o.paymentStatus || 'unpaid',
      paymentMethod: o.paymentMethod || null,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      paymentHistory: (o.paymentHistory || []).map((p: any) => ({
        from: p.from,
        to: p.to,
        paymentStatus: p.to || p.paymentStatus,
        paymentMethod: p.paymentMethod || null,
        changedBy: p.changedBy || 'system',
        reason: p.reason || null,
        at: p.at ? p.at.toISOString() : (p.changedAt ? p.changedAt.toISOString() : new Date().toISOString())
      })),
      status: o.status,
      totalVnd: o.totalVnd,
      createdAt: o.createdAt.toISOString(),
      editableUntil: o.editableUntil.toISOString(),
      acceptedAt: o.acceptedAt ? o.acceptedAt.toISOString() : null,
      preparingAt: o.preparingAt ? o.preparingAt.toISOString() : null,
      deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
      cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
      cancelReason: o.cancelReason,
      items: o.items.map(i => ({
        productId: i.productId,
        name: i.nameSnapshot,
        volume: i.volumeSnapshot,
        unitPrice: i.unitPriceVnd,
        costPrice: i.costPriceVnd ?? 0,
        quantity: i.quantity,
        iceQuantity: i.iceQuantity,
        lineTotal: i.lineTotalVnd,
        itemType: i.itemType || (o.orderType === 'sports_pos' ? 'sports' : 'drink')
      }))
    })),
    roles: roles.map(r => ({
      roleId: r.roleId,
      name: r.name,
      description: r.description || '',
      permissions: r.permissions,
      isSystem: r.isSystem || false
    })),
    users: users.map(u => ({
      userId: u.userId,
      username: u.username,
      fullName: u.fullName,
      roleId: u.roleId,
      customPermissions: u.customPermissions || [],
      isActive: u.isActive
    })),
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
    sportsMovements: sportsMovements.map(m => ({
      operationId: m.operationId,
      itemId: m.itemId,
      itemNameSnapshot: m.itemNameSnapshot,
      unitSnapshot: m.unitSnapshot,
      delta: m.delta,
      costPriceVnd: m.costPriceVnd,
      sellingPriceVnd: m.sellingPriceVnd,
      totalCostVnd: m.totalCostVnd,
      stockAfter: m.stockAfter,
      reason: m.reason,
      note: m.note || '',
      createdAt: m.createdAt
    })),
    settings: settings?.value || null
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tran_luu_full_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(fullBackup);
});

adminRouter.post('/catalog/import', requirePermission('backup'), async (req, res) => {
  const { data: body, migrated, fromVersion } = migrateBackupToV2(req.body);

  const backupImportSchema = z.object({
    schemaVersion: z.string().optional(),
    system: z.string().optional(),
    products: z.array(z.record(z.string(), z.unknown())).optional(),
    sportsItems: z.array(z.record(z.string(), z.unknown())).optional(),
    courts: z.array(z.record(z.string(), z.unknown())).optional(),
    orders: z.array(z.record(z.string(), z.unknown())).optional(),
    roles: z.array(z.record(z.string(), z.unknown())).optional(),
    users: z.array(z.record(z.string(), z.unknown())).optional(),
    orderSequences: z.array(z.record(z.string(), z.unknown())).optional(),
    inventoryMovements: z.array(z.record(z.string(), z.unknown())).optional(),
    sportsMovements: z.array(z.record(z.string(), z.unknown())).optional(),
    auditLogs: z.array(z.record(z.string(), z.unknown())).optional(),
    settings: z.record(z.string(), z.unknown()).optional().nullable()
  }).passthrough();

  const parsedBackup = backupImportSchema.safeParse(body);
  if (!parsedBackup.success) {
    throw new ApiError(400, 'INVALID_IMPORT', 'Định dạng tệp JSON không hợp lệ');
  }

  const c = getCollections();
  const now = new Date();

  const rawProducts = Array.isArray(body) ? body : Array.isArray(body.products) ? body.products : null;
  const hasRoles = Array.isArray(body.roles) && body.roles.length > 0;
  const hasUsers = Array.isArray(body.users) && body.users.length > 0;

  // 1. Chống tự leo quyền (Privilege Escalation): Bắt buộc kiểm tra quyền rbac nếu payload chứa roles hoặc users
  if (hasRoles || hasUsers) {
    const callerPerms = (res.locals.permissions as string[]) || [];
    const canManageRbac = callerPerms.includes('*') || callerPerms.includes('rbac') || res.locals.roleId === 'admin';
    if (!canManageRbac) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền khôi phục vai trò (roles) hoặc tài khoản người dùng (users). Cần quyền rbac.');
    }
  }

  // 2. Tiền kiểm tra All-or-Nothing: Không âm thầm bỏ qua (continue) bản ghi lỗi
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

  if (rawProducts && rawProducts.length > 0) {
    rawProducts.forEach((item: any, idx: number) => {
      const parsed = productFields.partial({ imageSvg: true, tag: true, isAvailable: true }).safeParse(item);
      if (!parsed.success) {
        const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu sản phẩm tại dòng ${idx + 1} (${item?.name || 'không tên'}) không hợp lệ: ${details}`);
      }
    });
  }

  if (Array.isArray(body.sportsItems) && body.sportsItems.length > 0) {
    const sportsItemImportSchema = z.object({
      name: z.string().trim().min(1, 'Tên sản phẩm/dịch vụ không được để trống'),
      category: z.string().trim().min(1, 'Hạng mục không được để trống'),
      unit: z.string().optional(),
      costPriceVnd: z.coerce.number().min(0, 'Giá vốn không được âm').optional(),
      priceVnd: z.coerce.number().min(0, 'Giá bán không được âm').optional(),
      stock: z.coerce.number().min(0, 'Tồn kho không được âm').optional(),
      minStockThreshold: z.coerce.number().min(0, 'Ngưỡng cảnh báo tồn kho không được âm').optional(),
      isService: z.boolean().optional(),
      isAvailable: z.boolean().optional(),
      imageSvg: z.string().optional(),
      tag: z.string().optional()
    });

    body.sportsItems.forEach((item: any, idx: number) => {
      const parsed = sportsItemImportSchema.safeParse(item);
      if (!parsed.success) {
        const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `Mặt hàng thể thao tại dòng ${idx + 1} (${item?.name || 'không tên'}) không hợp lệ: ${details}`);
      }
    });
  }

  if (Array.isArray(body.roles) && body.roles.length > 0) {
    body.roles.forEach((r: any, idx: number) => {
      if (!r.roleId || !r.name || !Array.isArray(r.permissions)) {
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu vai trò tại dòng ${idx + 1} không hợp lệ (cần roleId, name, permissions)`);
      }
    });
  }

  if (Array.isArray(body.users) && body.users.length > 0) {
    const userImportSchema = z.object({
      userId: z.string().trim().min(1, 'UserId không hợp lệ'),
      username: z.string().trim().min(1, 'Username không hợp lệ'),
      roleId: z.string().trim().min(1, 'RoleId không hợp lệ')
    });

    const existingRoles = await c.roles.find({}, { projection: { roleId: 1 } }).toArray();
    const allowedRoleIds = new Set<string>(existingRoles.map(r => r.roleId));
    allowedRoleIds.add('admin');
    if (Array.isArray(body.roles)) {
      body.roles.forEach((r: any) => {
        if (r && r.roleId) allowedRoleIds.add(r.roleId);
      });
    }

    body.users.forEach((u: any, idx: number) => {
      const parsed = userImportSchema.safeParse(u);
      if (!parsed.success) {
        const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu người dùng tại dòng ${idx + 1} (${u?.username || 'không tên'}) không hợp lệ: ${details}`);
      }
      if (!allowedRoleIds.has(u.roleId)) {
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `Người dùng "${u.username}" tại dòng ${idx + 1} có roleId "${u.roleId}" không tồn tại trong hệ thống hoặc tệp nhập`);
      }
    });
  }

  let importedProducts = 0;
  let importedCourts = 0;
  let importedOrders = 0;
  let importedSequences = 0;
  let importedSettings = 0;
  let importedMovements = 0;
  let importedAudit = 0;
  let importedSportsItems = 0;
  let importedSportsMovements = 0;
  let importedRoles = 0;
  let importedUsers = 0;
  const temporaryCredentials: Array<{ username: string; userId: string; tempPassword: string }> = [];

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
            requestFingerprint: o.requestFingerprint || null,
            orderType: o.orderType || 'drinks',
            courtId: o.courtId,
            courtNameSnapshot: o.courtName || o.courtNameSnapshot || '',
            customerName: o.customerName || '',
            customerPhone: o.customerPhone || '',
            customerSessionHash: o.customerSessionHash || 'restored',
            paymentStatus: o.paymentStatus || 'unpaid',
            paymentMethod: o.paymentMethod || null,
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
              lineTotalVnd: Number(i.lineTotal || i.lineTotalVnd) || 0,
              itemType: i.itemType || (o.orderType === 'sports_pos' ? 'sports' : 'drink')
            })),
            createdAt: o.createdAt ? new Date(o.createdAt) : now,
            updatedAt: o.updatedAt ? new Date(o.updatedAt) : now,
            editableUntil: o.editableUntil ? new Date(o.editableUntil) : now,
            acceptedAt: o.acceptedAt ? new Date(o.acceptedAt) : null,
            preparingAt: o.preparingAt ? new Date(o.preparingAt) : null,
            deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
            cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
            cancelReason: o.cancelReason || null,
            paymentHistory: Array.isArray(o.paymentHistory) ? o.paymentHistory.map((p: any) => ({
              from: p.from,
              to: p.to || p.paymentStatus,
              paymentStatus: p.to || p.paymentStatus,
              paymentMethod: p.paymentMethod || null,
              changedBy: p.changedBy || 'import',
              reason: p.reason || null,
              at: p.at ? new Date(p.at) : (p.changedAt ? new Date(p.changedAt) : now)
            })) : []
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

    // 8. Khôi phục hàng thể thao & dịch vụ nếu có
    if (Array.isArray(body.sportsItems) && body.sportsItems.length > 0) {
      for (const item of body.sportsItems) {
        if (!item.name || !item.category) continue;
        const itemId = item.itemId || item.id || randomUUID();
        await c.sportsItems.updateOne(
          { itemId },
          {
            $set: {
              name: item.name,
              category: item.category,
              unit: item.unit || 'Cái',
              costPriceVnd: typeof item.costPriceVnd === 'number'
                ? Math.max(0, item.costPriceVnd)
                : (!isNaN(Number(item.costPriceVnd)) ? Math.max(0, Number(item.costPriceVnd)) : 0),
              priceVnd: typeof item.priceVnd === 'number'
                ? Math.max(0, item.priceVnd)
                : (!isNaN(Number(item.priceVnd)) ? Math.max(0, Number(item.priceVnd)) : 0),
              minStockThreshold: item.minStockThreshold !== undefined && item.minStockThreshold !== null && !isNaN(Number(item.minStockThreshold))
                ? Math.max(0, Number(item.minStockThreshold))
                : 5,
              isService: Boolean(item.isService || item.category === 'service'),
              isAvailable: item.isAvailable !== false,
              imageSvg: item.imageSvg || '',
              tag: item.tag || '',
              deletedAt: null,
              updatedAt: now
            },
            $setOnInsert: {
              itemId,
              stock: item.stock !== undefined && item.stock !== null && !isNaN(Number(item.stock))
                ? Math.max(0, Number(item.stock))
                : 0,
              createdAt: now
            }
          },
          { session, upsert: true }
        );
        importedSportsItems++;
      }
    }

    // 9. Khôi phục lịch sử biến động thể thao nếu có
    if (Array.isArray(body.sportsMovements) && body.sportsMovements.length > 0) {
      for (const mov of body.sportsMovements) {
        if (mov.operationId && mov.itemId) {
          const existing = await c.sportsMovements.findOne({ operationId: mov.operationId }, { session });
          if (!existing) {
            await c.sportsMovements.insertOne({
              operationId: mov.operationId,
              itemId: mov.itemId,
              itemNameSnapshot: mov.itemNameSnapshot || mov.itemName || '',
              unitSnapshot: mov.unitSnapshot || mov.unit || 'Cái',
              delta: Number(mov.delta) || 0,
              costPriceVnd: Number(mov.costPriceVnd) || 0,
              sellingPriceVnd: Number(mov.sellingPriceVnd) || 0,
              totalCostVnd: Number(mov.totalCostVnd) || 0,
              stockAfter: Number(mov.stockAfter) || 0,
              reason: mov.reason || 'stock_intake',
              note: mov.note || '',
              createdAt: mov.createdAt ? new Date(mov.createdAt) : now
            }, { session });
            importedSportsMovements++;
          }
        }
      }
    }

    // 10. Khôi phục vai trò (roles) nếu có
    if (Array.isArray(body.roles) && body.roles.length > 0) {
      for (const r of body.roles) {
        if (!r.roleId || !r.name || !Array.isArray(r.permissions)) continue;
        await c.roles.updateOne(
          { roleId: r.roleId },
          {
            $set: {
              name: String(r.name),
              description: r.description ? String(r.description) : '',
              permissions: r.permissions,
              isSystem: Boolean(r.isSystem),
              updatedAt: now
            },
            $setOnInsert: {
              roleId: r.roleId,
              createdAt: now
            }
          },
          { session, upsert: true }
        );
        importedRoles++;
      }
    }

    // 11. Khôi phục tài khoản người dùng (users) nếu có (yêu cầu quyền rbac đã kiểm tra ở trên)
    if (Array.isArray(body.users) && body.users.length > 0) {
      for (const u of body.users) {
        if (!u.userId || !u.username || !u.roleId) continue;
        const updateSet: Record<string, any> = {
          username: String(u.username).trim().toLowerCase(),
          fullName: u.fullName ? String(u.fullName).trim() : 'Người dùng hệ thống',
          roleId: String(u.roleId).trim(),
          customPermissions: Array.isArray(u.customPermissions) ? u.customPermissions : [],
          isActive: u.isActive !== false,
          updatedAt: now
        };
        const existingUser = await c.adminUsers.findOne({ userId: u.userId }, { session });
        if (!existingUser) {
          const tempPassword = 'Temp@' + randomUUID().replace(/-/g, '').slice(0, 8);
          updateSet.passwordHash = hashPassword(tempPassword);
          updateSet.mustChangePassword = true;
          updateSet.createdAt = now;
          await c.adminUsers.insertOne({
            userId: u.userId,
            ...updateSet
          } as any, { session });
          temporaryCredentials.push({ username: u.username, userId: u.userId, tempPassword });
        } else {
          await c.adminUsers.updateOne({ userId: u.userId }, { $set: updateSet }, { session });
        }
        importedUsers++;
      }
    }
  });

  // Thu hồi session và WebSocket nếu vai trò hoặc tài khoản được khôi phục/chỉnh sửa
  if (importedRoles > 0 && Array.isArray(body.roles)) {
    for (const r of body.roles) {
      if (r.roleId) await revokeRoleSessions(r.roleId);
    }
  }
  if (importedUsers > 0 && Array.isArray(body.users)) {
    for (const u of body.users) {
      if (u.userId) await revokeUserSessions(u.userId);
    }
  }

  // Nếu không có bất kỳ dữ liệu nào được import
  if (importedProducts === 0 && importedCourts === 0 && importedOrders === 0 && importedSequences === 0 && importedSettings === 0 && importedMovements === 0 && importedAudit === 0 && importedSportsItems === 0 && importedSportsMovements === 0 && importedRoles === 0 && importedUsers === 0) {
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
  if (importedProducts > 0) summaryParts.push(`${importedProducts} sản phẩm nước`);
  if (importedSportsItems > 0) summaryParts.push(`${importedSportsItems} mặt hàng/dịch vụ thể thao`);
  if (importedCourts > 0) summaryParts.push(`${importedCourts} sân`);
  if (importedOrders > 0) summaryParts.push(`${importedOrders} đơn hàng`);
  if (importedSequences > 0) summaryParts.push(`${importedSequences} bộ đếm mã đơn`);
  if (importedSettings > 0) summaryParts.push('cấu hình hệ thống');
  if (importedMovements > 0) summaryParts.push(`${importedMovements} biến động kho nước`);
  if (importedSportsMovements > 0) summaryParts.push(`${importedSportsMovements} biến động kho thể thao`);
  if (importedAudit > 0) summaryParts.push(`${importedAudit} nhật ký`);
  if (importedRoles > 0) summaryParts.push(`${importedRoles} vai trò`);
  if (importedUsers > 0) summaryParts.push(`${importedUsers} tài khoản người dùng`);
  const summaryMsg = summaryParts.join(', ');

  await invalidateCatalogCache();
  await recordAuditLog(res.locals.admin, 'catalog_import', undefined, { importedProducts, importedSportsItems, importedCourts, importedOrders, importedSequences, importedSettings, importedMovements, importedSportsMovements, importedRoles, importedUsers }, req.ip);
  res.json({
    ok: true,
    migrated,
    fromVersion,
    schemaVersion: '2.0.0',
    importedCount: importedProducts + importedSportsItems,
    importedProducts,
    importedSportsItems,
    importedCourts,
    importedOrders,
    importedSequences,
    importedSettings,
    importedMovements,
    importedSportsMovements,
    importedRoles,
    importedUsers,
    temporaryCredentials,
    message: `Đã khôi phục thành công: ${summaryMsg}!${temporaryCredentials.length > 0 ? ` (Đã tạo ${temporaryCredentials.length} mật khẩu tạm cho tài khoản mới)` : ''}`
  });
});

adminRouter.get('/audit-logs', requirePermission('backup'), async (req, res) => {
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

adminRouter.get('/clean/preview', requirePermission('backup'), async (req, res) => {
  const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(req.query as any);
  const c = getCollections();
  const [ordersCount, inventoryCount, auditLogsCount, activeOrdersPreserved, intakeCount, sportsMovementsCount] = await Promise.all([
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
    }),
    c.sportsMovements.countDocuments({ createdAt: dateFilter })
  ]);

  res.json({
    rangeLabel,
    beforeDate: beforeDateIso,
    ordersCount,
    inventoryCount: inventoryCount + sportsMovementsCount,
    intakeCount,
    auditLogsCount,
    activeOrdersPreserved
  });
});


adminRouter.post('/clean/purge', requirePermission('backup'), async (req, res) => {
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

  await transaction(async session => {
    if (input.includeOrders) {
      const r = await c.orders.deleteMany({
        createdAt: dateFilter,
        $or: [
          { status: 'cancelled' },
          { status: 'delivered', paymentStatus: 'paid' }
        ]
      }, { session });
      deletedOrders = r.deletedCount;
    }

    if (input.includeInventory) {
      deletedIntake = await c.inventoryMovements.countDocuments({
        createdAt: dateFilter,
        reason: { $in: ['stock_intake', 'quick_restock', 'stock_adjustment'] }
      }, { session });
      const r = await c.inventoryMovements.deleteMany({
        createdAt: dateFilter
      }, { session });
      const rSports = await c.sportsMovements.deleteMany({
        createdAt: dateFilter
      }, { session });
      deletedInventory = r.deletedCount + rSports.deletedCount;
    }

    if (input.includeAuditLogs) {
      const r = await c.auditLogs.deleteMany({
        createdAt: dateFilter
      }, { session });
      deletedAuditLogs = r.deletedCount;
    }
  });

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

