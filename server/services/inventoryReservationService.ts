import { getCollections } from '../db.js';
import { broadcastEvent } from '../websocket.js';
import { invalidateCatalogCache } from '../redis.js';

export interface ReservedItemDetail {
  productId: string;
  quantity: number;
}

interface SessionReservation {
  sessionHash: string;
  courtCode?: string;
  items: Map<string, number>; // productId -> quantity
  expiresAt: number;          // timestamp ms
  createdAt: number;
  lastActiveAt: number;
}

export interface ReservationResultItem {
  productId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  availableStock: number;
  status: 'reserved' | 'partially_reserved' | 'out_of_stock';
}

export interface ReservationSyncResult {
  ok: boolean;
  expiresAt: number;
  remainingSeconds: number;
  items: ReservationResultItem[];
}

class InventoryReservationServiceImpl {
  // Map sessionHash -> SessionReservation
  private sessions = new Map<string, SessionReservation>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly DEFAULT_TTL_SECONDS = 180; // 3 phút (180s) chuẩn e-commerce / F&B

  constructor() {
    // Quét dọn các phiên giữ hàng hết hạn mỗi 5 giây
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 5000);
    this.cleanupTimer.unref(); // Không chặn tiến trình Node.js thoát
  }

  /**
   * Lấy tổng số lượng sản phẩm đang được giữ bởi các phiên KHÁC (loại trừ phiên hiện tại)
   */
  public getReservedQuantity(productId: string, excludeSessionHash?: string): number {
    this.cleanupExpired();
    let total = 0;
    const now = Date.now();

    for (const [sessionHash, session] of this.sessions.entries()) {
      if (excludeSessionHash && sessionHash === excludeSessionHash) continue;
      if (session.expiresAt <= now) continue;

      const qty = session.items.get(productId) || 0;
      total += qty;
    }
    return total;
  }

  /**
   * Lấy bản đồ toàn bộ sản phẩm đang bị giữ bởi các phiên khác: productId -> totalReserved
   */
  public getAllReservationsMap(excludeSessionHash?: string): Map<string, number> {
    this.cleanupExpired();
    const map = new Map<string, number>();
    const now = Date.now();

    for (const [sessionHash, session] of this.sessions.entries()) {
      if (excludeSessionHash && sessionHash === excludeSessionHash) continue;
      if (session.expiresAt <= now) continue;

      for (const [productId, qty] of session.items.entries()) {
        if (qty > 0) {
          map.set(productId, (map.get(productId) || 0) + qty);
        }
      }
    }
    return map;
  }

  /**
   * Đồng bộ giỏ hàng và đặt trước số lượng tồn kho (Khóa mềm có TTL)
   */
  public async syncCartReservations(
    sessionHash: string,
    items: Array<{ productId: string; quantity: number }>,
    courtCode?: string,
    ttlSeconds = this.DEFAULT_TTL_SECONDS
  ): Promise<ReservationSyncResult> {
    this.cleanupExpired();
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const colls = getCollections();
    const productIds = Array.from(new Set(items.map(i => i.productId)));
    const products = await colls.products
      .find({ productId: { $in: productIds }, deletedAt: null })
      .toArray();

    const productMap = new Map(products.map(p => [p.productId, p]));
    const reservedItemsMap = new Map<string, number>();
    const resultItems: ReservationResultItem[] = [];
    let allOk = true;

    for (const item of items) {
      if (item.quantity <= 0) continue;

      const product = productMap.get(item.productId);
      const baseStock = product?.isAvailable && product.stock > 0 ? product.stock : 0;

      // Tính tổng số lượng mà người khác đang giữ món này
      const reservedByOthers = this.getReservedQuantity(item.productId, sessionHash);
      const availableForThisSession = Math.max(0, baseStock - reservedByOthers);

      if (availableForThisSession <= 0) {
        allOk = false;
        resultItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          reservedQuantity: 0,
          availableStock: 0,
          status: 'out_of_stock'
        });
      } else if (item.quantity > availableForThisSession) {
        allOk = false;
        reservedItemsMap.set(item.productId, availableForThisSession);
        resultItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          reservedQuantity: availableForThisSession,
          availableStock: availableForThisSession,
          status: 'partially_reserved'
        });
      } else {
        reservedItemsMap.set(item.productId, item.quantity);
        resultItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          reservedQuantity: item.quantity,
          availableStock: availableForThisSession,
          status: 'reserved'
        });
      }
    }

    const previousSession = this.sessions.get(sessionHash);
    let hasChanged = false;

    // Kiểm tra xem giỏ hàng có thay đổi so với lần trước không
    if (!previousSession && reservedItemsMap.size > 0) {
      hasChanged = true;
    } else if (previousSession) {
      if (previousSession.items.size !== reservedItemsMap.size) {
        hasChanged = true;
      } else {
        for (const [pid, qty] of reservedItemsMap.entries()) {
          if (previousSession.items.get(pid) !== qty) {
            hasChanged = true;
            break;
          }
        }
      }
    }

    if (reservedItemsMap.size > 0) {
      this.sessions.set(sessionHash, {
        sessionHash,
        courtCode,
        items: reservedItemsMap,
        expiresAt,
        createdAt: previousSession?.createdAt || now,
        lastActiveAt: now
      });
    } else {
      if (this.sessions.has(sessionHash)) {
        this.sessions.delete(sessionHash);
        hasChanged = true;
      }
    }

    // Nếu có sự thay đổi số lượng giữ hàng, phát thông báo WebSocket thời gian thực
    if (hasChanged) {
      await invalidateCatalogCache();
      broadcastEvent({
        type: 'stock_updated',
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: allOk,
      expiresAt,
      remainingSeconds: Math.ceil((expiresAt - now) / 1000),
      items: resultItems
    };
  }

  /**
   * Giải phóng phiên giữ hàng khi khách làm trống giỏ hoặc rời đi
   */
  public async releaseSession(sessionHash: string, productIds?: string[]): Promise<boolean> {
    const session = this.sessions.get(sessionHash);
    if (!session) return false;

    let modified = false;

    if (productIds && productIds.length > 0) {
      for (const pid of productIds) {
        if (session.items.has(pid)) {
          session.items.delete(pid);
          modified = true;
        }
      }
      if (session.items.size === 0) {
        this.sessions.delete(sessionHash);
      }
    } else {
      this.sessions.delete(sessionHash);
      modified = true;
    }

    if (modified) {
      await invalidateCatalogCache();
      broadcastEvent({
        type: 'stock_updated',
        timestamp: new Date().toISOString()
      });
    }

    return modified;
  }

  /**
   * Xác nhận đặt đơn thành công: Xóa khóa mềm vì đơn đã chính thức trừ vào cơ sở dữ liệu thật
   */
  public commitSession(sessionHash: string, _items?: Array<{ productId: string; quantity: number }>): void {
    if (this.sessions.has(sessionHash)) {
      this.sessions.delete(sessionHash);
    }
  }

  /**
   * Lấy thông tin phiên giữ hàng hiện tại của một session
   */
  public getSessionInfo(sessionHash: string): { expiresAt: number; remainingSeconds: number; items: Record<string, number> } | null {
    this.cleanupExpired();
    const session = this.sessions.get(sessionHash);
    if (!session) return null;

    const now = Date.now();
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionHash);
      return null;
    }

    const items: Record<string, number> = {};
    for (const [k, v] of session.items.entries()) {
      items[k] = v;
    }

    return {
      expiresAt: session.expiresAt,
      remainingSeconds: Math.ceil((session.expiresAt - now) / 1000),
      items
    };
  }

  /**
   * Quét và giải phóng các phiên giữ hàng đã quá hạn TTL (Auto-Release)
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [sessionHash, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionHash);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      void invalidateCatalogCache();
      broadcastEvent({
        type: 'stock_updated',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const InventoryReservationService = new InventoryReservationServiceImpl();
