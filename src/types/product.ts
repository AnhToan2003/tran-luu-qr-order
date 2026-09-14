export interface Product {
  id: string;
  name: string;
  volume: string;
  priceVnd: number;
  costPriceVnd?: number;
  stock: number;
  minStockThreshold?: number;
  category: 'water' | 'isotonic' | 'energy' | 'tea' | 'coffee';
  tag?: string;
  isAvailable?: boolean;
  imageSvg: string;
}


export const formatVnd = (price: number): string => {
  return price.toLocaleString('vi-VN') + 'đ';
};
