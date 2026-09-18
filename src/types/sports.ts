export type SportsCategory =
  | 'racket'
  | 'sock_long'
  | 'sock_short'
  | 'shuttlecock'
  | 'grip'
  | 'service'
  | 'apparel'
  | 'other'
  | string;

export const SPORTS_CATEGORY_LABELS: Record<string, string> = {
  racket: 'Vợt cầu lông',
  sock_long: 'Vớ cổ dài',
  sock_short: 'Vớ cổ ngắn',
  shuttlecock: 'Quả / Ống cầu',
  grip: 'Quấn cán vợt',
  service: 'Dịch vụ sân',
  apparel: 'Trang phục thi đấu',
  other: 'Phụ kiện khác'
};

export interface SportsItem {
  id: string;
  itemId: string;
  name: string;
  category: SportsCategory;
  unit: string;
  costPriceVnd: number;
  priceVnd: number;
  stock: number;
  minStockThreshold: number;
  isService: boolean;
  isAvailable: boolean;
  imageSvg?: string;
  tag?: string;
  createdAt?: string;
}

export interface SportsIntakeItem {
  id: string;
  batchId?: string;
  operationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  costPriceVnd: number;
  sellingPriceVnd: number;
  totalCostVnd: number;
  expectedRevenueVnd?: number;
  profitMarginVnd?: number;
  profitMarginPct?: number;
  stockAfter: number;
  responsiblePerson?: string;
  note: string;
  createdAt: string;
}

export interface SportsIntakeSummary {
  totalBatches: number;
  totalQuantity: number;
  totalCostValueVnd: number;
  totalExpectedRevenueVnd?: number;
  totalExpectedProfitVnd?: number;
  overallMarginPct?: number;
}

export interface PosCartItem {
  item: SportsItem;
  quantity: number;
  priceVnd: number;
  note?: string;
}
