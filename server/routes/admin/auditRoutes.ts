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

function checkUserHasActionPermission(permissions: string[], action: string): boolean {
  if (permissions.includes('*')) return true;

  switch (action) {
    case 'inventory':
    case 'catalog.import':
      return permissions.includes('drink-intake') || permissions.includes('sports-intake') || permissions.includes('inventory');
    case 'drink.category':
      return permissions.includes('drink-intake') || permissions.includes('inventory');
    case 'sports.category':
      return permissions.includes('sports-intake') || permissions.includes('sports-pos') || permissions.includes('inventory');
    case 'sports.pos':
      return permissions.includes('sports-pos') || permissions.includes('orders');
    case 'order.pos':
    case 'order.financial':
    case 'order.transition':
      return permissions.includes('orders');
    case 'courts.manage':
      return permissions.includes('courts');
    case 'settings':
      return permissions.includes('settings') || permissions.includes('courts');
    case 'backup.export':
    case 'data.purge':
      return permissions.includes('backup');
    case 'rbac.manage':
      return permissions.includes('rbac');
    default:
      return permissions.length > 0;
  }
}

export function registerAuditRoutes(router: Router): void {
  // P1/Issue #4 FIX: verify-action-password issues a one-time proof token
  // The proof is stored in MongoDB action_proofs collection (TTL 5 minutes)
  // Sensitive endpoints must validate this proof — not just rely on frontend modal
  router.post('/auth/verify-action-password', actionPasswordRateLimit, async (req, res) => {
    const schema = z.object({
      password: z.string().min(1, 'Vui lòng nhập mật khẩu xác nhận').max(256),
      action: z.string().trim().min(1).max(80).optional().default('inventory'),
      resourceId: z.string().trim().max(120).optional()
    });
    const { password, action, resourceId } = schema.parse(req.body);
    const currentAdmin = res.locals.admin;
    const currentUserId = res.locals.userId;
    const c = getCollections();

    let userDoc: any = null;
    let permissions: string[];

    if (currentUserId) {
      userDoc = await c.adminUsers.findOne({ userId: currentUserId, isActive: true });
      if (!userDoc) {
        throw new ApiError(403, 'FORBIDDEN', 'Tài khoản đã bị khóa hoặc không tồn tại');
      }
      if (userDoc.roleId === 'admin') {
        permissions = ['*'];
      } else {
        const role = await c.roles.findOne({ roleId: userDoc.roleId });
        permissions = (role?.permissions as string[]) || [];
        if (Array.isArray(userDoc.customPermissions)) {
          permissions = Array.from(new Set([...permissions, ...userDoc.customPermissions]));
        }
      }
    } else {
      permissions = ['*'];
    }

    // Kiểm tra quyền hạn theo vai trò tài khoản
    const hasPermission = checkUserHasActionPermission(permissions, action);
    if (!hasPermission) {
      await recordAuditLog(currentAdmin, 'failed_action_password_permission', undefined, { ip: req.ip, action, reason: 'insufficient_permission' }, req.ip);
      throw new ApiError(403, 'FORBIDDEN', 'Tài khoản của bạn không có quyền thực hiện thao tác này!');
    }

    let isValid = false;

    // Kiểm tra mật khẩu: ưu tiên actionPasswordHash (mật khẩu xác nhận riêng), nếu chưa đặt thì dùng passwordHash (mật khẩu đăng nhập)
    if (userDoc) {
      if (userDoc.actionPasswordHash) {
        isValid = await verifyPassword(password, userDoc.actionPasswordHash);
      } else if (userDoc.passwordHash) {
        isValid = await verifyPassword(password, userDoc.passwordHash);
      }
    } else {
      if (process.env.ADMIN_PASSWORD_HASH) {
        isValid = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
      }
    }

    if (!isValid) {
      await recordAuditLog(currentAdmin, 'failed_action_password_verify', undefined, { ip: req.ip, action }, req.ip);
      throw new ApiError(403, 'INVALID_PASSWORD', 'Mật khẩu xác nhận không chính xác. Vui lòng thử lại!');
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
