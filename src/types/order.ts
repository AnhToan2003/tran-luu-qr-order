export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'delivered' | 'cancelled';

export interface OrderItem {
  imageSvg?: string;
  productId: string;
  name: string;
  volume: string;
  category?: string;
  unitPrice: number;
  costPrice?: number;
  quantity: number;
  iceQuantity: number; // 0 <= iceQuantity <= quantity
  lineTotal: number;
}

export interface Order {
  id: string;
  displayCode: string; // e.g. #TL-0501
  courtId: string;
  courtName: string; // e.g. Sân 05
  customerName?: string;
  customerPhone?: string;
  orderType?: 'drinks' | 'sports_pos';
  paymentStatus?: 'unpaid' | 'paid';
  paymentMethod?: 'cash' | 'transfer' | null;
  paidAt?: number | null;
  items: OrderItem[];
  totalVnd: number;
  status: OrderStatus;
  createdAt: number;
  editableUntil: number; // createdAt + 60000 (60s)
  acceptedAt?: number;
  preparingAt?: number;
  deliveredAt?: number;
  cancelledAt?: number;
}

export interface Court {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  sig?: string;
}
