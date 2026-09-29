import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getCollections } from '../db.js';
import { getCustomerSession } from '../auth.js';
import { verifyCourtSignature } from '../services/qrSign.js';
import { courtCode as courtCodeSchema } from '../validation.js';
import type { ProductDoc } from '../types.js';
import { cacheGet, cacheSet } from '../redis.js';
import { InventoryReservationService } from '../services/inventoryReservationService.js';

export const catalogRouter = Router();

catalogRouter.get('/', async (req, res) => {
  const colls = getCollections();
  let courtCode: string;
  let customerSessionHash: string | undefined;

  const headerSession = req.headers['x-customer-session'];
  const hasSessionHeader = typeof headerSession === 'string' && /^[a-f0-9]{32,64}$/i.test(headerSession.trim());
  const hasSessionCookie = typeof req.cookies?.tl_session === 'string' && /^[a-f0-9]{32,64}$/i.test(req.cookies.tl_session.trim());

  if (hasSessionHeader || hasSessionCookie) {
    const session = await getCustomerSession(req, res);
    courtCode = session.courtCode;
    customerSessionHash = session.sessionTokenHash;
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
  }

  const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
  if (!court) {
    return res.status(404).json({
      code: 'COURT_NOT_FOUND',
      message: `Không tìm thấy thông tin sân ${courtCode}`
    });
  }

  if (!hasSessionHeader && !hasSessionCookie) {
    const rawSig = typeof req.query.sig === 'string' ? req.query.sig.trim() : '';
    if (!verifyCourtSignature(courtCode, rawSig, court.qrVersion ?? 0)) {
      return res.status(403).json({
        code: 'INVALID_QR_SIGNATURE',
        message: 'Mã QR không hợp lệ, đã bị thay đổi hoặc đã được thu hồi. Vui lòng quét mã QR hiện hành tại sân!'
      });
    }
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

  // Lấy danh sách sản phẩm từ Redis Cache nếu có
  let mappedProducts = await cacheGet<Array<any>>('cache:catalog:available_products');

  if (!mappedProducts) {
    // BR-15: Chỉ hiển thị sản phẩm còn bán (deletedAt null), sắp xếp ổn định theo nhóm và tên
    const products = await colls.products
      .find({ isAvailable: true, deletedAt: null, stock: { $gt: 0 } })
      .sort({ category: 1, name: 1 })
      .toArray();

    mappedProducts = products.map((p: ProductDoc) => ({
      id: p.productId,
      name: p.name,
      volume: p.volume,
      unit: p.unit || 'Chai',
      category: p.category,
      priceVnd: p.priceVnd,
      stock: p.stock,
      tag: p.tag,
      imageSvg: p.imageUrl || p.imageSvg,
      imageUrl: p.imageUrl,
      isAvailable: p.isAvailable !== false
    }));

    // Cache trong 180 giây (3 phút)
    void cacheSet('cache:catalog:available_products', mappedProducts, 180);
  }

  // Áp dụng thuật toán Khóa mềm giữ giỏ hàng (Soft Reservation with TTL):
  // Tính toán số lượng khả dụng thực tế bằng cách loại trừ các món đang bị giữ bởi phiên khác
  const reservedMap = InventoryReservationService.getAllReservationsMap(customerSessionHash);
  const dynamicProducts = mappedProducts.map((p: any) => {
    const reservedByOthers = reservedMap.get(p.id) || 0;
    const effectiveStock = Math.max(0, p.stock - reservedByOthers);
    const isReserved = p.stock > 0 && effectiveStock === 0;
    return {
      ...p,
      stock: effectiveStock,
      realStock: p.stock,
      isReserved
    };
  });

  const payload = {
    court: { courtId: court.courtId, code: court.code, name: court.name },
    isAcceptingOrders,
    products: dynamicProducts
  };

  const etag = `"${createHash('md5').update(JSON.stringify(payload)).digest('hex')}"`;
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  return res.json(payload);
});

// Endpoint giữ hàng tạm thời cho giỏ hàng (Soft-lock có TTL)
catalogRouter.post('/reserve', async (req, res) => {
  const session = await getCustomerSession(req, res);
  const schema = z.object({
    items: z.array(z.object({
      productId: z.string().trim().min(1),
      quantity: z.number().int().min(0).max(1000)
    })).max(100)
  });
  const input = schema.parse(req.body);
  const result = await InventoryReservationService.syncCartReservations(
    session.sessionTokenHash,
    input.items,
    session.courtCode
  );
  return res.json(result);
});

// Endpoint giải phóng giữ hàng khi khách xóa món hoặc hủy giỏ
catalogRouter.post('/release', async (req, res) => {
  const session = await getCustomerSession(req, res);
  const schema = z.object({
    productIds: z.array(z.string().trim().min(1)).optional()
  });
  const input = schema.parse(req.body || {});
  await InventoryReservationService.releaseSession(session.sessionTokenHash, input.productIds);
  return res.json({ ok: true });
});

// Endpoint lấy thông tin giữ hàng hiện tại của khách
catalogRouter.get('/reservation', async (req, res) => {
  const session = await getCustomerSession(req, res);
  const info = InventoryReservationService.getSessionInfo(session.sessionTokenHash);
  return res.json(info || { expiresAt: 0, remainingSeconds: 0, items: {} });
});
