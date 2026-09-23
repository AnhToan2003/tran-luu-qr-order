import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCollections, transaction } from '../db.js';
import { requireAdmin, requirePermission, requireActionProof, requireActionProofFor } from '../auth.js';
import { ApiError } from '../errors.js';
import { invalidateCatalogCache } from '../redis.js';
import { broadcastEvent } from '../websocket.js';
import { vietnamDate } from '../time.js';
import type { SportsItemDoc, SportsMovementDoc, SportsCategory, OrderDoc, OrderItemDoc } from '../types.js';
import { dateTimeString } from '../validation.js';

export const sportsRouter = Router();

// Tất cả endpoints quản trị thể thao & dịch vụ yêu cầu xác thực phiên Quản trị
sportsRouter.use(requireAdmin);

const defaultSportsCategories = [
  { id: 'racket', name: 'Vợt cầu lông' },
  { id: 'sock_long', name: 'Vớ cổ dài' },
  { id: 'sock_short', name: 'Vớ cổ ngắn' },
  { id: 'shuttlecock', name: 'Quả / Ống cầu' },
  { id: 'grip', name: 'Quấn cán vợt' },
  { id: 'service', name: 'Dịch vụ sân' },
  { id: 'apparel', name: 'Trang phục thi đấu' },
  { id: 'other', name: 'Phụ kiện khác' }
];

const createSportsItemSchema = z.object({
  name: z.string().trim().min(1, 'Tên sản phẩm/dịch vụ không được để trống').max(120),
  category: z.string().trim().min(1, 'Hạng mục không được để trống').max(60),
  unit: z.string().trim().min(1, 'Đơn vị tính không được để trống').max(30),
  costPriceVnd: z.number().int().min(0, 'Giá vốn không hợp lệ').max(100_000_000).default(0),
  priceVnd: z.number().int().min(0, 'Giá bán không hợp lệ').max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  minStockThreshold: z.number().int().min(0).max(100_000).default(5),
  isService: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  imageSvg: z.string().max(2_000_000).optional().default(''),
  tag: z.string().trim().max(40).optional().default('')
}).strict();

// Schema CẬP NHẬT: Không chứa trường 'stock' và KHÔNG áp default cho các trường bị bỏ trống!
const updateSportsItemSchema = z.object({
  name: z.string().trim().min(1, 'Tên sản phẩm/dịch vụ không được để trống').max(120).optional(),
  category: z.string().trim().min(1, 'Hạng mục không được để trống').max(60).optional(),
  unit: z.string().trim().min(1, 'Đơn vị tính không được để trống').max(30).optional(),
  costPriceVnd: z.number().int().min(0, 'Giá vốn không hợp lệ').max(100_000_000).optional(),
  priceVnd: z.number().int().min(0, 'Giá bán không hợp lệ').max(100_000_000).optional(),
  minStockThreshold: z.number().int().min(0).max(100_000).optional(),
  isService: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  imageSvg: z.string().max(2_000_000).optional().nullable(),
  tag: z.string().trim().max(40).optional()
}).strict();

// 0. GET, POST, PUT, DELETE /api/admin/sports/categories
// P1/Issue #6 FIX: GET /categories requires relevant permission
sportsRouter.get('/categories', requirePermission(['sports-intake', 'sports-pos', 'sports-order-history', 'intake-history']), async (_req, res) => {
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'sports_categories' });
  let categories: Array<{ id: string; name: string; itemCount?: number }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultSportsCategories];

  const existingCats = await c.sportsItems.distinct('category', { deletedAt: null });
  for (const cat of existingCats) {
    if (cat && !categories.some(c => c.id === cat || c.name.toLowerCase() === String(cat).toLowerCase())) {
      categories.push({ id: String(cat), name: String(cat) });
    }
  }

  // Đếm số lượng sản phẩm/dịch vụ của từng hạng mục
  const counts = await c.sportsItems.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray();

  const countMap = new Map<string, number>();
  for (const item of counts) {
    countMap.set(String(item._id), item.count);
  }

  const categoriesWithCount = categories.map(cat => ({
    ...cat,
    itemCount: countMap.get(cat.id) || countMap.get(cat.name) || 0
  }));

  res.json({ categories: categoriesWithCount });
});

sportsRouter.post('/categories', requirePermission('sports-intake'), requireActionProofFor('sports.category'), async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'sports_categories' });
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultSportsCategories];

  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.json({ category: existing, categories });
  }

  const id = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `spcat_${Date.now()}`;

  const newCat = { id, name };
  categories.push(newCat);
  await c.appSettings.updateOne(
    { key: 'sports_categories' },
    { $set: { value: categories, updatedAt: new Date() } },
    { upsert: true }
  );

  res.status(201).json({ category: newCat, categories });
});

