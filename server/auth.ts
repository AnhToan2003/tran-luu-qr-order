import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { getDb, getCollections } from './db.js';
import { ApiError } from './errors.js';
import type { CustomerSessionDoc, SystemPermission } from './types.js';
import { revokeAdminSession, revokeAdminUser, revokeRoleSockets } from './websocket.js';
import { cacheGet, cacheSet, cacheDel } from './redis.js';
const cookieName = 'tl_admin';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' });
export function validateAuthConfig() {
  if (!process.env.ADMIN_PASSWORD_HASH || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.ADMIN_PASSWORD_HASH)) {
    throw new Error('ADMIN_PASSWORD_HASH must be configured with 32-hex salt and 128-hex scrypt hash.');
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.QR_SIGN_SECRET || process.env.QR_SIGN_SECRET === 'tran-luu-court-qr-hmac-secret-v2') {
      throw new Error('[Security Fail-Fast] QR_SIGN_SECRET must be set to a custom private secret in production mode. Default fallback is prohibited.');
    }
    if (process.env.QR_SIGN_SECRET.length < 32) {
      throw new Error('[Security Fail-Fast] QR_SIGN_SECRET must be at least 32 characters long for cryptographic security.');
    }
  }
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hashed = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hashStr] = storedHash.split(':');
    if (!salt || !hashStr) return false;
    const computed = scryptSync(password, salt, 64);
    return timingSafeEqual(computed, Buffer.from(hashStr, 'hex'));
  } catch {
    return false;
  }
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    let token = req.cookies[cookieName];
    if (!token && typeof req.headers.authorization === 'string') {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập quản trị');
    }

    let mustChangePassword = false;
    const tokenH = hash(token);
    // Fast path: Check Redis cache first
    const cachedSession = await cacheGet<{ username: string; userId?: string; roleId: string; expiresAt?: string }>(`admin_session:${tokenH}`);
    if (cachedSession) {
      if (cachedSession.expiresAt && new Date(cachedSession.expiresAt).getTime() <= Date.now()) {
        await cacheDel(`admin_session:${tokenH}`);
      } else {
        // If session is bound to a DB user, ensure user is still active
        if (cachedSession.userId) {
          const c = getCollections();
          const user = await c.adminUsers.findOne({ userId: cachedSession.userId, isActive: true });
          if (!user) {
            await cacheDel(`admin_session:${tokenH}`);
            throw new ApiError(403, 'FORBIDDEN', 'Tài khoản đã bị khóa hoặc không tồn tại');
          }
          mustChangePassword = !!user.mustChangePassword;
        }
        res.locals.admin = cachedSession.username;
        res.locals.userId = cachedSession.userId;
        res.locals.roleId = cachedSession.roleId;
        res.locals.mustChangePassword = mustChangePassword;

        if (mustChangePassword) {
          enforcePasswordChangeWhitelist(req);
        }
        return next();
      }
    }

    const session = await getDb().collection('admin_sessions').findOne({ tokenHash: tokenH, expiresAt: { $gt: new Date() } });
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập quản trị');

    // If session belongs to a DB user, ensure user is still active
    if (session.userId) {
      const c = getCollections();
      const user = await c.adminUsers.findOne({ userId: session.userId, isActive: true });
      if (!user) {
        throw new ApiError(403, 'FORBIDDEN', 'Tài khoản đã bị khóa hoặc không tồn tại');
      }
      mustChangePassword = !!user.mustChangePassword;
    }

    const remainingSec = Math.max(1, Math.floor(((session.expiresAt as Date).getTime() - Date.now()) / 1000));
    void cacheSet(`admin_session:${tokenH}`, {
      username: session.username,
      userId: session.userId,
      roleId: session.roleId,
      expiresAt: (session.expiresAt as Date).toISOString()
    }, remainingSec);

    res.locals.admin = session.username;
    res.locals.userId = session.userId;
    res.locals.roleId = session.roleId;
    res.locals.mustChangePassword = mustChangePassword;

    if (mustChangePassword) {
      enforcePasswordChangeWhitelist(req);
    }
    next();
  } catch (err) {
    next(err);
  }
};

function enforcePasswordChangeWhitelist(req: Parameters<RequestHandler>[0]) {
  const originalPath = req.originalUrl.split('?')[0];
  const isAllowed = 
    originalPath === '/api/admin/auth/session' ||
    originalPath === '/api/admin/auth/change-password' ||
    originalPath === '/api/admin/auth/logout' ||
    originalPath === '/api/admin/session' ||
    originalPath === '/api/admin/change-password' ||
    originalPath === '/api/admin/logout' ||
    req.path === '/session' ||
    req.path === '/change-password' ||
    req.path === '/logout';

  if (!isAllowed) {
    throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Tài khoản yêu cầu đổi mật khẩu trước khi tiếp tục thao tác.');
  }
}

