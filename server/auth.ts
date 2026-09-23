import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { getDb, getCollections } from './db.js';
import { ApiError } from './errors.js';
import type { CustomerSessionDoc, SystemPermission } from './types.js';
import { revokeAdminSession, revokeAdminUser, revokeRoleSockets } from './websocket.js';
import { cacheGet, cacheSet, cacheDel, getRedisClient } from './redis.js';
import { createRateLimitStore } from './rateLimitStore.js';

// P2/Issue #11 FIX: Use async crypto.scrypt instead of scryptSync to avoid blocking event loop
const scryptAsync = promisify(scrypt);

const cookieName = 'tl_admin';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const hasCookieSecret = () => Boolean(process.env.COOKIE_SECRET);
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  signed: hasCookieSecret(),
  maxAge: 12 * 60 * 60 * 1000
});
const cookieClearOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  signed: hasCookieSecret()
});

// P1/Issue #5 FIX: Unified token extraction — used by both requireAdmin and logout
export function extractBearerToken(req: Parameters<RequestHandler>[0]): string | undefined {
  // 1. Prefer signed HttpOnly cookie (most secure)
  const signedToken = req.signedCookies?.[cookieName];
  if (typeof signedToken === 'string') return signedToken;
  // 2. Fallback to unsigned cookie (dev without COOKIE_SECRET)
  if (!hasCookieSecret() && typeof req.cookies?.[cookieName] === 'string') {
    return req.cookies[cookieName];
  }
  // 3. Accept Bearer header (API/Swagger clients only — not web browser flow)
  if (typeof req.headers.authorization === 'string') {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  return undefined;
}

// Alias for backward compatibility
const getAdminCookieToken = extractBearerToken;

export function validateAuthConfig() {
  if (!process.env.ADMIN_PASSWORD_HASH || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.ADMIN_PASSWORD_HASH)) {
    throw new Error('ADMIN_PASSWORD_HASH must be configured with 32-hex salt and 128-hex scrypt hash.');
  }
  if (process.env.NODE_ENV === 'production') {
    const publicOrigin = process.env.PUBLIC_ORIGIN?.trim() || '';
    let parsedOrigin: URL | undefined;
    try { parsedOrigin = new URL(publicOrigin); } catch { parsedOrigin = undefined; }
    if (!parsedOrigin || parsedOrigin.protocol !== 'https:' || parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1' || parsedOrigin.hostname === '::1' || publicOrigin.endsWith('/')) {
      throw new Error('[Security Fail-Fast] PUBLIC_ORIGIN must be a real HTTPS origin without a trailing slash in production.');
    }
    if (process.env.REDIS_ENABLED !== 'true') {
      throw new Error('[Security Fail-Fast] REDIS_ENABLED=true is required in production for shared session revocation and rate limits.');
    }
    if (!process.env.COOKIE_SECRET || process.env.COOKIE_SECRET.length < 32) {
      throw new Error('[Security Fail-Fast] COOKIE_SECRET must be configured with at least 32 characters in production mode.');
    }
    if (!process.env.QR_SIGN_SECRET || process.env.QR_SIGN_SECRET === 'tran-luu-court-qr-hmac-secret-v2') {
      throw new Error('[Security Fail-Fast] QR_SIGN_SECRET must be set to a custom private secret in production mode. Default fallback is prohibited.');
    }
    if (process.env.QR_SIGN_SECRET.length < 32) {
      throw new Error('[Security Fail-Fast] QR_SIGN_SECRET must be at least 32 characters long for cryptographic security.');
    }
  }
}

// P2/Issue #9 FIX: Enforce minimum password strength
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password12345', 'password123456',
  '123456789', '12345678', '123456789', '1234567890', 'qwerty123',
  'iloveyou', 'admin', 'admin1', 'admin12', 'admin123', 'admin1234', 'admin12345', 'admin123456',
  'admin1234567', 'letmein1', 'welcome1', 'monkey123',
  'dragon123', 'master123', 'abc123456', 'pass1234', 'admin1234',
  'abcdefgh1', 'abcdefghi1', 'test123456'
]);

export function validatePasswordStrength(password: string, username?: string): void {
  if (password.length < 10) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Mật khẩu phải có tối thiểu 10 ký tự');
  }
  if (password.length > 128) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Mật khẩu không được vượt quá 128 ký tự');
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Mật khẩu không được chứa tên đăng nhập');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Mật khẩu quá phổ biến và dễ đoán. Vui lòng chọn mật khẩu mạnh hơn.');
  }
}

// P2/Issue #11 FIX: Async hashPassword — no longer blocks the event loop
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hashed = (await scryptAsync(password, salt, 64) as Buffer).toString('hex');
  return `${salt}:${hashed}`;
}

// P2/Issue #11 FIX: Async verifyPassword — no longer blocks the event loop
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [salt, hashStr] = storedHash.split(':');
    if (!salt || !hashStr) return false;
    const computed = await scryptAsync(password, salt, 64) as Buffer;
    return timingSafeEqual(computed, Buffer.from(hashStr, 'hex'));
  } catch {
    return false;
  }
}


export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    // P1/Issue #5 FIX: Use unified extractBearerToken (handles both cookie and Bearer)
    const token = extractBearerToken(req);
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
    const envAdminUser = process.env.ADMIN_USERNAME || 'admin';
    if (res.locals.admin === envAdminUser && !res.locals.userId) {
      return next();
    }

    const c = getCollections();
    let permissions: string[] = [];

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
 * One-time step-up authentication for destructive inventory operations.
 * The proof is bound to the currently authenticated account and atomically
 * marked used, so it cannot be replayed or transferred to another account.
 */
/**
 * Validate a one-time step-up proof for a fixed server-side action.
 *
 * The action is deliberately supplied by the route, never by a client header
 * or body.  This prevents a proof issued for one operation from being reused
 * on another sensitive endpoint.
 */