sportsRouter.put('/categories/:id', requirePermission('sports-intake'), requireActionProofFor('sports.category'), async (req, res) => {
  const targetId = String(req.params.id).trim();
  const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
  const c = getCollections();
  const doc = await c.appSettings.findOne({ key: 'sports_categories' });
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultSportsCategories];

  const index = categories.findIndex(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
  if (index === -1) {
    categories.push({ id: targetId, name });
  } else {
    categories[index].name = name;
  }

  await c.appSettings.updateOne(
    { key: 'sports_categories' },
    { $set: { value: categories, updatedAt: new Date() } },
    { upsert: true }
  );

  res.json({ ok: true, id: targetId, name, categories });
});

sportsRouter.delete('/categories/:id', requirePermission('sports-intake'), requireActionProofFor('sports.category'), async (req, res) => {
  const targetId = String(req.params.id).trim();
  const c = getCollections();

  const doc = await c.appSettings.findOne({ key: 'sports_categories' });
  let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...defaultSportsCategories];
  const targetCat = categories.find(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
  const targetName = targetCat ? targetCat.name : targetId;

  // Kiểm tra an toàn xem có mặt hàng thể thao nào đang dùng hạng mục này không (cả ID lẫn tên)
  const itemFilter = {
    $or: [{ category: targetId }, { category: targetName }],
    deletedAt: null
  };
  const inUseCount = await c.sportsItems.countDocuments(itemFilter);

  const moveTo = typeof req.query.moveTo === 'string' ? req.query.moveTo.trim() : typeof req.body?.moveTo === 'string' ? req.body.moveTo.trim() : undefined;
  const cascadeDelete = req.query.cascadeDelete === 'true' || req.body?.cascadeDelete === true;

  if (inUseCount > 0 && !cascadeDelete && !moveTo) {
    throw new ApiError(400, 'CATEGORY_IN_USE', `Hạng mục "${targetName}" đang có ${inUseCount} sản phẩm/dịch vụ thể thao sử dụng. Vui lòng chọn hạng mục chuyển đổi hoặc xóa kèm sản phẩm.`);
  }

  categories = categories.filter(c => c.id !== targetId && c.name.toLowerCase() !== targetId.toLowerCase());
  const now = new Date();
  await transaction(async session => {
    if (inUseCount > 0 && cascadeDelete) {
      await c.sportsItems.updateMany(itemFilter, {
        $set: { deletedAt: now, isAvailable: false, updatedAt: now }
      }, { session });
    } else if (inUseCount > 0 && moveTo) {
      await c.sportsItems.updateMany(itemFilter, {
        $set: { category: moveTo, updatedAt: now }
      }, { session });
    }

    await c.appSettings.updateOne(
      { key: 'sports_categories' },
      { $set: { value: categories, updatedAt: now } },
      { upsert: true, session }
    );
  });

  res.json({ ok: true, id: targetId, categories, affectedCount: inUseCount });
});

// 1. GET /api/admin/sports/items - Danh sách sản phẩm thể thao & dịch vụ
// P1/Issue #6 FIX: GET /items requires relevant permission
sportsRouter.get('/items', requirePermission(['sports-intake', 'sports-pos', 'sports-order-history']), async (req, res) => {
  const c = getCollections();
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : ''; // 'product' | 'service'

  const query: any = { deletedAt: null };
  if (category && category !== 'all') {
    query.category = category;
  }
  if (type === 'service') {
    query.isService = true;
  } else if (type === 'product') {
    query.isService = false;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.name = { $regex: escaped, $options: 'i' };
  }

  const items = await c.sportsItems.find(query).sort({ isService: 1, category: 1, name: 1 }).toArray();

  res.json({
    items: items.map(i => ({
      id: i.itemId,
      itemId: i.itemId,
      name: i.name,
      category: i.category,
      unit: i.unit,
      costPriceVnd: i.costPriceVnd ?? 0,
      priceVnd: i.priceVnd,
      stock: i.stock ?? 0,
      minStockThreshold: i.minStockThreshold ?? 5,
      isService: !!i.isService,
      isAvailable: i.isAvailable !== false,
      imageSvg: i.imageSvg || '',
      tag: i.tag || '',
      createdAt: i.createdAt
    }))
  });
});

