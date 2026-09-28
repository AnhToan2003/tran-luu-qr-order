import type { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePermission, requireActionProof } from '../../auth.js';
import { getCollections, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { id, dateTimeString } from '../../validation.js';
import { dateRange } from '../../time.js';
import { broadcastEvent } from '../../websocket.js';
import { invalidateCatalogCache } from '../../redis.js';
import { recordAuditLog } from '../../services/auditService.js';

export function registerInventoryRoutes(router: Router): void {
  router.post('/inventory/batch-intake', requirePermission('drink-intake'), requireActionProof, async (req, res) => {
    const schema = z.object({
      clientRequestId: id,
      items: z.array(z.object({
        productId: id,
        delta: z.number().int().positive().max(1_000_000),
        costPriceVnd: z.number().int().min(0).max(100_000_000).optional(),
        sellingPriceVnd: z.number().int().min(0).max(100_000_000).optional()
      })).min(1, 'Cần ít nhất một món có số lượng nhập lớn hơn 0'),
      transferDate: dateTimeString.optional(),
      responsiblePerson: z.string().trim().min(1, 'Vui lòng nhập tên người phụ trách khi nhập hàng').max(100),
      note: z.string().trim().max(200).optional()
    });
    const input = schema.parse(req.body);
    const c = getCollections();
    const idempotencyKey = `idempotency:drink_batch:${res.locals.userId || res.locals.admin}:${input.clientRequestId}`;

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
      const existingBatch = await c.appSettings.findOne({ key: idempotencyKey });
      if (existingBatch) {
        if (existingBatch.fingerprint && existingBatch.fingerprint !== fingerprint) {
          throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã được sử dụng cho một nội dung khác');
        }
        if (existingBatch.value) {
          return res.json(existingBatch.value);
        }
      }
    }

    const productIds = Array.from(new Set(input.items.map(i => i.productId)));
    const existingProducts = await c.products.find({ productId: { $in: productIds }, deletedAt: null }).toArray();
    if (existingProducts.length !== productIds.length) {
      const foundIds = new Set(existingProducts.map(p => p.productId));
      const missing = productIds.filter(pid => !foundIds.has(pid));
      throw new ApiError(404, 'PRODUCT_NOT_FOUND', `Một hoặc nhiều sản phẩm không tồn tại hoặc đã bị xóa: ${missing.join(', ')}`);
    }

    const intakeBatchId = `batch-${randomUUID()}`;
    const now = new Date();
    const parsedTransferDate = input.transferDate ? new Date(input.transferDate) : now;

    const result = await transaction(async session => {
      if (input.clientRequestId) {
        const duplicate = await c.appSettings.findOne({ key: idempotencyKey }, { session });
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
          { key: idempotencyKey },
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

  router.get('/inventory/intake-history', requirePermission('intake-history'), async (req, res) => {
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
}
