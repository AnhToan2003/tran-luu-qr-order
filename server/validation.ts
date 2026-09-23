import { z } from 'zod';
export const id = z.string().trim().min(1).max(100);
export const courtCode = z.string().trim().regex(/^\d{2,3}$/, 'Mã sân gồm 2–3 chữ số');
export const quantity = z.number().int().min(1).max(1000);
export const stock = z.number().int().min(0).max(1_000_000);
export const dateTimeString = z.string().trim().refine(value => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= 4102444800000;
}, 'Ngày giờ không hợp lệ');
export const items = z.array(z.object({productId: id, quantity, iceQuantity: z.number().int().min(0).max(1000).optional().default(0)}).strict()
  .refine(item => item.iceQuantity <= item.quantity, 'Số lượng đá không được vượt quá số lượng sản phẩm'))
  .min(1).max(100)
  .refine(list => new Set(list.map(i => i.productId)).size === list.length, 'Mỗi sản phẩm chỉ được xuất hiện một lần');
export const placeOrderSchema = z.object({
  clientRequestId: id,
  courtCode: courtCode.optional(),
  customerName: z.string().trim().max(100).optional().default('Khách tại sân'),
  customerPhone: z.string().trim().max(30).optional().default(''),
  sig: z.string().trim().max(100).optional(),
  items
}).strict();
export const productFields = z.object({
  name: z.string().trim().min(1).max(120),
  volume: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(30).optional().default('Chai'),
  category: z.string().trim().min(1, 'Hạng mục không được để trống').max(60),
  costPriceVnd: z.number().int().min(0).max(100_000_000).default(0),
  priceVnd: z.number().int().min(1).max(100_000_000), stock,
  minStockThreshold: z.number().int().min(0).max(100_000).default(5),
  tag: z.string().trim().max(40).default(''),
  imageSvg: z.string().max(2_000_000).refine(v => !v || /^data:image\/(png|jpeg|webp|svg\+xml);(base64|utf8),/.test(v) || /^<svg[\s>]/.test(v.trim()) || /^\/images\//.test(v) || /^https?:\/\//.test(v), 'Ảnh không hợp lệ').default(''),
  isAvailable: z.boolean().default(true)
});
export const productPatch = productFields.extend({unit:z.string().trim().max(30).optional(),minStockThreshold:z.number().int().min(0).max(100_000),tag:z.string().trim().max(40),imageSvg:productFields.shape.imageSvg.removeDefault(),isAvailable:z.boolean(),costPriceVnd:z.number().int().min(0).max(100_000_000)}).partial().extend({expectedStock: stock.optional()}).strict();
