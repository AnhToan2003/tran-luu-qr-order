import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getCustomerSession } from '../auth.js';
import { getCollections } from '../db.js';
import { OrderService } from '../services/orderService.js';
import { customerOrderJson } from '../serialize.js';
import { ApiError } from '../errors.js';

export const orderRouter = Router();

// Lấy danh sách đơn hàng của CHÍNH PHIÊN KHÁCH HÀNG HIỆN TẠI
orderRouter.get('/my', async (req, res) => {
  const session = await getCustomerSession(req, res);
  const filter: Record<string, any> = {
    customerSessionHash: session.sessionTokenHash,
    courtId: session.courtId
  };
  const orders = await getCollections().orders.find(filter).sort({ createdAt: -1 }).limit(100).toArray();
  res.json(orders.map(customerOrderJson));
});

const orderRateLimiter = rateLimit({
  windowMs: 60000,
  limit: (req) => {
    const token = req.headers['x-customer-session'] || req.cookies?.tl_session;
    return token ? 30 : 600;
  },
  keyGenerator: (req) => {
    const token = req.headers['x-customer-session'] || req.cookies?.tl_session;
    if (typeof token === 'string' && token.trim()) {
      return `session:${token.trim()}`;
    }
    return req.ip || 'anonymous';
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: {
    code: 'RATE_LIMITED',
    message: 'Bạn thao tác quá nhanh. Vui lòng chờ vài giây trước khi thử lại.'
  }
});

// Khách đặt đơn: xác thực phiên và ràng buộc chặt chẽ với sân
orderRouter.post('/', orderRateLimiter, async (req, res) => {
  const session = await getCustomerSession(req, res);
  if (req.body?.courtCode && req.body.courtCode !== session.courtCode) {
    throw new ApiError(403, 'COURT_MISMATCH', `Phiên gọi nước này được mở cho Sân ${session.courtCode}. Quý khách vui lòng quét lại mã QR tại sân mới.`);
  }
  const order = await OrderService.placeOrder({
    sessionHash: session.sessionTokenHash,
    courtCode: session.courtCode,
    courtId: session.courtId,
    courtNameSnapshot: session.courtNameSnapshot
  }, req.body);
  res.status(201).json(customerOrderJson(order));
});

orderRouter.post('/:id/cancel', (_req, res) => res.status(403).json({ code: 'CUSTOMER_CANCEL_DISABLED', message: 'Khách không được hủy đơn. Vui lòng liên hệ quầy.' }));
orderRouter.patch('/:id', (_req, res) => res.status(403).json({ code: 'CUSTOMER_EDIT_DISABLED', message: 'Đơn đã gửi không thể chỉnh sửa. Vui lòng liên hệ quầy.' }));
