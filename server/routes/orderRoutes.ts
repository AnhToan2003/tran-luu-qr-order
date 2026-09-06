import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { OrderService } from '../services/orderService';

export const orderRouter = Router();

// Middleware: Extract or create HttpOnly session hash (BR-03, BR-11)
function getOrCreateSessionHash(req: Request, res: Response): string {
  let sessionToken = req.cookies?.['tl_session'];
  if (!sessionToken) {
    sessionToken = crypto.randomBytes(32).toString('hex');
    res.cookie('tl_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
  }
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

// POST /api/orders — Tạo đơn hàng mới
orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const sessionHash = getOrCreateSessionHash(req, res);
    const { clientRequestId, courtCode, items } = req.body;

    if (!clientRequestId) {
      return res.status(400).json({ code: 'MISSING_CLIENT_REQUEST_ID', message: 'Thiếu mã yêu cầu client' });
    }
    if (!courtCode) {
      return res.status(400).json({ code: 'MISSING_COURT_CODE', message: 'Thiếu thông tin sân' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 'EMPTY_CART', message: 'Giỏ hàng không có sản phẩm' });
    }

    const order = await OrderService.placeOrder({
      sessionHash,
      clientRequestId,
      courtCode,
      items
    });

    return res.status(201).json({
      orderId: order.orderId,
      displayCode: order.displayCode,
      courtName: order.courtNameSnapshot,
      status: order.status,
      totalVnd: order.totalVnd,
      createdAt: order.createdAt.getTime(),
      editableUntil: order.editableUntil.getTime(),
      items: order.items.map(i => ({
        productId: i.productId,
        name: i.nameSnapshot,
        volume: i.volumeSnapshot,
        unitPrice: i.unitPriceVnd,
        quantity: i.quantity,
        iceQuantity: i.iceQuantity,
        lineTotal: i.lineTotalVnd
      }))
    });
  } catch (err: any) {
    console.error('[OrderAPI] Place error:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ code: err.message.split(':')[0] || 'ORDER_ERROR', message: err.message });
  }
});

// GET /api/orders/my — Lấy danh sách đơn của phiên hiện tại
orderRouter.get('/my', async (req: Request, res: Response) => {
  try {
    const sessionHash = getOrCreateSessionHash(req, res);
    const orders = await OrderService.getCustomerOrders(sessionHash);

    return res.json(orders.map(o => ({
      id: o.orderId,
      displayCode: o.displayCode,
      courtId: o.courtId,
      courtName: o.courtNameSnapshot,
      status: o.status,
      totalVnd: o.totalVnd,
      createdAt: o.createdAt.getTime(),
      editableUntil: o.editableUntil.getTime(),
      deliveredAt: o.deliveredAt ? o.deliveredAt.getTime() : null,
      cancelledAt: o.cancelledAt ? o.cancelledAt.getTime() : null,
      items: o.items.map(i => ({
        productId: i.productId,
        name: i.nameSnapshot,
        volume: i.volumeSnapshot,
        unitPrice: i.unitPriceVnd,
        quantity: i.quantity,
        iceQuantity: i.iceQuantity,
        lineTotal: i.lineTotalVnd
      }))
    })));
  } catch (err: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /api/orders/:id — Sửa món trong 60 giây
orderRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const sessionHash = getOrCreateSessionHash(req, res);
    const orderId = req.params.id as string;
    const { items } = req.body;

    const updated = await OrderService.editOrder(sessionHash, orderId, items);

    return res.json({
      orderId: updated.orderId,
      displayCode: updated.displayCode,
      courtName: updated.courtNameSnapshot,
      status: updated.status,
      totalVnd: updated.totalVnd,
      createdAt: updated.createdAt.getTime(),
      editableUntil: updated.editableUntil.getTime(),
      items: updated.items
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ code: err.message.split(':')[0], message: err.message });
  }
});

// POST /api/orders/:id/cancel — Hủy đơn trong 60 giây
orderRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const sessionHash = getOrCreateSessionHash(req, res);
    const orderId = req.params.id as string;

    const updated = await OrderService.cancelOrder(sessionHash, orderId);

    return res.json({
      orderId: updated.orderId,
      displayCode: updated.displayCode,
      status: updated.status,
      cancelledAt: updated.cancelledAt?.getTime()
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ code: err.message.split(':')[0], message: err.message });
  }
});
