import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { getCollections } from '../db.js';
import { ApiError } from '../errors.js';
import { verifyCourtSignature } from '../services/qrSign.js';
import { courtCode } from '../validation.js';
import { revokeCustomerSession } from '../websocket.js';
import { createRateLimitStore } from '../rateLimitStore.js';

export const sessionRouter = Router();

const sessionInitRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('session-init'),
  message: {
    code: 'RATE_LIMITED',
    message: 'Thao tác quá nhanh. Vui lòng chờ vài giây trước khi quét lại.'
  }
});

// Rate limit cho validate/reload phiên (bảo vệ tránh brute force token)
const sessionCurrentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('session-current'),
  message: {
    code: 'RATE_LIMITED',
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
  }
});

const sessionTerminateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('session-terminate'),
  message: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu kết thúc phiên. Vui lòng thử lại sau.' }
});

const initSessionSchema = z.object({
  courtCode: courtCode,
  sig: z.string().trim().min(1, 'Chữ ký sân không được để trống')
}).strict();

// 1. Khởi tạo phiên khách hàng mới khi quét mã QR
sessionRouter.post('/init', sessionInitRateLimiter, async (req, res) => {
  const parsed = initSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'INVALID_INPUT', 'Mã sân hoặc chữ ký QR không hợp lệ');
  }

  const { courtCode, sig } = parsed.data;

  // Xác thực chữ ký số HMAC của sân
  if (!verifyCourtSignature(courtCode, sig)) {
    throw new ApiError(403, 'INVALID_QR_SIGNATURE', 'Mã QR không hợp lệ hoặc đã bị thay đổi.');
  }

  const colls = getCollections();
  const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
  if (!court) {
    throw new ApiError(404, 'COURT_NOT_FOUND', 'Sân không tồn tại trong hệ thống.');
  }
  if (!court.isActive) {
    throw new ApiError(403, 'COURT_INACTIVE', `Sân ${court.name} hiện đang tạm dừng nhận đơn gọi nước.`);
  }

  // Sinh token ngẫu nhiên 256-bit (32 bytes hex = 64 ký tự)
  const token = randomBytes(32).toString('hex');
  const sessionTokenHash = createHash('sha256').update(token).digest('hex');

  // Cấu hình thời hạn phiên (mặc định 6 giờ)
  const ttlHours = Math.max(1, parseInt(process.env.CUSTOMER_SESSION_TTL_HOURS || '6', 10) || 6);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await colls.customerSessions.insertOne({
    sessionTokenHash,
    courtCode: court.code,
    courtId: court.courtId,
    courtNameSnapshot: court.name,
    createdAt: now,
    expiresAt,
    terminatedAt: null,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  // Defense in depth: keep the existing response token for the current
  // client flow, but also issue an HttpOnly cookie so future clients do not
  // need to expose the raw session token to JavaScript.
  res.cookie('tl_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ttlHours * 60 * 60 * 1000
  });

  res.status(201).json({
    sessionToken: token,
    court: {
      courtId: court.courtId,
      code: court.code,
      name: court.name
    },
    expiresAt: expiresAt.toISOString()
  });
});

// 2. Xác thực và lấy thông tin phiên hiện tại (dùng khi reload hoặc reconnect)
sessionRouter.get('/current', sessionCurrentRateLimiter, async (req, res) => {
  const tokenHeader = req.headers['x-customer-session'];
  if (typeof tokenHeader !== 'string' || !/^[a-f0-9]{32,64}$/i.test(tokenHeader.trim())) {
    throw new ApiError(401, 'SESSION_REQUIRED', 'Vui lòng quét mã QR tại sân để bắt đầu.');
  }

  const token = tokenHeader.trim();
  const sessionTokenHash = createHash('sha256').update(token).digest('hex');
  const colls = getCollections();

  const sessionDoc = await colls.customerSessions.findOne({
    sessionTokenHash,
    terminatedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!sessionDoc) {
    throw new ApiError(401, 'SESSION_EXPIRED', 'Phiên sử dụng đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại sân.');
  }

  res.json({
    court: {
      courtId: sessionDoc.courtId,
      code: sessionDoc.courtCode,
      name: sessionDoc.courtNameSnapshot
    },
    expiresAt: sessionDoc.expiresAt.toISOString()
  });
});

// 3. Kết thúc phiên sử dụng (Customer End Session)
sessionRouter.post('/terminate', sessionTerminateRateLimiter, async (req, res) => {
  const tokenHeader = req.headers['x-customer-session'];
  let token = typeof tokenHeader === 'string' && /^[a-f0-9]{32,64}$/i.test(tokenHeader.trim()) ? tokenHeader.trim() : undefined;
  if (!token && typeof req.cookies?.tl_session === 'string' && /^[a-f0-9]{32,64}$/i.test(req.cookies.tl_session.trim())) {
    token = req.cookies.tl_session.trim();
  }
  if (token) {
    const sessionTokenHash = createHash('sha256').update(token).digest('hex');
    await getCollections().customerSessions.updateOne(
      { sessionTokenHash, terminatedAt: null },
      { $set: { terminatedAt: new Date() } }
    );
    revokeCustomerSession(sessionTokenHash);
  }

  // Kết thúc phiên phía khách không xóa bất kỳ đơn hàng hoặc công nợ nào của quản trị
  res.clearCookie('tl_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ ok: true, message: 'Phiên gọi nước đã kết thúc thành công.' });
});
