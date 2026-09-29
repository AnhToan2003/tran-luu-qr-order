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
import { InventoryReservationService } from '../services/inventoryReservationService.js';

export const sessionRouter = Router();

const sessionInitRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  // A genuine scan creates one session. Keep enough headroom for a busy venue
  // while preventing a valid public QR from being used for storage exhaustion.
  limit: Number(process.env.SESSION_INIT_RATE_LIMIT || 300),
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
  limit: Number(process.env.SESSION_CURRENT_RATE_LIMIT || 300),
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
  sig: z.string().trim().min(1, 'Chữ ký sân không được để trống').max(64)
}).strict();

// 1. Khởi tạo phiên khách hàng mới khi quét mã QR
sessionRouter.post('/init', sessionInitRateLimiter, async (req, res) => {
  const parsed = initSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'INVALID_INPUT', 'Mã sân hoặc chữ ký QR không hợp lệ');
  }

  const { courtCode, sig } = parsed.data;

  const colls = getCollections();
  const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
  if (!court) {
    throw new ApiError(404, 'COURT_NOT_FOUND', 'Sân không tồn tại trong hệ thống.');
  }
  if (!court.isActive) {
    throw new ApiError(403, 'COURT_INACTIVE', `Sân ${court.name} hiện đang tạm dừng nhận đơn gọi nước.`);
  }
  // Bind the signature to the court's revocation epoch. An administrator can
  // rotate one compromised QR without changing the global signing secret.
  if (!verifyCourtSignature(courtCode, sig, court.qrVersion ?? 0)) {
    throw new ApiError(403, 'INVALID_QR_SIGNATURE', 'Mã QR không hợp lệ, đã bị thay đổi hoặc đã được thu hồi.');
  }

  // Sinh token ngẫu nhiên 256-bit (32 bytes hex = 64 ký tự)
  const token = randomBytes(32).toString('hex');
  const sessionTokenHash = createHash('sha256').update(token).digest('hex');

  // Cấu hình thời hạn phiên (mặc định 6 giờ)
  const ttlHours = Math.max(1, parseInt(process.env.CUSTOMER_SESSION_TTL_HOURS || '6', 10) || 6);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  const CUSTOMER_IDLE_TIMEOUT_MS = Math.max(1, parseInt(process.env.CUSTOMER_IDLE_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;

  await colls.customerSessions.insertOne({
    sessionTokenHash,
    courtCode: court.code,
    courtId: court.courtId,
    courtNameSnapshot: court.name,
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
    terminatedAt: null,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  // The raw token is available only to the browser cookie jar. Application
  // JavaScript never receives it, which materially reduces the impact of XSS.
  res.cookie('tl_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ttlHours * 60 * 60 * 1000
  });

  res.status(201).json({
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
  let token = typeof tokenHeader === 'string' && /^[a-f0-9]{32,64}$/i.test(tokenHeader.trim())
    ? tokenHeader.trim()
    : undefined;
  if (!token && typeof req.cookies?.tl_session === 'string' && /^[a-f0-9]{32,64}$/i.test(req.cookies.tl_session.trim())) {
    token = req.cookies.tl_session.trim();
  }
  if (!token) {
    throw new ApiError(401, 'SESSION_REQUIRED', 'Vui lòng quét mã QR tại sân để bắt đầu.');
  }

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

  const now = new Date();
  const CUSTOMER_IDLE_TIMEOUT_MS = Math.max(1, parseInt(process.env.CUSTOMER_IDLE_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;
  const lastActive = sessionDoc.lastActiveAt || sessionDoc.createdAt;
  if (now.getTime() - lastActive.getTime() > CUSTOMER_IDLE_TIMEOUT_MS) {
    await colls.customerSessions.updateOne(
      { _id: sessionDoc._id },
      { $set: { terminatedAt: now, terminationReason: 'IDLE_TIMEOUT' } }
    );
    revokeCustomerSession(sessionTokenHash);
    await InventoryReservationService.releaseSession(sessionTokenHash);
    res.clearCookie('tl_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    throw new ApiError(401, 'SESSION_EXPIRED', 'Phiên gọi nước đã hết hạn do không có hoạt động trong 30 phút. Vui lòng quét lại mã QR tại sân để tiếp tục.');
  }

  // Throttle ghi nhận mốc hoạt động 15s để tránh tải DB
  if (now.getTime() - lastActive.getTime() > 15000) {
    void colls.customerSessions.updateOne(
      { _id: sessionDoc._id },
      { $set: { lastActiveAt: now } }
    ).catch(() => {});
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
      { $set: { terminatedAt: new Date(), terminationReason: 'MANUAL' } }
    );
    revokeCustomerSession(sessionTokenHash);
    await InventoryReservationService.releaseSession(sessionTokenHash);
  }

  // Kết thúc phiên phía khách không xóa bất kỳ đơn hàng hoặc công nợ nào của quản trị
  res.clearCookie('tl_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ ok: true, message: 'Phiên gọi nước đã kết thúc.' });
});
