import type { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePermission } from '../../auth.js';
import { getCollections, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { OrderService } from '../../services/orderService.js';
import { orderJson } from '../../serialize.js';
import { dateRange, vietnamDate } from '../../time.js';
import { id, items as itemsSchema } from '../../validation.js';
import { broadcastEvent } from '../../websocket.js';
import { invalidateCatalogCache } from '../../redis.js';
import { recordAuditLog } from '../../services/auditService.js';
import type { OrderDoc, OrderItemDoc } from '../../types.js';

export function registerOrderAdminRoutes(router: Router): void {
  router.get('/orders/active', requirePermission('orders'), async (_req, res) => {
    const c = getCollections();
    const open = await c.orders.find({
      orderType: { $ne: 'sports_pos' },
      status: { $in: ['new', 'accepted', 'preparing'] }
    }).sort({ createdAt: 1 }).toArray();

    // Bao gồm tất cả các đơn nước nợ chưa thanh toán + đơn nước đã thanh toán giao trong hôm nay
    const delivered = await c.orders.find({
      orderType: { $ne: 'sports_pos' },
      $or: [
        { status: 'delivered', paymentStatus: { $ne: 'paid' } },
        { status: 'delivered', paymentStatus: 'paid', deliveredAt: dateRange('today') }
      ]
    }).sort({ deliveredAt: -1, createdAt: -1 }).limit(1000).toArray();

    res.json([...open, ...delivered].map(orderJson));
  });

  router.post('/orders/:id/payment', requirePermission(['orders', 'sports-pos']), async (req, res) => {
    const { paymentStatus, paymentMethod, reason } = z.object({
      paymentStatus: z.enum(['paid', 'unpaid']),
      paymentMethod: z.enum(['cash', 'transfer']).optional(),
      reason: z.string().trim().max(300).optional()
    }).strict().parse(req.body);
    const orderId = id.parse(req.params.id);
    const c = getCollections();
    const existing = await c.orders.findOne({ orderId });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

    const perms = (res.locals.permissions as string[]) || [];
    const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
    if (existing.orderType === 'sports_pos') {
      if (!isAdmin && !perms.includes('sports-pos')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
      }
    } else {
      if (!isAdmin && !perms.includes('orders')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
      }
    }

    const updated = await OrderService.updatePayment(orderId, paymentStatus, paymentMethod, res.locals.admin, reason);
    await recordAuditLog(res.locals.admin, 'payment_status_update', orderId, {
      paymentStatus,
      paymentMethod: updated.paymentMethod,
      reason: reason || null
    }, req.ip);
    res.json(orderJson(updated));
  });

  router.post('/orders/:id/transition', requirePermission(['orders', 'sports-pos']), async (req, res) => {
    const { targetStatus } = z.object({ targetStatus: z.enum(['preparing', 'delivered']) }).strict().parse(req.body);
    const orderId = id.parse(req.params.id);
    const c = getCollections();
    const existing = await c.orders.findOne({ orderId });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

    const perms = (res.locals.permissions as string[]) || [];
    const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
    if (existing.orderType === 'sports_pos') {
      if (!isAdmin && !perms.includes('sports-pos')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
      }
    } else {
      if (!isAdmin && !perms.includes('orders')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
      }
    }

    res.json(orderJson(await OrderService.transition(orderId, targetStatus)));
  });

  router.post('/orders/:id/deliver-and-pay', requirePermission(['orders', 'sports-pos']), async (req, res) => {
    const { paymentStatus, paymentMethod, reason } = z.object({
      paymentStatus: z.enum(['paid', 'unpaid']),
      paymentMethod: z.enum(['cash', 'transfer']).optional(),
      reason: z.string().trim().max(300).optional()
    }).strict().parse(req.body);
    const orderId = id.parse(req.params.id);
    const c = getCollections();
    const existing = await c.orders.findOne({ orderId });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

    const perms = (res.locals.permissions as string[]) || [];
    const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
    if (existing.orderType === 'sports_pos') {
      if (!isAdmin && !perms.includes('sports-pos')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
      }
    } else {
      if (!isAdmin && !perms.includes('orders')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
      }
    }

    const order = await OrderService.deliverAndPay(orderId, paymentStatus, paymentMethod, res.locals.admin, reason);
    await recordAuditLog(res.locals.admin, 'order_update', orderId, { action: 'deliver_and_pay', paymentStatus, paymentMethod, totalVnd: order.totalVnd, reason: reason || null }, req.ip);
    res.json(orderJson(order));
  });

  router.post('/orders/:id/cancel', requirePermission(['orders', 'sports-pos']), async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).strict().parse(req.body);
    const orderId = id.parse(req.params.id);
    const c = getCollections();
    const existing = await c.orders.findOne({ orderId });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đơn');

    const perms = (res.locals.permissions as string[]) || [];
    const isAdmin = perms.includes('*') || res.locals.roleId === 'admin';
    if (existing.orderType === 'sports_pos') {
      if (!isAdmin && !perms.includes('sports-pos')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng thể thao (yêu cầu quyền sports-pos)');
      }
    } else {
      if (!isAdmin && !perms.includes('orders')) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thao tác trên đơn hàng nước (yêu cầu quyền orders)');
      }
    }

    const cancelled = await OrderService.cancel(orderId, reason, res.locals.admin);
    await recordAuditLog(res.locals.admin, 'order_cancel', orderId, { reason, courtName: cancelled.courtNameSnapshot, totalVnd: cancelled.totalVnd }, req.ip);
    res.json(orderJson(cancelled));
  });

  router.post('/orders/create-pos', requirePermission('orders'), async (req, res) => {
    const schema = z.object({
      clientRequestId: id,
      items: itemsSchema,
      paymentStatus: z.enum(['paid', 'unpaid']).optional(),
      paymentMethod: z.enum(['cash', 'transfer']).optional(),
      courtId: z.string().optional()
    }).strict();

    const input = schema.parse(req.body);
    const fingerprint = createHash('sha256').update(JSON.stringify({
      type: 'pos',
      items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))
    })).digest('hex');

    const c = getCollections();
    const existingQuery = {
      customerSessionHash: `admin:${res.locals.admin}`,
      clientRequestId: input.clientRequestId
    };

    const check = (order: OrderDoc) => {
      if (order.requestFingerprint && order.requestFingerprint !== fingerprint) {
        throw new ApiError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã dùng cho giỏ hàng khác');
      }
      return order;
    };

    const existing = await c.orders.findOne(existingQuery);
    if (existing) {
      return res.json(orderJson(check(existing)));
    }

    try {
      let targetCourtId = 'counter';
      let targetCourtName = 'Tại quầy';
      if (input.courtId && input.courtId !== 'counter') {
        const foundCourt = await c.courts.findOne({ $or: [{ courtId: input.courtId }, { code: input.courtId }], deletedAt: null });
        if (foundCourt) {
          targetCourtId = foundCourt.courtId;
          targetCourtName = foundCourt.name;
        }
      }

      const isPaid = (input.paymentStatus || 'paid') === 'paid';
      const paymentStatus = isPaid ? 'paid' : 'unpaid';
      const paymentMethod = isPaid ? (input.paymentMethod || 'cash') : null;

      const order = await transaction(async session => {
        const duplicate = await c.orders.findOne(existingQuery, { session });
        if (duplicate) return check(duplicate);

        const now = new Date();
        const orderId = randomUUID();
        const orderItems: OrderItemDoc[] = [];

        for (const item of input.items) {
          const product = await c.products.findOneAndUpdate(
            { productId: item.productId, isAvailable: true, deletedAt: null, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity, version: 1 }, $set: { updatedAt: now } },
            { session, returnDocument: 'after' }
          );
          if (!product) {
            throw new ApiError(409, 'OUT_OF_STOCK', 'Sản phẩm không đủ tồn kho để bán tại quầy');
          }

          orderItems.push({
            productId: item.productId,
            nameSnapshot: product.name,
            volumeSnapshot: product.volume,
            costPriceVnd: product.costPriceVnd || 0,
            unitPriceVnd: product.priceVnd,
            quantity: item.quantity,
            iceQuantity: item.iceQuantity,
            lineTotalVnd: product.priceVnd * item.quantity
          });

          await c.inventoryMovements.insertOne({
            productId: item.productId,
            delta: -item.quantity,
            reason: 'counter_pos_order',
            orderId,
            operationId: `pos:${orderId}:${item.productId}`,
            stockAfter: product.stock,
            createdAt: now,
            productNameSnapshot: product.name,
            volumeSnapshot: product.volume,
            costPriceVnd: product.costPriceVnd || 0,
            sellingPriceVnd: product.priceVnd,
            totalCostVnd: (product.costPriceVnd || 0) * item.quantity,
            note: `Bán trực tiếp tại quầy POS (${targetCourtName})`
          }, { session });
        }

        const totalVnd = orderItems.reduce((acc, i) => acc + i.lineTotalVnd, 0);
        const day = vietnamDate(now).replaceAll('-', '');
        const counter = await c.appSettings.findOneAndUpdate(
          { key: `order_sequence:pos:${day}` },
          { $inc: { 'value.sequence': 1 }, $set: { updatedAt: now } },
          { session, upsert: true, returnDocument: 'after' }
        );
        const seq = counter?.value?.sequence || 1;
        const displayCode = `#TL-POS-${day}-${String(seq).padStart(4, '0')}`;

        const newOrder: OrderDoc = {
          orderId,
          displayCode,
          courtId: targetCourtId,
          courtNameSnapshot: targetCourtName,
          customerName: targetCourtId === 'counter' ? 'Khách tại quầy' : `Khách tại ${targetCourtName}`,
          customerPhone: '',
          customerSessionHash: `admin:${res.locals.admin}`,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          status: 'delivered',
          paymentStatus,
          paymentMethod,
          paidAt: isPaid ? now : null,
          totalVnd,
          items: orderItems,
          createdAt: now,
          editableUntil: now,
          acceptedAt: now,
          preparingAt: now,
          deliveredAt: now,
          cancelledAt: null,
          version: 1,
          updatedAt: now
        };

        await c.orders.insertOne(newOrder, { session });
        return newOrder;
      });

      await recordAuditLog(res.locals.admin, 'order_create', order.orderId, {
        courtName: targetCourtName,
        totalVnd: order.totalVnd,
        status: 'delivered',
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod
      }, req.ip);

      broadcastEvent({
        type: 'order_created',
        data: order,
        sessionHash: order.customerSessionHash,
        timestamp: new Date().toISOString()
      });

      broadcastEvent({
        type: 'stock_updated',
        timestamp: new Date().toISOString()
      });

      await invalidateCatalogCache();
      res.status(201).json(orderJson(order));
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const winner = await c.orders.findOne(existingQuery);
        if (winner) return res.json(orderJson(check(winner)));
      }
      throw error;
    }
  });

  router.post('/orders/create-for-court', requirePermission('orders'), async (req, res) => {
    const order = await OrderService.placeOrder(`admin:${res.locals.admin}`, req.body);
    await recordAuditLog(res.locals.admin, 'order_create', order.orderId, { courtName: order.courtNameSnapshot, totalVnd: order.totalVnd }, req.ip);
    res.status(201).json(orderJson(order));
  });
}