export function requireActionProofFor(action: string, resourceResolver?: (req: Parameters<RequestHandler>[0]) => string | undefined): RequestHandler {
  return async (req, res, next) => {
    try {
      const rawProof = req.headers['x-action-proof'];
      if (typeof rawProof !== 'string' || !/^[a-f0-9]{64}$/i.test(rawProof.trim())) {
        throw new ApiError(403, 'ACTION_PROOF_REQUIRED', 'Vui lòng xác nhận lại mật khẩu quản trị trước khi thực hiện thao tác này.');
      }

      const proofToken = rawProof.trim().toLowerCase();
      const userId = res.locals.userId || `env:${res.locals.admin}`;
      const resourceId = resourceResolver?.(req);
      const query: Record<string, unknown> = {
        proofId: proofToken,
        userId,
        action,
        used: false,
        expiresAt: { $gt: new Date() }
      };
      if (resourceId) query.resourceId = resourceId;

      const proof = await getDb().collection('action_proofs').findOneAndUpdate(
        query,
        { $set: { used: true, usedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!proof) {
        throw new ApiError(403, 'ACTION_PROOF_INVALID', 'Xác nhận mật khẩu đã hết hạn, không đúng thao tác hoặc đã được sử dụng.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Inventory/product flows use one common proof action.  Keep this export for
// existing routes while making the proof action explicit and non-transferable.
export const requireActionProof: RequestHandler = requireActionProofFor('inventory');

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

// P1/Issue #3 FIX: Rate limit by IP + username combination.
// Use Redis store when available so limits are shared across multiple instances.

function createLoginRateLimit() {
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const limit = 20; // max 20 attempts per window per IP+username

  const limiterOptions: Parameters<typeof rateLimit>[0] = {
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('login'),
    // P1 FIX: Key by IP + username to prevent username-based bypass
    // Use ipKeyGenerator helper to properly handle IPv6 addresses
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
      const username = (req.body?.username || '').toLowerCase().substring(0, 40);
      return `login:${ip}:${username}`;
    },
    message: { code: 'TOO_MANY_ATTEMPTS', message: 'Thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.' }
  };

  return rateLimit(limiterOptions);
}

authRouter.post('/login', createLoginRateLimit(), async (req, res, next) => {
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

    if (isEnvAdminAttempt) {
      if (process.env.ADMIN_PASSWORD_HASH) {
        // P2/Issue #11 FIX: Use async scrypt for env admin too
        authenticated = await verifyPassword(input.password, process.env.ADMIN_PASSWORD_HASH);
      }
      // BẢO MẬT: Tài khoản quản trị viên ENV chỉ được phép đăng nhập bằng mật khẩu cấu hình ENV.
      // Tuyệt đối không fallback sang DB nếu sai mật khẩu ENV.
      if (!authenticated) {
        throw new ApiError(401, 'INVALID_LOGIN', 'Tên đăng nhập hoặc mật khẩu không đúng');
      }
    } else {
      const user = await c.adminUsers.findOne({ username: input.username, isActive: true });
      // P2/Issue #11 FIX: async verifyPassword
      if (user && await verifyPassword(input.password, user.passwordHash)) {
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

    // P1/Issue #10 FIX: Web browser flow — set HttpOnly cookie ONLY.
    // Do NOT return the token in the JSON response body.
    // This prevents token leakage via JS/XSS/browser extensions/logs.
    // If you need Bearer tokens for API clients, use a separate /api/admin/auth/token endpoint.
    res.cookie(cookieName, token, cookieOptions()).json({
      success: true,
      // token and accessToken intentionally omitted — use HttpOnly cookie
      tokenType: 'cookie',
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
      // P2/Issue #9 FIX: Min 10 characters
      newPassword: z.string().min(10, 'Mật khẩu mới tối thiểu 10 ký tự').max(128)
    });
    const body = schema.parse(req.body);
    const c = getCollections();

    if (res.locals.userId) {
      const user = await c.adminUsers.findOne({ userId: res.locals.userId });
      if (!user) {
        throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
      }
      if (!await verifyPassword(body.currentPassword, user.passwordHash)) {
        throw new ApiError(400, 'INVALID_PASSWORD', 'Mật khẩu hiện tại không chính xác');
      }
      // P2/Issue #9 FIX: Check password strength
      validatePasswordStrength(body.newPassword, user.username);

      const now = new Date();
      await c.adminUsers.updateOne(
        { userId: user.userId },
        {
          $set: {
            passwordHash: await hashPassword(body.newPassword),
            mustChangePassword: false,
            updatedAt: now
          }
        }
      );

      // P2/Issue #9 FIX: Revoke ALL sessions when password changes (not just cache)
      await revokeUserSessions(user.userId);

      res.json({ ok: true, message: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' });
    } else {
      throw new ApiError(400, 'ENV_ADMIN_CANNOT_CHANGE', 'Tài khoản quản trị viên ENV được quản lý qua cấu hình hệ thống');
    }
  } catch (err) {
    next(err);
  }
});

// P1/Issue #5 FIX: Logout handles BOTH cookie and Bearer token
authRouter.post('/logout', async (req, res) => {
  // P1 FIX: Use unified extractBearerToken to handle cookie AND Bearer header
  const currentToken = extractBearerToken(req);
  if (currentToken) {
    const tokenHash = hash(currentToken);
    await getDb().collection('admin_sessions').deleteOne({ tokenHash });
    await cacheDel(`admin_session:${tokenHash}`);
    revokeAdminSession(tokenHash);
  }
  // Idempotent: always clear cookie and return 200, even if token was not found
  res.clearCookie(cookieName, cookieClearOptions()).json({ ok: true });
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
