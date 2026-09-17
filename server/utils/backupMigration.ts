import { ApiError } from '../errors.js';

export interface MigratedBackupV2 {
  [key: string]: any;
  system?: string;
  backupType?: string;
  schemaVersion: '2.0.0';
  version: string;
  exportedAt?: string;
  stats?: Record<string, any>;
  products?: any[];
  sportsItems?: any[];
  courts?: any[];
  orders?: any[];
  roles?: any[];
  users?: any[];
  orderSequences?: any[];
  inventoryMovements?: any[];
  inventory?: any[];
  sportsMovements?: any[];
  auditLogs?: any[];
  settings?: any;
  archiveType?: string;
}

export interface MigrationResult {
  migrated: boolean;
  fromVersion: string;
  targetVersion: '2.0.0';
  data: MigratedBackupV2;
}

/**
 * Phát hiện phiên bản của tệp sao lưu
 */
export function detectBackupVersion(raw: unknown): string {
  if (Array.isArray(raw)) {
    return '1.0.0'; // Legacy raw array of products
  }
  if (!raw || typeof raw !== 'object') {
    return 'unknown';
  }
  const obj = raw as Record<string, any>;
  if (typeof obj.schemaVersion === 'string') {
    return obj.schemaVersion;
  }
  if (typeof obj.version === 'string') {
    return obj.version;
  }
  // If has products/courts/orders but no version header, it is v1.0.0
  if (Array.isArray(obj.products) || Array.isArray(obj.courts) || Array.isArray(obj.orders)) {
    return '1.0.0';
  }
  return 'unknown';
}

/**
 * Di chuyển và chuẩn hoá cấu trúc dữ liệu sao lưu về định dạng phiên bản v2.0.0
 */
export function migrateBackupToV2(raw: unknown): MigrationResult {
  if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) {
    throw new ApiError(400, 'INVALID_IMPORT', 'Dữ liệu sao lưu không đúng định dạng JSON');
  }

  // 1. Trường hợp là mảng sản phẩm v1 (Catalog backup v1)
  if (Array.isArray(raw)) {
    const products = raw.map(p => ({
      productId: p.productId || p.id,
      name: p.name,
      volume: (p.volume && String(p.volume).trim()) ? String(p.volume).trim() : 'Mặc định',
      category: p.category || 'NuocNgot',
      priceVnd: Number(p.priceVnd) || 0,
      costPriceVnd: Number(p.costPriceVnd ?? p.costPrice ?? 0),
      stock: Number(p.stock) || 0,
      minStockThreshold: Number(p.minStockThreshold) || 5,
      isAvailable: p.isAvailable !== false,
      tag: p.tag || '',
      imageSvg: p.imageSvg || ''
    }));

    return {
      migrated: true,
      fromVersion: '1.0.0',
      targetVersion: '2.0.0',
      data: {
        system: 'Sân Cầu Lông Trần Lựu',
        schemaVersion: '2.0.0',
        version: '2.0.0',
        products,
        courts: [],
        orders: [],
        sportsItems: [],
        roles: [],
        users: [],
        orderSequences: [],
        inventoryMovements: [],
        sportsMovements: [],
        auditLogs: []
      }
    };
  }

  const obj = { ...(raw as Record<string, any>) };
  const detectedVersion = detectBackupVersion(obj);

  // 2. Kiểm tra tính tương thích major version
  const major = parseInt(detectedVersion.split('.')[0], 10);
  if (!isNaN(major) && major > 2) {
    throw new ApiError(
      400,
      'UNSUPPORTED_BACKUP_VERSION',
      `Phiên bản sao lưu v${detectedVersion} mới hơn phiên bản hệ thống hiện tại (hỗ trợ tối đa v2.x). Vui lòng nâng cấp phần mềm trước khi nhập dữ liệu này.`
    );
  }

  let migrated = false;

  // 3. Chuẩn hoá danh sách sản phẩm nếu có
  if (Array.isArray(obj.products)) {
    obj.products = obj.products.map((p: any) => {
      if (!p || typeof p !== 'object') return p;
      const prod = { ...p };
      if (!prod.productId && prod.id) {
        prod.productId = prod.id;
        migrated = true;
      }
      if (prod.costPriceVnd === undefined && prod.costPrice !== undefined) {
        prod.costPriceVnd = Number(prod.costPrice) || 0;
        migrated = true;
      }
      if (prod.minStockThreshold === undefined) {
        prod.minStockThreshold = 5;
      }
      if (!prod.volume || !String(prod.volume).trim()) {
        prod.volume = 'Mặc định';
        migrated = true;
      }
      return prod;
    });
  }

  // 4. Chuẩn hoá danh sách sân nếu có
  if (Array.isArray(obj.courts)) {
    obj.courts = obj.courts.map((c: any) => {
      if (!c || typeof c !== 'object') return c;
      const court = { ...c };
      if (!court.courtId && court.id) {
        court.courtId = court.id;
        migrated = true;
      }
      if (court.isActive === undefined) court.isActive = true;
      return court;
    });
  }

  // 5. Chuẩn hoá danh sách đơn hàng và món trong đơn nếu có
  if (Array.isArray(obj.orders)) {
    obj.orders = obj.orders.map((o: any) => {
      if (!o || typeof o !== 'object') return o;
      const order = { ...o };
      if (!order.orderId && order.id) {
        order.orderId = order.id;
        migrated = true;
      }
      if (!order.orderType) {
        order.orderType = 'drinks';
      }
      if (Array.isArray(order.items)) {
        order.items = order.items.map((i: any) => {
          if (!i || typeof i !== 'object') return i;
          const item = { ...i };
          if (item.unitPriceVnd === undefined && item.unitPrice !== undefined) {
            item.unitPriceVnd = Number(item.unitPrice) || 0;
            migrated = true;
          }
          if (item.costPriceVnd === undefined && item.costPrice !== undefined) {
            item.costPriceVnd = Number(item.costPrice) || 0;
            migrated = true;
          }
          if (item.lineTotalVnd === undefined && item.lineTotal !== undefined) {
            item.lineTotalVnd = Number(item.lineTotal) || 0;
            migrated = true;
          }
          if (!item.itemType) {
            item.itemType = order.orderType === 'sports_pos' ? 'sports' : 'drink';
            migrated = true;
          }
          return item;
        });
      }
      return order;
    });
  }

  // 6. Chuẩn hoá bộ đếm sequence
  if (Array.isArray(obj.orderSequences)) {
    obj.orderSequences = obj.orderSequences.map((seq: any) => {
      if (!seq || typeof seq !== 'object') return seq;
      if (typeof seq.value === 'number') {
        migrated = true;
        return { key: seq.key, value: { sequence: seq.value } };
      }
      return seq;
    });
  }

  if (detectedVersion !== '2.0.0') {
    migrated = true;
  }

  const resultData: MigratedBackupV2 = {
    ...obj,
    schemaVersion: '2.0.0',
    version: '2.0.0',
    products: obj.products || [],
    courts: obj.courts || [],
    orders: obj.orders || [],
    sportsItems: obj.sportsItems || [],
    roles: obj.roles || [],
    users: obj.users || [],
    orderSequences: obj.orderSequences || [],
    inventoryMovements: obj.inventoryMovements || [],
    sportsMovements: obj.sportsMovements || [],
    auditLogs: obj.auditLogs || []
  };

  return {
    migrated,
    fromVersion: detectedVersion,
    targetVersion: '2.0.0',
    data: resultData
  };
}
