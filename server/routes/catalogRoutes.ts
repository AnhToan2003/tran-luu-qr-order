import { Router, Request, Response } from 'express';
import { getCollections } from '../db';

export const catalogRouter = Router();

catalogRouter.get('/', async (req: Request, res: Response) => {
  try {
    const colls = getCollections();
    const courtCode = (req.query.court_code as string) || '05';

    // 1. Lấy thông tin sân
    const court = await colls.courts.findOne({ code: courtCode, deletedAt: null });
    if (!court) {
      return res.status(404).json({
        code: 'COURT_NOT_FOUND',
        message: `Không tìm thấy thông tin sân ${courtCode}`
      });
    }

    if (court.isActive === false) {
      return res.json({
        court: {
          courtId: court.courtId,
          code: court.code,
          name: court.name,
          isActive: false
        },
        isAcceptingOrders: false,
        courtDisabledMessage: `Sân ${court.name} hiện đang tạm khóa nhận đơn gọi nước tại chỗ. Quý khách vui lòng liên hệ quầy thu ngân!`,
        products: []
      });
    }

    // 2. Lấy cấu hình hệ thống
    const settings = await colls.appSettings.findOne({ key: 'system_config' });
    const isAcceptingOrders = settings?.value?.isAcceptingOrders ?? true;

    // 3. Lấy danh mục sản phẩm (BR-15: Sản phẩm stock > 0 mới hiển thị cho khách)
    const products = await colls.products
      .find({ isAvailable: true, deletedAt: null, stock: { $gt: 0 } })
      .sort({ stock: -1 })
      .toArray();

    return res.json({
      court: {
        courtId: court.courtId,
        code: court.code,
        name: court.name
      },
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
  } catch (error: any) {
    console.error('[CatalogAPI] Error:', error);
    return res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
});
