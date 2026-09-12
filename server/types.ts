import { ObjectId } from 'mongodb';

export type OrderStatus = 'new' | 'accepted' | 'preparing' | 'delivered' | 'cancelled';

export interface CourtDoc {
  _id?: ObjectId;
  courtId: string; // uuid or slug
  code: string;    // '01'..'16'
  name: string;    // 'Sân 01'
  sortOrder: number;
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDoc {
  _id?: ObjectId;
  productId: string;
  name: string;
  volume: string;
  category: 'water' | 'isotonic' | 'energy' | 'tea' | 'coffee';
  priceVnd: number;
  stock: number;
  imageSvg?: string;
  imageKey?: string;
  tag?: string;
  isAvailable: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface OrderItemDoc {
  productId: string;
  nameSnapshot: string;
  volumeSnapshot: string;
  unitPriceVnd: number;
  quantity: number;
  iceQuantity: number; // 0 <= iceQuantity <= quantity
  lineTotalVnd: number;
}

export interface OrderDoc {
  _id?: ObjectId;
  orderId: string;
  displayCode: string; // e.g. #TL-0501
  clientRequestId: string;
  courtId: string;
  courtNameSnapshot: string;
  customerSessionHash: string;
  status: OrderStatus;
  totalVnd: number;
  items: OrderItemDoc[];
  createdAt: Date;
  editableUntil: Date; // createdAt + 60s
  acceptedAt?: Date | null;
  preparingAt?: Date | null;
  deliveredAt?: Date | null; // Revenue recorded ONLY when deliveredAt is set
  cancelledAt?: Date | null;
  version: number;
  updatedAt: Date;
  cancelReason?: string;
  cancelledBy?: string;
  requestFingerprint?: string;
}

export interface InventoryMovementDoc {
  _id?: ObjectId;
  productId: string;
  delta: number; // negative when ordered, positive when cancelled/restocked
  reason: 'order_created' | 'order_edited' | 'order_cancelled' | 'stock_intake' | 'stock_adjustment' | 'counter_pos_order' | 'quick_restock';
  orderId?: string | null;
  operationId: string;
  stockAfter: number;
  createdAt: Date;
}

export interface AppSettingDoc {
  _id?: ObjectId;
  key: string;
  value: {
    isAcceptingOrders?: boolean;
    chimeIntervalSeconds?: number;
    editWindowSeconds?: number;
    completedAt?: Date;
    [key: string]: any;
  };
  updatedAt: Date;
}

export interface AuditLogDoc {
  _id?: ObjectId;
  auditId: string;
  adminUsername: string;
  action: 'product_create' | 'product_update' | 'product_delete' | 'stock_adjustment' | 'order_cancel' | 'order_create' | 'settings_update' | 'catalog_import' | 'data_cleaned';
  targetId?: string;
  details: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}
