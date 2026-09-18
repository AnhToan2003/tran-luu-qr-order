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
  unit?: string;
  category: string;
  costPriceVnd?: number;
  priceVnd: number;
  stock: number;
  minStockThreshold?: number;
  imageSvg?: string;
  imageUrl?: string;
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
  unitSnapshot?: string;
  costPriceVnd?: number;
  unitPriceVnd: number;
  quantity: number;
  iceQuantity: number; // 0 <= iceQuantity <= quantity
  lineTotalVnd: number;
  itemType?: 'drink' | 'sports' | 'service';
}

export interface PaymentAuditRecord {
  from: 'unpaid' | 'paid';
  to: 'unpaid' | 'paid';
  changedBy: string;
  reason?: string;
  paymentMethod?: 'cash' | 'transfer' | null;
  at: Date;
}

export interface OrderDoc {
  _id?: ObjectId;
  orderId: string;
  displayCode: string; // e.g. #TL-0501
  clientRequestId: string;
  courtId: string;
  courtNameSnapshot: string;
  customerName?: string;
  customerPhone?: string;
  orderType?: 'drinks' | 'sports_pos';
  paymentStatus?: 'unpaid' | 'paid';
  paymentMethod?: 'cash' | 'transfer' | null;
  paidAt?: Date | null;
  paymentHistory?: PaymentAuditRecord[];
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
  batchId?: string;
  stockAfter: number;
  createdAt: Date;
  productNameSnapshot?: string;
  volumeSnapshot?: string;
  costPriceVnd?: number;
  sellingPriceVnd?: number;
  totalCostVnd?: number;
  responsiblePerson?: string;
  transferDate?: Date;
  note?: string;
  requestFingerprint?: string;
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
  fingerprint?: string;
  updatedAt: Date;
}

export interface AuditLogDoc {
  _id?: ObjectId;
  auditId: string;
  adminUsername: string;
  action: 'product_create' | 'product_update' | 'product_delete' | 'stock_adjustment' | 'stock_intake' | 'batch_stock_intake' | 'category_create' | 'order_cancel' | 'order_create' | 'order_update' | 'settings_update' | 'catalog_import' | 'data_cleaned' | string;
  targetId?: string;
  details: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

export interface CustomerSessionDoc {
  _id?: ObjectId;
  sessionTokenHash: string;
  courtCode: string;
  courtId: string;
  courtNameSnapshot: string;
  createdAt: Date;
  expiresAt: Date;
  terminatedAt?: Date | null;
  userAgent?: string;
  ip?: string;
}

export type SportsCategory = 'racket' | 'sock_long' | 'sock_short' | 'shuttlecock' | 'grip' | 'service' | 'apparel' | 'other' | string;

export interface SportsItemDoc {
  _id?: ObjectId;
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
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SportsMovementDoc {
  _id?: ObjectId;
  operationId: string;
  batchId?: string;
  itemId: string;
  itemNameSnapshot: string;
  unitSnapshot: string;
  delta: number;
  costPriceVnd: number;
  sellingPriceVnd: number;
  totalCostVnd: number;
  stockAfter: number;
  reason: 'stock_intake' | 'pos_sale' | 'stock_adjustment';
  responsiblePerson?: string;
  transferDate?: Date;
  note?: string;
  requestFingerprint?: string;
  createdAt: Date;
}

export type SystemPermission =
  | 'orders'               // Quầy Nước (Order Sân)
  | 'sports-pos'           // Quầy Thể Thao & Dịch Vụ
  | 'drink-intake'         // Nhập Hàng Nước
  | 'sports-intake'        // Nhập Hàng Thể Thao
  | 'intake-history'       // Lịch Sử Nhập Hàng
  | 'order-history'        // Lịch Sử Đơn Nước
  | 'sports-order-history' // Lịch Sử Đơn Thể Thao
  | 'revenue-report'       // Báo Cáo Doanh Thu
  | 'courts'               // Quản Lý Sân & Mã QR
  | 'backup'               // Sao Lưu & Nhật Ký
  | 'rbac';                // Phân Quyền & Người Dùng

export interface PermissionDefinition {
  id: SystemPermission;
  name: string;
  category: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  { id: 'orders', name: 'Quầy Nước (Order Sân)', category: 'Quầy Bán Hàng', description: 'Nhận đơn nước tại sân, cập nhật giao hàng và trạng thái đơn' },
  { id: 'sports-pos', name: 'Quầy Thể Thao & Dịch Vụ', category: 'Quầy Bán Hàng', description: 'Bán dụng cụ cầu lông, thuê đồ và đan cước tại quầy' },
  { id: 'drink-intake', name: 'Nhập Hàng Nước Giải Khát', category: 'Kho Hàng', description: 'Tạo món mới, nhập kho đồ uống & thức ăn nhanh' },
  { id: 'sports-intake', name: 'Nhập Hàng Thể Thao', category: 'Kho Hàng', description: 'Nhập vợt, cước, cầu, vớ, phụ kiện thi đấu' },
  { id: 'intake-history', name: 'Lịch Sử Nhập Hàng Kho', category: 'Thống Kê & Lịch Sử', description: 'Xem biến động tồn kho và giá vốn nước uống' },
  { id: 'order-history', name: 'Lịch Sử Đơn Nước', category: 'Thống Kê & Lịch Sử', description: 'Xem và xuất Excel hóa đơn gọi nước tại sân' },
  { id: 'sports-order-history', name: 'Lịch Sử Bán Thể Thao', category: 'Thống Kê & Lịch Sử', description: 'Xem hóa đơn bán phụ kiện và dịch vụ sân' },
  { id: 'revenue-report', name: 'Báo Cáo Doanh Thu', category: 'Báo Cáo', description: 'Xem báo cáo tài chính, doanh thu ca và lợi nhuận' },
  { id: 'courts', name: 'Sân Thi Đấu & Mã QR', category: 'Hệ Thống', description: 'Quản lý danh sách sân và tải bộ mã QR in ấn' },
  { id: 'backup', name: 'Sao Lưu & Nhật Ký', category: 'Hệ Thống', description: 'Sao lưu dữ liệu và nhật ký kiểm toán hoạt động' },
  { id: 'rbac', name: 'Phân Quyền & Người Dùng', category: 'Hệ Thống', description: 'Quản trị vai trò (Role) và tài khoản nhân viên (User)' }
];

export interface RoleDoc {
  _id?: ObjectId;
  roleId: string;
  name: string;
  description?: string;
  permissions: SystemPermission[] | string[];
  isSystem?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUserDoc {
  _id?: ObjectId;
  userId: string;
  username: string;
  passwordHash: string;
  fullName: string;
  roleId: string;
  customPermissions?: SystemPermission[] | string[];
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
}



