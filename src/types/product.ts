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
  allowIce?: boolean;
}


export const formatVnd = (price: number): string => {
  return price.toLocaleString('vi-VN') + 'đ';
};
