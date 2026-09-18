import type { OrderDoc, ProductDoc } from './types.js';
export const productJson = (p: ProductDoc) => ({
  id: p.productId,
  name: p.name,
  volume: p.volume,
  unit: p.unit || 'Chai',
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
  orderType: o.orderType || 'drinks',
  courtId: o.courtId,
  courtName: o.courtNameSnapshot,
  customerName: o.customerName || '',
  customerPhone: o.customerPhone || '',
  paymentStatus: o.paymentStatus || 'unpaid',
  paymentMethod: o.paymentMethod || null,
  paidAt: o.paidAt?.getTime() ?? null,
  paymentHistory: (o.paymentHistory || []).map(p => ({
    from: p.from,
    to: p.to,
    changedBy: p.changedBy,
    reason: p.reason || '',
    paymentMethod: p.paymentMethod || null,
    at: p.at instanceof Date ? p.at.getTime() : (typeof p.at === 'number' ? p.at : null)
  })),
  status: o.status,
  totalVnd: o.totalVnd,
  createdAt: o.createdAt instanceof Date ? o.createdAt.getTime() : (typeof o.createdAt === 'string' || typeof o.createdAt === 'number' ? new Date(o.createdAt).getTime() : Date.now()),
  editableUntil: o.editableUntil instanceof Date ? o.editableUntil.getTime() : (typeof o.editableUntil === 'string' || typeof o.editableUntil === 'number' ? new Date(o.editableUntil).getTime() : Date.now() + 60000),
  acceptedAt: o.acceptedAt?.getTime() ?? null,
  preparingAt: o.preparingAt?.getTime() ?? null,
  deliveredAt: o.deliveredAt?.getTime() ?? null,
  cancelledAt: o.cancelledAt?.getTime() ?? null,
  cancelReason: o.cancelReason,
  totalCostVnd: o.items.reduce((s, i) => s + ((i.costPriceVnd ?? 0) * i.quantity), 0),
  totalProfitVnd: Math.max(0, o.totalVnd - o.items.reduce((s, i) => s + ((i.costPriceVnd ?? 0) * i.quantity), 0)),
  items: o.items.map(i => {
    const cost = (i.costPriceVnd ?? 0) * i.quantity;
    const profit = Math.max(0, i.lineTotalVnd - cost);
    return {
      productId: i.productId,
      name: i.nameSnapshot,
      volume: i.volumeSnapshot,
      unitPrice: i.unitPriceVnd,
      costPrice: i.costPriceVnd ?? 0,
      quantity: i.quantity,
      iceQuantity: i.iceQuantity,
      lineTotal: i.lineTotalVnd,
      costTotalVnd: cost,
      profitVnd: profit,
      itemType: i.itemType || 'drink'
    };
  })
});

export const orderJson = adminOrderJson;

export const customerOrderJson = (o: OrderDoc) => ({
  id: o.orderId,
  orderId: o.orderId,
  displayCode: o.displayCode,
  orderType: o.orderType || 'drinks',
  courtId: o.courtId,
  courtName: o.courtNameSnapshot,
  customerName: o.customerName || '',
  customerPhone: o.customerPhone || '',
  paymentStatus: o.paymentStatus || 'unpaid',
  paymentMethod: o.paymentMethod || null,
  paidAt: o.paidAt?.getTime() ?? null,
  status: o.status,
  totalVnd: o.totalVnd,
  createdAt: o.createdAt instanceof Date ? o.createdAt.getTime() : (typeof o.createdAt === 'string' || typeof o.createdAt === 'number' ? new Date(o.createdAt).getTime() : Date.now()),
  editableUntil: o.editableUntil instanceof Date ? o.editableUntil.getTime() : (typeof o.editableUntil === 'string' || typeof o.editableUntil === 'number' ? new Date(o.editableUntil).getTime() : Date.now() + 60000),
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
    lineTotal: i.lineTotalVnd,
    itemType: i.itemType || 'drink'
  }))
});
