import { Router } from 'express';
import { createHash } from 'node:crypto';
import { getCollections } from '../db.js';
import { getCustomerSession } from '../auth.js';
import { verifyCourtSignature } from '../services/qrSign.js';
import { courtCode as courtCodeSchema } from '../validation.js';
import type { ProductDoc } from '../types.js';

export const catalogRouter = Router();

catalogRouter.get('/', async (req, res) => {
  const colls = getCollections();
  let courtCode: string;

  const headerSession = req.headers['x-customer-session'];
  const hasSessionHeader = typeof headerSession === 'string' && /^[a-f0-9]{32,64}$/i.test(headerSession.trim());
  const hasSessionCookie = typeof req.cookies?.tl_session === 'string' && /^[a-f0-9]{32,64}$/i.test(req.cookies.tl_session.trim());

  if (hasSessionHeader || hasSessionCookie) {
    const session = await getCustomerSession(req, res);
    courtCode = session.courtCode;
  } else {
    const rawCourt = typeof req.query.court_code === 'string' ? req.query.court_code : '05';
    const parsed = courtCodeSchema.safeParse(rawCourt);
    if (!parsed.success) {
      return res.status(404).json({
        code: 'COURT_NOT_FOUND',
        message: `Mã sân '${rawCourt}' không đúng định dạng hoặc không tồn tại`
      });
    }
    courtCode = parsed.data;

    const rawSig = typeof req.query.sig === 'string' ? req.query.sig.trim() : '';
    if (!rawSig) {
      return res.status(401).json({
        code: 'SESSION_REQUIRED',
        message: 'Vui lòng quét mã QR tại sân để bắt đầu xem menu và gọi nước.'
      });
    }
    if (!verifyCourtSignature(courtCode, rawSig)) {
      return res.status(403).json({
        code: 'INVALID_QR_SIGNATURE',
        message: 'Mã QR không hợp lệ hoặc đường dẫn đã bị can thiệp. Vui lòng quét trực tiếp mã QR tại sân!'
      });
    }
  }

  const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
  if (!court) {
    return res.status(404).json({
      code: 'COURT_NOT_FOUND',
      message: `Không tìm thấy thông tin sân ${courtCode}`
    });
  }

  if (court.isActive === false) {
    return res.json({
      court: { courtId: court.courtId, code: court.code, name: court.name, isActive: false },
      isAcceptingOrders: false,
      courtDisabledMessage: `Sân ${court.name} hiện đang tạm khóa nhận đơn gọi nước tại chỗ. Quý khách vui lòng liên hệ quầy thu ngân!`,
      products: []
    });
  }

  const settings = await colls.appSettings.findOne({ key: 'system_config' });
  const isAcceptingOrders = settings?.value?.isAcceptingOrders ?? true;

  // BR-15: Chỉ hiển thị sản phẩm còn hàng (stock > 0), sắp xếp ổn định theo nhóm và tên
  const products = await colls.products
    .find({ isAvailable: true, deletedAt: null, stock: { $gt: 0 } })
    .sort({ category: 1, name: 1 })
    .toArray();

  const payload = {
    court: { courtId: court.courtId, code: court.code, name: court.name },
    isAcceptingOrders,
    products: products.map((p: ProductDoc) => ({
      id: p.productId,
      name: p.name,
      volume: p.volume,
      category: p.category,
      priceVnd: p.priceVnd,
      stock: p.stock,
      tag: p.tag,
      imageSvg: p.imageSvg,
      isAvailable: p.isAvailable !== false
    }))
  };

  const etag = `"${createHash('md5').update(JSON.stringify(payload)).digest('hex')}"`;
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  return res.json(payload);
});
