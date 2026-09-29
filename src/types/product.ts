export interface Product {
  id: string;
  name: string;
  volume: string;
  unit?: string;
  priceVnd: number;
  costPriceVnd?: number;
  stock: number;
  minStockThreshold?: number;
  category: string;
  tag?: string;
  isAvailable?: boolean;
  imageSvg: string;
  imageUrl?: string;
  allowIce?: boolean;
  isReserved?: boolean;
  realStock?: number;
}


export const formatVnd = (price?: number | null): string => {
  if (price === undefined || price === null || isNaN(price)) return '0đ';
  return price.toLocaleString('vi-VN') + 'đ';
};