/**
 * Middleware RBAC: Kiểm tra xem user có quyền cho danh mục/chức năng cụ thể hay không
 */
export const requirePermission = (permission: SystemPermission | SystemPermission[]): RequestHandler => {
  return async (req, res, next) => {
    try {
      if (!res.locals.admin) {
        return requireAdmin(req, res, async (err) => {
          if (err) return next(err);
          try {
            await evaluatePermission(req, res, next);
          } catch (e) {
            next(e);
          }
        });
      }
      await evaluatePermission(req, res, next);
    } catch (err) {
      next(err);
    }
  };

  async function evaluatePermission(_req: any, res: any, next: any) {
    // 1. Superadmin ENV (không có userId) có toàn quyền
    const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
    if (res.locals.admin === envAdminUser && !res.locals.userId) {
      return next();
    }

    const c = getCollections();
    let permissions: string[] = [];

    // 2. Nếu là user trong DB: đối soát trạng thái và vai trò hiện hành trong DB (chống stale snapshot)
    if (res.locals.userId) {
      const user = await c.adminUsers.findOne({ userId: res.locals.userId, isActive: true });
      if (!user) throw new ApiError(403, 'FORBIDDEN', 'Tài khoản đã bị khóa hoặc không tồn tại');

      if (user.roleId === 'admin') {
        res.locals.permissions = ['*'];
        return next();
      }

      const role = await c.roles.findOne({ roleId: user.roleId });
      if (role) permissions = role.permissions as string[];
      if (user.customPermissions && user.customPermissions.length > 0) {
        permissions = Array.from(new Set([...permissions, ...(user.customPermissions as string[])]));
      }
    } else if (res.locals.roleId === 'admin') {
      res.locals.permissions = ['*'];
      return next();
    } else if (res.locals.roleId) {
      const role = await c.roles.findOne({ roleId: res.locals.roleId });
      if (role) permissions = role.permissions as string[];
    }

    res.locals.permissions = permissions;

    const requiredList = Array.isArray(permission) ? permission : [permission];
    const hasMatch = requiredList.some(p => permissions.includes(p));

    if (!hasMatch) {
      const permDesc = Array.isArray(permission) ? permission.join("' hoặc '") : permission;
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: `Bạn không có quyền truy cập chức năng này (yêu cầu quyền '${permDesc}').`
      });
    }

    next();
  }
};

/**
 * Thu hồi tất cả các phiên đăng nhập của người dùng qua DB, Redis và WebSocket
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const sessions = await db.collection('admin_sessions').find({ userId }).toArray();
  for (const s of sessions) {
    if (s.tokenHash) {
      await cacheDel(`admin_session:${s.tokenHash}`);
      revokeAdminSession(s.tokenHash);
    }
  }
  await db.collection('admin_sessions').deleteMany({ userId });
  revokeAdminUser(userId);
}

/**
 * Thu hồi tất cả phiên đăng nhập và WebSocket của toàn bộ người dùng thuộc vai trò roleId
 */
export async function revokeRoleSessions(roleId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const users = await db.collection('admin_users').find({ roleId }).toArray();
  for (const u of users) {
    await revokeUserSessions(u.userId);
  }
  revokeRoleSockets(roleId);
}

