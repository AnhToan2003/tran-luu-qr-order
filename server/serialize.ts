import type { OrderDoc, ProductDoc } from './types.js';
export const productJson = (p: ProductDoc) => ({
  id: p.productId,
  name: p.name,
  volume: p.volume,
  category: p.category,
  costPriceVnd: p.costPriceVnd ?? 0,
  priceVnd: p.priceVnd,
  stock: p.stock,
  minStockThreshold: p.minStockThreshold ?? 5,
  tag: p.tag,
  isAvailable: p.isAvailable,
  imageSvg: p.imageSvg
});
export const adminOrderJson = (o: OrderDoc) => ({
  id: o.orderId,
  orderId: o.orderId,
  displayCode: o.displayCode,
  courtId: o.courtId,
  courtName: o.courtNameSnapshot,
  customerName: o.customerName || '',
  customerPhone: o.customerPhone || '',
  paymentStatus: o.paymentStatus || 'unpaid',
  paidAt: o.paidAt?.getTime() ?? null,
  status: o.status,
  totalVnd: o.totalVnd,
  createdAt: o.createdAt.getTime(),
  editableUntil: o.editableUntil.getTime(),
  acceptedAt: o.acceptedAt?.getTime() ?? null,
  preparingAt: o.preparingAt?.getTime() ?? null,
  deliveredAt: o.deliveredAt?.getTime() ?? null,
  cancelledAt: o.cancelledAt?.getTime() ?? null,
  cancelReason: o.cancelReason,
  items: o.items.map(i => ({
    productId: i.productId,
    name: i.nameSnapshot,
    volume: i.volumeSnapshot,
    unitPrice: i.unitPriceVnd,
    costPrice: i.costPriceVnd ?? 0,
    quantity: i.quantity,
    iceQuantity: i.iceQuantity,
    lineTotal: i.lineTotalVnd
  }))
});

export const orderJson = adminOrderJson;

export const customerOrderJson = (o: OrderDoc) => ({
  id: o.orderId,
  orderId: o.orderId,
  displayCode: o.displayCode,
  courtId: o.courtId,
  courtName: o.courtNameSnapshot,
  customerName: o.customerName || '',
  customerPhone: o.customerPhone || '',
  paymentStatus: o.paymentStatus || 'unpaid',
  paidAt: o.paidAt?.getTime() ?? null,
  status: o.status,
  totalVnd: o.totalVnd,
  createdAt: o.createdAt.getTime(),
  editableUntil: o.editableUntil.getTime(),
  acceptedAt: o.acceptedAt?.getTime() ?? null,
  preparingAt: o.preparingAt?.getTime() ?? null,
  deliveredAt: o.deliveredAt?.getTime() ?? null,
  cancelledAt: o.cancelledAt?.getTime() ?? null,
  cancelReason: o.cancelReason,
  items: o.items.map(i => ({
    productId: i.productId,
    name: i.nameSnapshot,
    volume: i.volumeSnapshot,
    unitPrice: i.unitPriceVnd,
    quantity: i.quantity,
    iceQuantity: i.iceQuantity,
    lineTotal: i.lineTotalVnd
  }))
});