// 2. POST /api/admin/sports/items - Thêm mới sản phẩm/dịch vụ
sportsRouter.post('/items', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const input = createSportsItemSchema.parse(req.body);
  const c = getCollections();

  const itemId = `sp-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const now = new Date();

  const doc: SportsItemDoc = {
    itemId,
    name: input.name,
    category: input.category as SportsCategory,
    unit: input.unit,
    costPriceVnd: input.costPriceVnd,
    priceVnd: input.priceVnd,
    stock: input.isService ? 0 : input.stock,
    minStockThreshold: input.minStockThreshold,
    isService: input.isService,
    isAvailable: input.isAvailable,
    imageSvg: input.imageSvg || '',
    tag: input.tag,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };

  await transaction(async session => {
    await c.sportsItems.insertOne(doc, { session });

    if (!input.isService && input.stock > 0) {
      const movement: SportsMovementDoc = {
        operationId: `mov-init-${randomUUID()}`,
        itemId,
        itemNameSnapshot: input.name,
        unitSnapshot: input.unit,
        delta: input.stock,
        costPriceVnd: input.costPriceVnd,
        sellingPriceVnd: input.priceVnd,
        totalCostVnd: input.stock * input.costPriceVnd,
        stockAfter: input.stock,
        reason: 'stock_intake',
        note: 'Khởi tạo tồn kho ban đầu',
        createdAt: now
      };
      await c.sportsMovements.insertOne(movement, { session });
    }
  });

  await invalidateCatalogCache();
  broadcastEvent({ type: 'stock_updated', timestamp: now.toISOString() });
  res.status(201).json({ ok: true, item: { ...doc, id: itemId } });
});

// 3. PUT /api/admin/sports/items/:id - Cập nhật thông tin (KHÔNG sửa tồn kho tại đây)
sportsRouter.put('/items/:id', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const itemId = String(req.params.id);
  const input = updateSportsItemSchema.parse(req.body);
  const c = getCollections();

  const existing = await c.sportsItems.findOne({ itemId, deletedAt: null });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm hoặc dịch vụ thể thao');
  }

  if (input.isService === true && existing.isService === false && (existing.stock || 0) > 0) {
    throw new ApiError(409, 'STOCK_MUST_BE_ZERO', 'Không thể chuyển mặt hàng còn tồn kho thành dịch vụ. Hãy xử lý hết tồn kho trước.');
  }

  const updateFields: any = { updatedAt: new Date() };
  if (input.name !== undefined) updateFields.name = input.name;
  if (input.category !== undefined) updateFields.category = input.category;
  if (input.unit !== undefined) updateFields.unit = input.unit;
  if (input.costPriceVnd !== undefined) updateFields.costPriceVnd = input.costPriceVnd;
  if (input.priceVnd !== undefined) updateFields.priceVnd = input.priceVnd;
  if (input.minStockThreshold !== undefined) updateFields.minStockThreshold = input.minStockThreshold;
  if (input.isService !== undefined) updateFields.isService = input.isService;
  if (input.isAvailable !== undefined) updateFields.isAvailable = input.isAvailable;
  if (input.imageSvg !== undefined) updateFields.imageSvg = input.imageSvg === null ? '' : input.imageSvg;
  if (input.tag !== undefined) updateFields.tag = input.tag;

  await c.sportsItems.updateOne({ itemId }, { $set: updateFields });
  await invalidateCatalogCache();
  const updated = await c.sportsItems.findOne({ itemId });

  res.json({ ok: true, item: updated });
});

// 3b. POST /api/admin/sports/items/:id/adjust-stock - Điều chỉnh kiểm kê tồn kho riêng biệt có version bảo vệ
sportsRouter.post('/items/:id/adjust-stock', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const itemId = String(req.params.id);
  const schema = z.object({
    stock: z.number().int().min(0).max(1_000_000),
    costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    responsiblePerson: z.string().trim().max(100).optional(),
    note: z.string().trim().max(200).optional().default('Điều chỉnh kiểm kê số lượng tồn kho'),
    expectedVersion: z.number().int().optional()
  }).strict();

  const input = schema.parse(req.body);
  const now = new Date();

  const result = await transaction(async session => {
    const c = getCollections();
    const query: any = { itemId, deletedAt: null };
    if (input.expectedVersion !== undefined) {
      query.version = input.expectedVersion;
    }

    const existing = await c.sportsItems.findOne(query, { session });
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm hoặc phiên bản kiểm kê đã cũ');
    }
    if (existing.isService) {
      throw new ApiError(400, 'CANNOT_ADJUST_SERVICE', 'Dịch vụ sân không có số lượng tồn kho');
    }

    const delta = input.stock - (existing.stock || 0);
    const costPrice = input.costPriceVnd ?? existing.costPriceVnd ?? 0;
    const sellingPrice = input.sellingPriceVnd ?? existing.priceVnd;

    await c.sportsItems.updateOne(
      { itemId },
      {
        $set: {
          stock: input.stock,
          costPriceVnd: costPrice,
          priceVnd: sellingPrice,
          updatedAt: now
        },
        $inc: { version: 1 }
      },
      { session }
    );

    if (delta !== 0) {
      await c.sportsMovements.insertOne({
        operationId: `mov-adj-${randomUUID()}`,
        itemId,
        itemNameSnapshot: existing.name,
        unitSnapshot: existing.unit,
        delta,
        costPriceVnd: costPrice,
        sellingPriceVnd: sellingPrice,
        totalCostVnd: Math.max(0, delta * costPrice),
        stockAfter: input.stock,
        reason: 'stock_adjustment',
        responsiblePerson: input.responsiblePerson,
        note: input.note,
        createdAt: now
      }, { session });
    }

    return { ok: true, stockAfter: input.stock, delta };
  });

  await invalidateCatalogCache();
  broadcastEvent({ type: 'stock_updated', timestamp: now.toISOString() });
  res.json(result);
});

// 4. DELETE /api/admin/sports/items/:id - Xóa mềm
sportsRouter.delete('/items/:id', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const itemId = String(req.params.id);
  const c = getCollections();

  const result = await c.sportsItems.updateOne(
    { itemId, deletedAt: null },
    { $set: { deletedAt: new Date(), isAvailable: false, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm/dịch vụ cần xóa');
  }

  await invalidateCatalogCache();
  broadcastEvent({ type: 'stock_updated', timestamp: new Date().toISOString() });
  res.json({ ok: true, message: 'Đã xóa thành công' });
});

// 5. POST /api/admin/sports/intake - Nhập thêm kho hàng thể thao nguyên tử có Idempotency
const sportsIntakeSchema = z.object({
  // Required to make a timeout/retry safe and prevent duplicate stock intake.
  clientRequestId: z.string().trim().min(1),
  itemId: z.string().trim().min(1, 'Mã sản phẩm không được trống'),
  quantity: z.number().int().min(1, 'Số lượng nhập phải từ 1 trở lên').max(100_000),
  costPriceVnd: z.number().int().min(0, 'Giá nhập không được âm').max(100_000_000),
  sellingPriceVnd: z.number().int().min(0, 'Giá bán không được âm').max(100_000_000).optional(),
  responsiblePerson: z.string().trim().min(1, 'Vui lòng nhập tên người phụ trách khi nhập hàng').max(100),
  transferDate: dateTimeString.optional(),
  note: z.string().trim().max(200).optional().default('Nhập kho thể thao')
}).strict();

sportsRouter.post('/intake', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const input = sportsIntakeSchema.parse(req.body);
  const now = new Date();
  const operationId = input.clientRequestId ? `sports-intake:${res.locals.admin}:${input.clientRequestId}` : `mov-intake-${randomUUID()}`;
  const fingerprint = input.clientRequestId ? createHash('sha256').update(JSON.stringify({
    itemId: input.itemId,
    quantity: input.quantity,
    costPriceVnd: input.costPriceVnd,
    sellingPriceVnd: input.sellingPriceVnd,
    responsiblePerson: input.responsiblePerson || '',
    transferDate: input.transferDate || '',
    note: input.note || ''
  })).digest('hex') : undefined;

  const result = await transaction(async session => {
    const c = getCollections();

    if (input.clientRequestId) {
      const existingMov = await c.sportsMovements.findOne({ operationId }, { session });
      if (existingMov) {
        if ((existingMov as any).requestFingerprint && (existingMov as any).requestFingerprint !== fingerprint) {
          throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
        }
        if (existingMov.delta !== input.quantity || existingMov.itemId !== input.itemId) {
          throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
        }
        return {
          ok: true,
          message: `Đã nhập thành công +${existingMov.delta} ${existingMov.unitSnapshot} ${existingMov.itemNameSnapshot}`,
          stockAfter: existingMov.stockAfter
        };
      }
    }

    const item = await c.sportsItems.findOne({ itemId: input.itemId, deletedAt: null }, { session });
    if (!item) {
      throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm hoặc dịch vụ thể thao');
    }
    if (item.isService) {
      throw new ApiError(400, 'CANNOT_INTAKE_SERVICE', 'Không thể nhập kho mặt hàng dịch vụ');
    }

    const activeSellingPrice = input.sellingPriceVnd !== undefined ? input.sellingPriceVnd : item.priceVnd;
    const updated = await c.sportsItems.findOneAndUpdate(
      { itemId: input.itemId, deletedAt: null },
      {
        $inc: { stock: input.quantity, version: 1 },
        $set: {
          costPriceVnd: input.costPriceVnd,
          priceVnd: activeSellingPrice,
          updatedAt: now
        }
      },
      { session, returnDocument: 'after' }
    );

    if (!updated) {
      throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm thể thao');
    }

    const movementDoc: SportsMovementDoc = {
      operationId,
      itemId: input.itemId,
      itemNameSnapshot: item.name,
      unitSnapshot: item.unit,
      delta: input.quantity,
      costPriceVnd: input.costPriceVnd,
      sellingPriceVnd: activeSellingPrice,
      totalCostVnd: input.quantity * input.costPriceVnd,
      stockAfter: updated.stock,
      requestFingerprint: fingerprint,
      reason: 'stock_intake',
      responsiblePerson: input.responsiblePerson,
      transferDate: input.transferDate ? new Date(input.transferDate) : now,
      note: input.note || 'Nhập kho thể thao',
      createdAt: now
    };
    await c.sportsMovements.insertOne(movementDoc, { session });

    return {
      ok: true,
      message: `Đã nhập thành công +${input.quantity} ${item.unit} ${item.name}`,
      stockAfter: updated.stock
    };
  });

  await invalidateCatalogCache();
  broadcastEvent({ type: 'stock_updated', timestamp: now.toISOString() });
  res.json(result);
});

// 5b. POST /api/admin/sports/batch-intake - Nhập nhiều mặt hàng thể thao cùng lúc có Idempotency & All-or-nothing
const sportsBatchIntakeSchema = z.object({
  // Required to make an all-or-nothing batch retry safe.
  clientRequestId: z.string().trim().min(1),
  items: z.array(z.object({
    itemId: z.string().trim().min(1, 'Mã sản phẩm không được rỗng'),
    quantity: z.number().int().min(1, 'Số lượng nhập phải từ 1 trở lên').max(100_000),
    costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
    sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional()
  })).min(1, 'Cần ít nhất một món có số lượng nhập lớn hơn 0'),
  transferDate: dateTimeString.optional(),
  responsiblePerson: z.string().trim().min(1, 'Vui lòng nhập tên người phụ trách khi nhập hàng').max(100),
  note: z.string().trim().max(200).optional()
}).strict();

sportsRouter.post('/batch-intake', requirePermission('sports-intake'), requireActionProof, async (req, res) => {
  const input = sportsBatchIntakeSchema.parse(req.body);
  const now = new Date();
  const parsedTransferDate = input.transferDate ? new Date(input.transferDate) : now;
  const c = getCollections();
  const idempotencyKey = `idempotency:sports_batch:${res.locals.userId || res.locals.admin}:${input.clientRequestId}`;

  const fingerprint = input.clientRequestId ? createHash('sha256').update(JSON.stringify({
    items: [...input.items].sort((a, b) => a.itemId.localeCompare(b.itemId)).map(i => ({
      itemId: i.itemId,
      quantity: i.quantity,
      costPriceVnd: i.costPriceVnd,
      sellingPriceVnd: i.sellingPriceVnd
    })),
    transferDate: input.transferDate || '',
    responsiblePerson: input.responsiblePerson || '',
    note: input.note || ''
  })).digest('hex') : undefined;

  if (input.clientRequestId) {
    const existing = await c.appSettings.findOne({ key: idempotencyKey });
    if (existing) {
      if (existing.fingerprint && existing.fingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
      }
      if (existing.value) return res.json(existing.value);
    }
  }

  // Tiền kiểm tra: TẤT CẢ item phải tồn tại (All-or-nothing, không bỏ qua âm thầm)
  const itemIds = input.items.map(i => i.itemId);
  const foundItems = await c.sportsItems.find({ itemId: { $in: itemIds }, deletedAt: null }).toArray();
  if (foundItems.length < itemIds.length) {
    const foundSet = new Set(foundItems.map(f => f.itemId));
    const missing = itemIds.filter(id => !foundSet.has(id));
    throw new ApiError(404, 'ITEM_NOT_FOUND', `Không thể nhập lô: các mặt hàng sau không tồn tại: ${missing.join(', ')}`);
  }
  const itemsMap = new Map(foundItems.map(f => [f.itemId, f]));

  const batchId = `spbatch-${Date.now()}-${randomBytes(3).toString('hex')}`;

  const result = await transaction(async session => {
    // Kiểm tra Idempotency chặt chẽ bên trong transaction
    if (input.clientRequestId) {
      const existing = await c.appSettings.findOne({ key: idempotencyKey }, { session });
      if (existing) {
        if (existing.fingerprint && existing.fingerprint !== fingerprint) {
          throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
        }
        if (existing.value) return existing.value;
      }
    }
    const updatedItems: any[] = [];

    for (const itemInput of input.items) {
      const item = itemsMap.get(itemInput.itemId)!;
      if (item.isService) {
        throw new ApiError(400, 'CANNOT_INTAKE_SERVICE', `Mặt hàng "${item.name}" là dịch vụ, không thể nhập kho`);
      }

      const activeCostPrice = itemInput.costPriceVnd !== undefined ? itemInput.costPriceVnd : (item.costPriceVnd || 0);
      const activeSellingPrice = itemInput.sellingPriceVnd !== undefined ? itemInput.sellingPriceVnd : item.priceVnd;

      const updated = await c.sportsItems.findOneAndUpdate(
        { itemId: itemInput.itemId, deletedAt: null },
        {
          $inc: { stock: itemInput.quantity, version: 1 },
          $set: {
            costPriceVnd: activeCostPrice,
            priceVnd: activeSellingPrice,
            updatedAt: now
          }
        },
        { session, returnDocument: 'after' }
      );

      const movementDoc: SportsMovementDoc = {
        operationId: `mov-${batchId}-${itemInput.itemId}`,
        batchId,
        itemId: itemInput.itemId,
        itemNameSnapshot: item.name,
        unitSnapshot: item.unit,
        delta: itemInput.quantity,
        costPriceVnd: activeCostPrice,
        sellingPriceVnd: activeSellingPrice,
        totalCostVnd: itemInput.quantity * activeCostPrice,
        stockAfter: updated!.stock,
        reason: 'stock_intake',
        responsiblePerson: input.responsiblePerson,
        transferDate: parsedTransferDate,
        note: input.note ? input.note.trim() : 'Nhập kho thể thao',
        createdAt: now
      };
      await c.sportsMovements.insertOne(movementDoc, { session });

      updatedItems.push({
        itemId: itemInput.itemId,
        name: item.name,
        unit: item.unit,
        delta: itemInput.quantity,
        stockAfter: updated!.stock,
        costPriceVnd: activeCostPrice,
        sellingPriceVnd: activeSellingPrice,
        totalCostVnd: itemInput.quantity * activeCostPrice
      });
    }

    const payload = { ok: true, batchId, count: updatedItems.length, items: updatedItems };

    if (input.clientRequestId) {
      await c.appSettings.updateOne(
        { key: idempotencyKey },
        { $set: { value: payload, fingerprint, updatedAt: now } },
        { session, upsert: true }
      );
    }

    return payload;
  });

  await invalidateCatalogCache();
  broadcastEvent({ type: 'stock_updated', timestamp: now.toISOString() });
  res.json(result);
});

// 6. GET /api/admin/sports/intake-history - Lịch sử nhập hàng thể thao
sportsRouter.get('/intake-history', requirePermission('sports-intake'), async (req, res) => {
  const c = getCollections();
  const parsedPage = parseInt(String(req.query.page || '1'), 10);
  const parsedLimit = parseInt(String(req.query.limit || '50'), 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;

  const timePreset = String(req.query.timePreset || 'all');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const selectedItemId = typeof req.query.itemId === 'string' ? req.query.itemId.trim() : 'all';

  const filter: any = { reason: 'stock_intake' };

  if (selectedItemId && selectedItemId !== 'all') {
    filter.itemId = selectedItemId;
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.itemNameSnapshot = { $regex: escaped, $options: 'i' };
  }

  // Filter theo mốc thời gian chuẩn Việt Nam (+07:00)
  const now = new Date();
  const vnIso = new Date(now.getTime() + 7 * 3_600_000).toISOString();
  const todayStart = new Date(vnIso.slice(0, 10) + 'T00:00:00+07:00');

  if (timePreset === 'today') {
    filter.createdAt = { $gte: todayStart };
  } else if (timePreset === '7days') {
    filter.createdAt = { $gte: new Date(todayStart.getTime() - 6 * 86_400_000) };
  } else if (timePreset === '30days') {
    filter.createdAt = { $gte: new Date(todayStart.getTime() - 29 * 86_400_000) };
  }

  const [aggregationResult] = await c.sportsMovements.aggregate([
    { $match: filter },
    {
      $addFields: {
        effectiveBatchId: {
          $let: {
            vars: {
              rawBatchId: {
                $regexFind: {
                  input: { $ifNull: ['$batchId', ''] },
                  regex: '(spbatch|batch)-[0-9]+-[a-f0-9]{6}',
                  options: 'i'
                }
              },
              foundInOp: {
                $regexFind: {
                  input: { $ifNull: ['$operationId', ''] },
                  regex: '(spbatch|batch)-[0-9]+-[a-f0-9]{6}',
                  options: 'i'
                }
              },
              foundInNote: {
                $regexFind: {
                  input: { $ifNull: ['$note', ''] },
                  regex: '(spbatch|batch)-[0-9]+-[a-f0-9]{6}',
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
                                'spbatch-legacy-',
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
        batchCostValueVnd: { $sum: '$totalCostVnd' },
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
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ]
      }
    }
  ]).toArray();

  const summary = aggregationResult?.summary[0] || {
    totalBatches: 0,
    totalQuantity: 0,
    totalCostValueVnd: 0,
    totalExpectedRevenueVnd: 0
  };

  const totalCostValue = summary.totalCostValueVnd || 0;
  const totalExpectedRevenue = summary.totalExpectedRevenueVnd || 0;
  const totalExpectedProfit = totalExpectedRevenue - totalCostValue;
  const overallMarginPct = totalExpectedRevenue > 0 ? Math.round(((totalExpectedProfit / totalExpectedRevenue) * 100) * 10) / 10 : 0;
  const totalItems = aggregationResult?.totalCount[0]?.count || 0;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  const paginatedBatches = aggregationResult?.batches || [];
  const movements = paginatedBatches.flatMap((b: any) => b.movements || []);

  res.json({
    items: movements.map((m: any) => {
      let batchId = m.batchId;
      if (batchId) {
        const match = batchId.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
        if (match) batchId = match[1];
      }
      if (!batchId && m.operationId) {
        const match = m.operationId.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
        if (match) batchId = match[1];
      }
      if (!batchId && m.note) {
        const match = m.note.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i) || m.note.match(/\(Lô\s+([^)]+)\)/i);
        if (match) batchId = match[1];
      }
      if (!batchId) {
        batchId = m.operationId;
      }

      const costPrice = m.costPriceVnd || 0;
      const sellingPrice = m.sellingPriceVnd || 0;
      const quantity = m.delta;
      const totalCost = m.totalCostVnd ?? (costPrice * quantity);
      const expectedRevenue = sellingPrice * quantity;
      const profitMarginVnd = expectedRevenue - totalCost;
      const profitMarginPct = expectedRevenue > 0 ? Math.round(((profitMarginVnd / expectedRevenue) * 100) * 10) / 10 : 0;

      let cleanNote = (m.note || '').replace(/\s*\((?:Lô\s+)?[a-zA-Z0-9_-]+\)/gi, '').trim();
      if (!cleanNote) cleanNote = 'Nhập kho thể thao';

      return {
        id: m.operationId,
        batchId,
        operationId: m.operationId,
        itemId: m.itemId,
        itemName: m.itemNameSnapshot,
        unit: m.unitSnapshot,
        quantity,
        costPriceVnd: costPrice,
        sellingPriceVnd: sellingPrice,
        totalCostVnd: totalCost,
        expectedRevenueVnd: expectedRevenue,
        profitMarginVnd,
        profitMarginPct,
        stockAfter: m.stockAfter,
        responsiblePerson: (m as any).responsiblePerson || 'Quản trị viên',
        note: cleanNote,
        createdAt: m.createdAt
      };
    }),
    totalItems,
    totalPages: Math.ceil(totalItems / limit) || 1,
    page,
    limit,
    summary: {
      totalBatches: summary.totalBatches || 0,
      totalQuantity: summary.totalQuantity || 0,
      totalCostValueVnd: totalCostValue,
      totalExpectedRevenueVnd: totalExpectedRevenue,
      totalExpectedProfitVnd: totalExpectedProfit,
      overallMarginPct
    }
  });
});

// 7. POST /api/admin/sports/pos/order - Tạo đơn bán hàng tại quầy (POS) với ACID Transaction & Idempotency
const posOrderSchema = z.object({
  // Required for financial idempotency. Never generate a new key on retry.
  clientRequestId: z.string().trim().min(1),
  courtId: z.string().trim().optional().default('counter'),
  courtNameSnapshot: z.string().trim().optional().default('Quầy Lễ Tân (Khách vãng lai)'),
  customerName: z.string().trim().max(100).optional().default('Khách tại quầy'),
  customerPhone: z.string().trim().max(30).optional().default(''),
  paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  note: z.string().trim().max(200).optional().default(''),
  items: z.array(z.object({
    itemId: z.string().trim().min(1, 'Mã sản phẩm/dịch vụ không hợp lệ'),
    quantity: z.number().int().min(1, 'Số lượng tối thiểu là 1').max(1000),
    // Kept for backward compatibility with older clients, but never trusted;
    // the server always uses the current database price below.
    priceVnd: z.number().int().min(0).max(100_000_000).optional()
  })).min(1, 'Giỏ hàng bán tại quầy không được trống')
}).strict();

sportsRouter.post('/pos/order', requirePermission('sports-pos'), requireActionProofFor('sports.pos'), async (req, res) => {
  const input = posOrderSchema.parse(req.body);
  const now = new Date();
  const c = getCollections();

  // 1. Hợp nhất các dòng item trùng lặp trước khi kiểm tra tồn kho (chống oversell)
  const mergedItemsMap = new Map<string, { itemId: string; quantity: number }>();
  for (const item of input.items) {
    const existing = mergedMapItem(mergedItemsMap, item.itemId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      mergedItemsMap.set(item.itemId, { itemId: item.itemId, quantity: item.quantity });
    }
  }
  const mergedItems = Array.from(mergedItemsMap.values());

  function mergedMapItem(map: Map<string, any>, key: string) {
    return map.get(key);
  }

  // 2. Idempotency key is required by the schema. Do not generate a new key
  // here: generating one would make a transport retry create a second order.
  const clientRequestId = input.clientRequestId;
  const fingerprint = createHash('sha256').update(JSON.stringify({
    courtId: input.courtId,
    items: [...mergedItems].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    paymentMethod: input.paymentMethod
  })).digest('hex');

  const posSessionScope = `admin_pos_session:${res.locals.userId || res.locals.admin}`;
  const existingQuery = { customerSessionHash: posSessionScope, clientRequestId };
  const existingOrder = await c.orders.findOne(existingQuery);
  if (existingOrder) {
    if (existingOrder.requestFingerprint && existingOrder.requestFingerprint !== fingerprint) {
      throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã clientRequestId đã được dùng cho đơn hàng khác');
    }
    return res.status(200).json({
      ok: true,
      message: 'Đơn hàng đã được ghi nhận trước đó',
      order: existingOrder
    });
  }

  // 3. Thực thi toàn bộ đơn hàng trong MongoDB ACID Transaction
  const createdOrder = await transaction(async session => {
    // Kiểm tra trùng lặp bên trong transaction
    const dup = await c.orders.findOne(existingQuery, { session });
    if (dup) {
      if (dup.requestFingerprint && dup.requestFingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã clientRequestId đã được dùng cho đơn hàng khác');
      }
      return dup;
    }

    // Xác thực tính hợp lệ của sân nếu có courtId cụ thể
    let courtName = input.courtNameSnapshot;
    if (input.courtId && input.courtId !== 'counter') {
      const court = await c.courts.findOne({ courtId: input.courtId, deletedAt: null }, { session });
      if (!court) {
        throw new ApiError(404, 'COURT_NOT_FOUND', `Sân mã '${input.courtId}' không tồn tại trong hệ thống`);
      }
      courtName = court.name;
    }

    const orderId = `pos-${Date.now()}-${randomBytes(3).toString('hex')}`;
    let totalVnd = 0;
    const orderItems: OrderItemDoc[] = [];
    const movementsToInsert: SportsMovementDoc[] = [];

    // Duyệt qua từng sản phẩm đã được gộp số lượng
    for (const item of mergedItems) {
      const found = await c.sportsItems.findOne({ itemId: item.itemId, deletedAt: null }, { session });
      if (!found) {
        throw new ApiError(400, 'ITEM_NOT_FOUND', `Sản phẩm hoặc dịch vụ mã '${item.itemId}' không tồn tại`);
      }
      if (!found.isAvailable) {
        throw new ApiError(400, 'ITEM_UNAVAILABLE', `Mặt hàng "${found.name}" đang tạm ngưng kinh doanh`);
      }

      // Never trust a price supplied by the browser. The catalog price in the
      // database is authoritative for the receipt, revenue and profit figures.
      const unitPrice = found.priceVnd;
      const lineTotal = unitPrice * item.quantity;
      totalVnd += lineTotal;

      orderItems.push({
        productId: found.itemId,
        nameSnapshot: found.name,
        volumeSnapshot: found.unit,
        costPriceVnd: found.costPriceVnd || 0,
        unitPriceVnd: unitPrice,
        quantity: item.quantity,
        iceQuantity: 0,
        lineTotalVnd: lineTotal,
        itemType: found.isService ? 'service' : 'sports'
      });

      // Nếu là hàng hóa (không phải dịch vụ), trừ kho nguyên tử có điều kiện stock >= quantity
      if (!found.isService) {
        const updatedItem = await c.sportsItems.findOneAndUpdate(
          {
            itemId: found.itemId,
            isAvailable: true,
            deletedAt: null,
            stock: { $gte: item.quantity }
          },
          {
            $inc: { stock: -item.quantity, version: 1 },
            $set: { updatedAt: now }
          },
          { session, returnDocument: 'after' }
        );

        if (!updatedItem) {
          throw new ApiError(
            409,
            'OUT_OF_STOCK',
            `Sản phẩm "${found.name}" không đủ tồn kho (Còn ${found.stock} ${found.unit}, yêu cầu ${item.quantity})`
          );
        }

        movementsToInsert.push({
          operationId: `mov-sale-${randomUUID()}`,
          itemId: found.itemId,
          itemNameSnapshot: found.name,
          unitSnapshot: found.unit,
          delta: -item.quantity,
          costPriceVnd: found.costPriceVnd || 0,
          sellingPriceVnd: unitPrice,
          totalCostVnd: item.quantity * (found.costPriceVnd || 0),
          stockAfter: updatedItem.stock,
          reason: 'pos_sale',
          note: `Bán tại quầy (Đơn ${orderId})`,
          createdAt: now
        });
      }
    }

    if (movementsToInsert.length > 0) {
      await c.sportsMovements.insertMany(movementsToInsert, { session });
    }

    // Sinh mã displayCode tuần tự theo ngày (#TT-YYYYMMDD-XXXX), loại bỏ hoàn toàn nguy cơ va chạm random
    const day = vietnamDate(now).replaceAll('-', '');
    const counter = await c.appSettings.findOneAndUpdate(
      { key: `order_sequence_sports:${day}` },
      { $inc: { 'value.sequence': 1 }, $set: { updatedAt: now } },
      { session, upsert: true, returnDocument: 'after' }
    );
    const displayCode = `#TT-${day}-${String(counter!.value.sequence).padStart(4, '0')}`;

    const orderDoc: OrderDoc = {
      orderId,
      displayCode,
      clientRequestId,
      courtId: input.courtId || 'counter',
      courtNameSnapshot: courtName || 'Quầy Lễ Tân (Khách vãng lai)',
      customerName: input.customerName || 'Khách tại quầy',
      customerPhone: input.customerPhone || '',
      orderType: 'sports_pos',
      paymentStatus: 'paid',
      paymentMethod: input.paymentMethod,
      paidAt: now,
      customerSessionHash: posSessionScope,
      status: 'delivered',
      totalVnd,
      items: orderItems,
      createdAt: now,
      editableUntil: now,
      deliveredAt: now,
      version: 1,
      updatedAt: now,
      requestFingerprint: fingerprint
    };

    await c.orders.insertOne(orderDoc, { session });
    return orderDoc;
  });

  // Sau khi transaction commit thành công: Invalidate cache và broadcast sự kiện
  await invalidateCatalogCache();
  broadcastEvent({
    type: 'order_created',
    data: createdOrder,
    timestamp: now.toISOString()
  });
  broadcastEvent({
    type: 'stock_updated',
    timestamp: now.toISOString()
  });

  res.status(201).json({
    ok: true,
    message: 'Tạo đơn bán hàng tại quầy thành công',
    order: {
      orderId: createdOrder.orderId,
      displayCode: createdOrder.displayCode,
      courtName: createdOrder.courtNameSnapshot,
      customerName: createdOrder.customerName,
      orderType: createdOrder.orderType,
      status: createdOrder.status,
      paymentStatus: createdOrder.paymentStatus,
      totalVnd: createdOrder.totalVnd,
      paymentMethod: createdOrder.paymentMethod,
      items: createdOrder.items,
      createdAt: createdOrder.createdAt
    }
  });
});
