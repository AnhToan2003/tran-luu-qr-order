import type { OrderDoc, ProductDoc } from './types.js';
export const productJson = (p: ProductDoc) => ({id:p.productId, name:p.name, volume:p.volume, category:p.category, priceVnd:p.priceVnd, stock:p.stock, tag:p.tag, isAvailable:p.isAvailable, imageSvg:p.imageSvg});
export const orderJson = (o: OrderDoc) => ({
  id:o.orderId, displayCode:o.displayCode, courtId:o.courtId, courtName:o.courtNameSnapshot,
  status:o.status, totalVnd:o.totalVnd, createdAt:o.createdAt.getTime(), editableUntil:o.editableUntil.getTime(),
  acceptedAt:o.acceptedAt?.getTime() ?? null, preparingAt:o.preparingAt?.getTime() ?? null,
  deliveredAt:o.deliveredAt?.getTime() ?? null, cancelledAt:o.cancelledAt?.getTime() ?? null, cancelReason:o.cancelReason,
  items:o.items.map(i=>({productId:i.productId,name:i.nameSnapshot,volume:i.volumeSnapshot,unitPrice:i.unitPriceVnd,quantity:i.quantity,iceQuantity:i.iceQuantity,lineTotal:i.lineTotalVnd}))
});
