import { Router } from 'express';
import { getCollections } from '../db.js';
import { courtCode as courtCodeSchema } from '../validation.js';

export const catalogRouter = Router();

catalogRouter.get('/', async (req, res) => {
  const colls = getCollections();
  const rawCourt = typeof req.query.court_code === 'string' ? req.query.court_code : '05';
  const parsed = courtCodeSchema.safeParse(rawCourt);
  if (!parsed.success) {
    return res.status(404).json({
      code: 'COURT_NOT_FOUND',
      message: `Mã sân '${rawCourt}' không đúng định dạng hoặc không tồn tại`
    });
  }
  const courtCode = parsed.data;

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

  // BR-15: Chỉ hiển thị sản phẩm còn hàng (stock > 0)
  const products = await colls.products
    .find({ isAvailable: true, deletedAt: null, stock: { $gt: 0 } })
    .sort({ stock: -1 })
    .toArray();

  return res.json({
    court: { courtId: court.courtId, code: court.code, name: court.name },
    isAcceptingOrders,
    products: products.map(p => ({
      id: p.productId,
      name: p.name,
      volume: p.volume,
      category: p.category,
      priceVnd: p.priceVnd,
      stock: p.stock,
      tag: p.tag,
      imageSvg: p.imageSvg
    }))
  });
});
