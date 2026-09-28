import type { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { verifyPassword, requirePermission } from '../../auth.js';
import { getCollections, getDb } from '../../db.js';
import { ApiError } from '../../errors.js';
import { recordAuditLog } from '../../services/auditService.js';
import { createRateLimitStore } from '../../rateLimitStore.js';

// P1/Issue #4 FIX: Rate limiter for verify-action-password (5 attempts/10 min per userId+IP)
const actionPasswordRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('action-password'),
  keyGenerator: (req, res) => {
    const ip = ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
    return `action_pwd:${ip}:${res.locals.userId || res.locals.admin}`;
  },
  message: { code: 'TOO_MANY_ATTEMPTS', message: 'Quá nhiều lần thử mật khẩu. Vui lòng thử lại sau 10 phút.' }
});

export function registerAuditRoutes(router: Router): void {
  // P1/Issue #4 FIX: verify-action-password issues a one-time proof token
  // The proof is stored in MongoDB action_proofs collection (TTL 5 minutes)
  // Sensitive endpoints must validate this proof — not just rely on frontend modal
  router.post('/auth/verify-action-password', actionPasswordRateLimit, async (req, res) => {
    const schema = z.object({
      password: z.string().min(1, 'Vui lòng nhập mật khẩu quản trị viên').max(256),
      action: z.string().trim().min(1).max(80).optional().default('inventory'),
      resourceId: z.string().trim().max(120).optional()
    });
    const { password, action, resourceId } = schema.parse(req.body);
    const currentAdmin = res.locals.admin;
    const currentUserId = res.locals.userId;
    const c = getCollections();

    let isValid = false;

    // P1 FIX: Only verify the password of the currently logged-in user
    if (currentUserId) {
      const user = await c.adminUsers.findOne({ userId: currentUserId, isActive: true });
      if (user && user.passwordHash) {
        isValid = await verifyPassword(password, user.passwordHash);
      }
    } else {
      if (process.env.ADMIN_PASSWORD_HASH) {
        isValid = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
      }
    }

    if (!isValid) {
      await recordAuditLog(currentAdmin, 'failed_action_password_verify', undefined, { ip: req.ip, action }, req.ip);
      throw new ApiError(403, 'INVALID_PASSWORD', 'Mật khẩu quản trị viên không chính xác. Thao tác bị từ chối!');
    }

    const proofId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await getDb().collection('action_proofs').insertOne({
      proofId,
      userId: currentUserId || `env:${currentAdmin}`,
      adminUsername: currentAdmin,
      action,
      resourceId: resourceId || null,
      used: false,
      expiresAt,
      createdAt: new Date()
    });

    await recordAuditLog(currentAdmin, 'action_password_verified', undefined, { ip: req.ip, action, resourceId: resourceId || null }, req.ip);
    res.json({ ok: true, proofToken: proofId, expiresAt: expiresAt.toISOString(), message: 'Xác thực mật khẩu quản trị thành công' });
  });

  router.get('/audit-logs', requirePermission('backup'), async (req, res) => {
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
}
