import type { Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireActionProofFor } from '../../auth.js';
import { getCollections, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { recordAuditLog } from '../../services/auditService.js';
import { invalidateCatalogCache } from '../../redis.js';

const DEFAULT_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'water', name: 'Nước suối' },
  { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
  { id: 'soda', name: 'Nước ngọt có gas' },
  { id: 'energy', name: 'Nước tăng lực' },
  { id: 'tea', name: 'Trà & Cà phê' },
  { id: 'juice', name: 'Nước ép & Sữa' },
  { id: 'food', name: 'Mì ly & Đồ ăn' }
];

export function registerCategoryRoutes(router: Router): void {
  // P1/Issue #6 FIX: GET /categories now requires drink-intake permission
  router.get('/categories', requirePermission(['drink-intake', 'orders', 'revenue-report']), async (_req, res) => {
    const c = getCollections();
    const doc = await c.appSettings.findOne({ key: 'drink_categories' });
    const categories: Array<{ id: string; name: string; productCount?: number }> = Array.isArray(doc?.value)
      ? [...doc.value]
      : [...DEFAULT_CATEGORIES];

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

  router.post('/categories', requirePermission('drink-intake'), requireActionProofFor('drink.category'), async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
    const c = getCollections();
    const doc = await c.appSettings.findOne({ key: 'drink_categories' });
    const categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...DEFAULT_CATEGORIES];

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

  router.put('/categories/:id', requirePermission('drink-intake'), requireActionProofFor('drink.category'), async (req, res) => {
    const targetId = String(req.params.id).trim();
    const { name } = z.object({ name: z.string().trim().min(1, 'Tên hạng mục không được rỗng').max(60) }).parse(req.body);
    const c = getCollections();
    const doc = await c.appSettings.findOne({ key: 'drink_categories' });
    const categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...DEFAULT_CATEGORIES];

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

  router.delete('/categories/:id', requirePermission('drink-intake'), requireActionProofFor('drink.category'), async (req, res) => {
    const targetId = String(req.params.id).trim();
    const c = getCollections();

    const doc = await c.appSettings.findOne({ key: 'drink_categories' });
    let categories: Array<{ id: string; name: string }> = Array.isArray(doc?.value) ? [...doc.value] : [...DEFAULT_CATEGORIES];
    const targetCat = categories.find(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
    const targetName = targetCat ? targetCat.name : targetId;

    const productFilter = {
      $or: [{ category: targetId }, { category: targetName }],
      deletedAt: null
    };
    const inUseCount = await c.products.countDocuments(productFilter);

    const moveTo = typeof req.query.moveTo === 'string' ? req.query.moveTo.trim() : typeof req.body?.moveTo === 'string' ? req.body.moveTo.trim() : undefined;
    const cascadeDelete = req.query.cascadeDelete === 'true' || req.body?.cascadeDelete === true;

    if (inUseCount > 0 && !cascadeDelete && !moveTo) {
      throw new ApiError(400, 'CATEGORY_IN_USE', `Hạng mục "${targetName}" đang có ${inUseCount} sản phẩm sử dụng. Vui lòng chọn hạng mục chuyển đổi hoặc xóa kèm sản phẩm.`);
    }

    categories = categories.filter(c => c.id !== targetId && c.name.toLowerCase() !== targetId.toLowerCase());
    const now = new Date();
    await transaction(async session => {
      if (inUseCount > 0 && cascadeDelete) {
        await c.products.updateMany(productFilter, {
          $set: { deletedAt: now, isAvailable: false, updatedAt: now },
          $inc: { version: 1 }
        }, { session });
      } else if (inUseCount > 0 && moveTo) {
        await c.products.updateMany(productFilter, {
          $set: { category: moveTo, updatedAt: now },
          $inc: { version: 1 }
        }, { session });
      }

      await c.appSettings.updateOne(
        { key: 'drink_categories' },
        { $set: { value: categories, updatedAt: now } },
        { upsert: true, session }
      );
    });

    await invalidateCatalogCache();
    await recordAuditLog(res.locals.admin, 'category_delete', targetId, {
      targetName,
      affectedCount: inUseCount,
      actionTaken: cascadeDelete ? 'cascade_deleted_products' : (moveTo ? `moved_to_${moveTo}` : 'none')
    }, req.ip);

    res.json({ ok: true, id: targetId, categories, affectedCount: inUseCount });
  });
}
