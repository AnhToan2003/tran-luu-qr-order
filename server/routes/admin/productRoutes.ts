import type { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePermission, requireActionProof } from '../../auth.js';
import { getCollections, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { productJson } from '../../serialize.js';
import { id, productFields, productPatch, stock, dateTimeString } from '../../validation.js';
import { broadcastEvent } from '../../websocket.js';
import { invalidateCatalogCache } from '../../redis.js';
import { recordAuditLog } from '../../services/auditService.js';

export function registerProductRoutes(router: Router): void {
  // P1/Issue #6 FIX: GET /products now requires a relevant permission
  router.get('/products', requirePermission(['drink-intake', 'orders']), async (_req, res) => {
    res.json((await getCollections().products.find({ deletedAt: null }).sort({ category: 1, name: 1 }).toArray()).map(productJson));
  });

  router.post('/products', requirePermission('drink-intake'), requireActionProof, async (req, res) => {
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

  router.patch('/products/:id', requirePermission('drink-intake'), requireActionProof, async (req, res) => {
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

  router.delete('/products/:id', requirePermission('drink-intake'), requireActionProof, async (req, res) => {
    const productId = id.parse(req.params.id);
    const updated = await getCollections().products.findOneAndUpdate({ productId, deletedAt: null }, { $set: { deletedAt: new Date(), isAvailable: false, updatedAt: new Date() }, $inc: { version: 1 } }, { returnDocument: 'after' });
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
    await recordAuditLog(res.locals.admin, 'product_delete', productId, { name: updated.name }, req.ip);
    await invalidateCatalogCache();
    res.json({ id: updated.productId });
  });

  router.get('/products/:id/movements', requirePermission('intake-history'), async (req, res) => {
    res.json(await getCollections().inventoryMovements.find({ productId: id.parse(req.params.id) }).sort({ createdAt: -1 }).limit(100).toArray());
  });

  router.post('/products/:id/stock', requirePermission('drink-intake'), requireActionProof, async (req, res) => {
    const input = z.object({
      clientRequestId: id,
      delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
      setAbsoluteStock: stock.optional(),
      expectedStock: stock.optional(),
      costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
      sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
      responsiblePerson: z.string().trim().max(100).optional(),
      transferDate: dateTimeString.optional(),
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
}