export const authRouter = Router();
authRouter.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: { code: 'TOO_MANY_ATTEMPTS', message: 'Thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.' } }), async (req, res, next) => {
  try {
    const input = z.object({ username: z.string().max(80), password: z.string().min(1).max(256) }).parse(req.body);
    const c = getCollections();
    let authenticated = false;
    let username = input.username;
    let userId: string | undefined = undefined;
    let roleId = 'admin';

    let mustChangePassword = false;

    const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
    const isEnvAdminAttempt = input.username === envAdminUser;

    // 1. Kiểm tra tài khoản admin mặc định cấu hình qua biến môi trường
    if (isEnvAdminAttempt) {
      if (process.env.ADMIN_PASSWORD_HASH) {
        const [salt, stored] = process.env.ADMIN_PASSWORD_HASH.split(':');
        if (salt && stored) {
          const valid = timingSafeEqual(scryptSync(input.password, salt, 64), Buffer.from(stored, 'hex'));
          if (valid) {
            authenticated = true;
            roleId = 'admin';
            username = input.username;
          }
        }
      }
      // BẢO MẬT: Tài khoản quản trị viên ENV chỉ được phép đăng nhập bằng mật khẩu cấu hình ENV.
      // Tuyệt đối không fallback sang DB nếu sai mật khẩu ENV.
      if (!authenticated) {
        throw new ApiError(401, 'INVALID_LOGIN', 'Tên đăng nhập hoặc mật khẩu không đúng');
      }
    } else {
      // 2. Các tài khoản người dùng thông thường trong database
      const user = await c.adminUsers.findOne({ username: input.username, isActive: true });
      if (user && verifyPassword(input.password, user.passwordHash)) {
        authenticated = true;
        userId = user.userId;
        roleId = user.roleId;
        username = user.username;
        mustChangePassword = !!user.mustChangePassword;
      }
    }

    if (!authenticated) {
      throw new ApiError(401, 'INVALID_LOGIN', 'Tên đăng nhập hoặc mật khẩu không đúng');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await getDb().collection('admin_sessions').insertOne({
      tokenHash: hash(token),
      username,
      userId,
      roleId,
      expiresAt
    });
    res.cookie(cookieName, token, cookieOptions()).json({
      success: true,
      token,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 12 * 60 * 60,
      username,
      roleId,
      mustChangePassword
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/session', requireAdmin, async (_req, res) => {
  const c = getCollections();
  let permissions: string[] = ['orders', 'sports-pos', 'drink-intake', 'sports-intake', 'intake-history', 'order-history', 'revenue-report', 'settings'];
  let fullName = 'Quản trị viên';
  let roleName = 'Toàn quyền Admin';
  let mustChangePassword = false;

  if (res.locals.userId) {
    const user = await c.adminUsers.findOne({ userId: res.locals.userId, isActive: true });
    if (user) {
      fullName = user.fullName;
      mustChangePassword = !!user.mustChangePassword;
      const role = await c.roles.findOne({ roleId: user.roleId });
      if (role) {
        roleName = role.name;
        permissions = role.permissions || [];
      }
      if (user.customPermissions && user.customPermissions.length > 0) {
        permissions = Array.from(new Set([...permissions, ...user.customPermissions]));
      }
    }
  } else if (res.locals.roleId) {
    const role = await c.roles.findOne({ roleId: res.locals.roleId });
    if (role) {
      roleName = role.name;
      permissions = role.permissions || permissions;
    }
  }

  res.json({
    username: res.locals.admin,
    userId: res.locals.userId,
    fullName,
    roleName,
    roleId: res.locals.roleId || 'admin',
    permissions,
    mustChangePassword
  });
});

authRouter.post('/change-password', requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
      newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự').max(100)
    });
    const body = schema.parse(req.body);
    const c = getCollections();

    if (res.locals.userId) {
      const user = await c.adminUsers.findOne({ userId: res.locals.userId });
      if (!user) {
        throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
      }
      if (!verifyPassword(body.currentPassword, user.passwordHash)) {
        throw new ApiError(400, 'INVALID_PASSWORD', 'Mật khẩu hiện tại không chính xác');
      }
      const now = new Date();
      await c.adminUsers.updateOne(
        { userId: user.userId },
        {
          $set: {
            passwordHash: hashPassword(body.newPassword),
            mustChangePassword: false,
            updatedAt: now
          }
        }
      );
      if (typeof req.cookies[cookieName] === 'string') {
        const tokenHash = hash(req.cookies[cookieName]);
        await cacheDel(`admin_session:${tokenHash}`);
      }
      res.json({ ok: true, message: 'Đổi mật khẩu thành công!' });
    } else {
      throw new ApiError(400, 'ENV_ADMIN_CANNOT_CHANGE', 'Tài khoản quản trị viên ENV được quản lý qua cấu hình hệ thống');
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res) => {
  if (typeof req.cookies[cookieName] === 'string') {
    const tokenHash = hash(req.cookies[cookieName]);
    await getDb().collection('admin_sessions').deleteOne({ tokenHash });
    await cacheDel(`admin_session:${tokenHash}`);
    revokeAdminSession(tokenHash);
  }
  res.clearCookie(cookieName, cookieOptions()).json({ ok: true });
});

export async function getCustomerSession(
  req: Parameters<RequestHandler>[0],
  _res?: Parameters<RequestHandler>[1]
): Promise<CustomerSessionDoc> {
  const headerSession = req.headers['x-customer-session'];
  let token: string | undefined;

  if (typeof headerSession === 'string' && /^[a-f0-9]{32,64}$/i.test(headerSession.trim())) {
    token = headerSession.trim();
  } else if (typeof req.cookies?.tl_session === 'string' && /^[a-f0-9]{32,64}$/i.test(req.cookies.tl_session.trim())) {
    token = req.cookies.tl_session.trim();
  }

  if (!token) {
    throw new ApiError(401, 'SESSION_REQUIRED', 'Vui lòng quét mã QR tại sân để bắt đầu.');
  }

  const tokenHash = hash(token);
  const colls = getCollections();
  const session = await colls.customerSessions.findOne({
    sessionTokenHash: tokenHash,
    terminatedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    throw new ApiError(401, 'SESSION_EXPIRED', 'Phiên sử dụng đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại sân.');
  }

  return session;
}

