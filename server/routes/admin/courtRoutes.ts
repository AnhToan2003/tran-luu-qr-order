import type { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requirePermission, requireActionProofFor } from '../../auth.js';
import { getCollections, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { courtCode, id } from '../../validation.js';
import { signCourtCode } from '../../services/qrSign.js';
import { recordAuditLog } from '../../services/auditService.js';

export function registerCourtRoutes(router: Router): void {
  // P1/Issue #6 FIX: GET /courts now requires courts permission
  router.get('/courts', requirePermission('courts'), async (_req, res) => {
    const courts = await getCollections().courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray();
    res.json(courts.map(c => ({
      id: c.courtId,
      code: c.code,
      name: c.name,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      qrVersion: c.qrVersion ?? 0,
      sig: signCourtCode(c.code, c.qrVersion ?? 0)
    })));
  });

  router.post('/courts', requirePermission('courts'), requireActionProofFor('courts.manage'), async (req, res) => {
    const input = z.object({ code: courtCode, name: z.string().trim().min(1).max(100) }).strict().parse(req.body);
    const c = getCollections();
    const existing = await c.courts.findOne({ code: input.code });
    if (existing) throw new ApiError(409, 'DUPLICATE_CODE', 'Mã sân đã tồn tại trong hệ thống, vui lòng dùng mã khác');
    const now = new Date();
    const court = { ...input, courtId: randomUUID(), sortOrder: Number(input.code), isActive: true, qrVersion: 1, deletedAt: null, createdAt: now, updatedAt: now };
    await c.courts.insertOne(court);
    res.status(201).json({ id: court.courtId, ...input, isActive: true });
  });

  router.patch('/courts/:id', requirePermission('courts'), requireActionProofFor('courts.manage'), async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional(), rotateQr: z.boolean().optional() }).strict().parse(req.body);
    const { rotateQr, ...fields } = input;
    const update: Record<string, unknown> = { $set: { ...fields, updatedAt: new Date() } };
    if (rotateQr) update.$inc = { qrVersion: 1 };
    const result = await getCollections().courts.findOneAndUpdate({ courtId: id.parse(req.params.id), deletedAt: null }, update, { returnDocument: 'after' });
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sân');
    if (rotateQr) await recordAuditLog(res.locals.admin, 'court_qr_rotated', result.courtId, { code: result.code, qrVersion: result.qrVersion ?? 0 }, req.ip);
    res.json({ id: result.courtId, code: result.code, name: result.name, isActive: result.isActive, qrVersion: result.qrVersion ?? 0, sig: signCourtCode(result.code, result.qrVersion ?? 0) });
  });

  router.delete('/courts/:id', requirePermission('courts'), requireActionProofFor('courts.manage'), async (req, res) => {
    const courtId = id.parse(req.params.id);
    await transaction(async session => {
      const c = getCollections();
      const court = await c.courts.findOneAndUpdate({ courtId, deletedAt: null }, { $set: { deletedAt: new Date(), isActive: false, updatedAt: new Date() } }, { session });
      if (!court) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy sân');
      if (await c.orders.countDocuments({ courtId, status: { $in: ['new', 'accepted', 'preparing'] } }, { session })) throw new ApiError(409, 'COURT_HAS_ACTIVE_ORDERS', 'Sân đang có đơn chưa hoàn tất');
    });
    res.json({ courtId });
  });
}
