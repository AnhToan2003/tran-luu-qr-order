import { WebSocketServer, WebSocket } from 'ws';
import { createHash, randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import cookieParser from 'cookie-parser';
import { getDb, getCollections } from './db.js';
import { adminOrderJson, customerOrderJson } from './serialize.js';
import type { OrderDoc } from './types.js';
import { registerRealtimeSubscriber, registerRevocationSubscriber, publishRealtimeEvent, publishSessionRevocation } from './redis.js';

export const instanceId = randomUUID();

export interface RealtimeEvent {
  type: 'order_created' | 'order_updated' | 'stock_updated' | 'ping';
  data?: unknown;
  sessionHash?: string;
  timestamp: string;
}

interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  role?: 'admin' | 'customer';
  sessionHash?: string;
  adminTokenHash?: string;
  adminUserId?: string;
  adminPermissions?: string[];
  adminExpiresAt?: Date;
  customerExpiresAt?: Date;
  /** Promise resolves info nếu admin cookie hợp lệ */
  adminVerifyPromise?: Promise<{ isValid: boolean; tokenHash?: string; expiresAt?: Date; userId?: string; permissions?: string[] }>;
}

let wss: WebSocketServer | null = null;

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

/** Kiểm tra admin cookie hợp lệ từ HTTP Upgrade request */
async function resolveAdminFromUpgrade(req: IncomingMessage): Promise<{ isValid: boolean; tokenHash?: string; expiresAt?: Date; userId?: string; permissions?: string[] }> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies['tl_admin'];
    const cookieSecret = process.env.COOKIE_SECRET;
    const token = cookieSecret
      ? (rawToken?.startsWith('s:') ? cookieParser.signedCookie(rawToken, cookieSecret) : false)
      : rawToken;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return { isValid: false };

    const db = getDb();
    if (!db) return { isValid: false };

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await db.collection('admin_sessions').findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });
    if (!session) return { isValid: false };

    let permissions: string[] = ['orders', 'sports-pos', 'drink-intake', 'sports-intake', 'intake-history', 'order-history', 'revenue-report', 'courts', 'backup', 'rbac'];
    if (session.userId) {
      const user = await db.collection('admin_users').findOne({ userId: session.userId, isActive: true });
      if (!user) return { isValid: false };

      if (user.roleId !== 'admin') {
        const role = await db.collection('roles').findOne({ roleId: user.roleId });
        permissions = (role?.permissions as string[]) || [];
        if (user.customPermissions && Array.isArray(user.customPermissions)) {
          permissions = Array.from(new Set([...permissions, ...user.customPermissions]));
        }
      }
    }

    return { isValid: true, tokenHash, expiresAt: session.expiresAt as Date, userId: session.userId, permissions };
  } catch {
    return { isValid: false };
  }
}

export function initWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  registerRealtimeSubscriber((event: any) => {
    if (event?._originInstanceId === instanceId) return;
    broadcastLocal(event);
  });
  registerRevocationSubscriber((payload: any) => {
    if (payload?._originInstanceId === instanceId) return;
    if (payload?.userId) revokeAdminUser(payload.userId, false);
    if (payload?.tokenHash) revokeAdminSession(payload.tokenHash, false);
    if (payload?.roleId) revokeRoleSockets(payload.roleId, false);
  });

  wss.on('connection', (ws: ExtendedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    // Bắt đầu xác thực admin ngay khi kết nối — lưu Promise để await trong message handler
    ws.adminVerifyPromise = resolveAdminFromUpgrade(req);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (rawData) => {
      void (async () => {
        try {
          const payload = JSON.parse(rawData.toString());
          if (payload?.type === 'subscribe') {
            if (payload.role === 'admin') {
              // Await kết quả xác thực trước khi cấp quyền admin
              const auth = await (ws.adminVerifyPromise ?? Promise.resolve({ isValid: false }));
              if (auth.isValid && auth.tokenHash) {
                // Kiểm tra lại phiên trong DB để đảm bảo session vẫn còn hiệu lực tại thời điểm subscribe
                const db = getDb();
                const session = db ? await db.collection('admin_sessions').findOne({
                  tokenHash: auth.tokenHash,
                  expiresAt: { $gt: new Date() }
                }) : null;

                if (session) {
                  ws.role = 'admin';
                  ws.adminTokenHash = auth.tokenHash;
                  ws.adminUserId = auth.userId;
                  ws.adminPermissions = auth.permissions;
                  ws.adminExpiresAt = session.expiresAt as Date;
                } else {
                  ws.role = undefined;
                  ws.adminTokenHash = undefined;
                  ws.adminUserId = undefined;
                  ws.adminPermissions = undefined;
                  ws.adminExpiresAt = undefined;
                  try {
                    ws.close(4001, 'ADMIN_UNAUTHORIZED');
                  } catch {}
                }
              } else {
                ws.role = undefined;
                ws.adminTokenHash = undefined;
                ws.adminUserId = undefined;
                ws.adminPermissions = undefined;
                ws.adminExpiresAt = undefined;
                try {
                  ws.close(4001, 'ADMIN_UNAUTHORIZED');
                } catch {}
              }
            } else if (payload.role === 'customer' && typeof payload.sessionHash === 'string' && /^[a-f0-9]{32,64}$/i.test(payload.sessionHash)) {
              // FE gửi raw token → BE hash SHA-256 để kiểm tra hiệu lực trong DB
              const tokenHash = createHash('sha256').update(payload.sessionHash.trim()).digest('hex');
              const colls = getCollections();
              const sessionDoc = colls ? await colls.customerSessions.findOne({
                sessionTokenHash: tokenHash,
                terminatedAt: null,
                expiresAt: { $gt: new Date() }
              }) : null;

              if (sessionDoc) {
                ws.role = 'customer';
                ws.sessionHash = tokenHash;
                ws.customerExpiresAt = sessionDoc.expiresAt;
              } else {
                // Phiên không tồn tại, đã hết hạn hoặc bị hủy: thu hồi quyền và đóng socket
                ws.role = undefined;
                ws.sessionHash = undefined;
                ws.customerExpiresAt = undefined;
                try {
                  ws.close(4001, 'SESSION_EXPIRED');
                } catch {}
              }
            }
          }
        } catch {}
      })();
    });

    ws.on('error', () => {});
  });

  const heartbeatInterval = setInterval(() => {
    if (!wss) return;
    const now = new Date();
    const colls = getCollections();
    const db = getDb();

    wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.isAlive === false) {
        return extWs.terminate();
      }
      extWs.isAlive = false;
      try {
        extWs.ping();
      } catch {
        extWs.terminate();
        return;
      }

      // Kiểm tra hiệu lực phiên của admin định kỳ trong DB
      if (extWs.role === 'admin' && extWs.adminTokenHash && db) {
        void db.collection('admin_sessions').findOne({
          tokenHash: extWs.adminTokenHash,
          expiresAt: { $gt: now }
        }).then(validSession => {
          if (!validSession && extWs.readyState === WebSocket.OPEN) {
            extWs.role = undefined;
            extWs.adminTokenHash = undefined;
            extWs.adminExpiresAt = undefined;
            try { extWs.close(4001, 'ADMIN_SESSION_EXPIRED'); } catch {}
          }
        }).catch(() => {});
      }

      // Kiểm tra hiệu lực phiên của customer định kỳ trong DB
      if (extWs.role === 'customer' && extWs.sessionHash && colls) {
        void colls.customerSessions.findOne({
          sessionTokenHash: extWs.sessionHash,
          terminatedAt: null,
          expiresAt: { $gt: now }
        }).then(validSession => {
          if (!validSession && extWs.readyState === WebSocket.OPEN) {
            extWs.role = undefined;
            extWs.sessionHash = undefined;
            extWs.customerExpiresAt = undefined;
            try { extWs.close(4001, 'SESSION_EXPIRED'); } catch {}
          }
        }).catch(() => {});
      }
    });
  }, 30000);
  heartbeatInterval.unref();

  server.on('close', () => {
    clearInterval(heartbeatInterval);
    wss?.clients.forEach(c => c.terminate());
    wss?.close();
  });

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

/**
 * Thu hồi quyền và đóng ngay kết nối WebSocket của phiên khách hàng đã kết thúc
 */
export function revokeCustomerSession(sessionHash: string): void {
  if (!wss) return;
  wss.clients.forEach((client) => {
    const extWs = client as ExtendedWebSocket;
    if (extWs.sessionHash === sessionHash) {
      extWs.role = undefined;
      extWs.sessionHash = undefined;
      extWs.customerExpiresAt = undefined;
      try {
        extWs.close(4001, 'SESSION_TERMINATED');
      } catch {}
    }
  });
}

/**
 * Thu hồi quyền và đóng ngay kết nối WebSocket của admin khi đăng xuất hoặc thu hồi phiên
 */
export function revokeAdminSession(tokenHash: string, broadcast = true): void {
  if (broadcast) {
    void publishSessionRevocation({ tokenHash, _originInstanceId: instanceId });
  }
  if (!wss) return;
  wss.clients.forEach((client) => {
    const extWs = client as ExtendedWebSocket;
    if (extWs.adminTokenHash === tokenHash) {
      extWs.role = undefined;
      extWs.adminTokenHash = undefined;
      extWs.adminUserId = undefined;
      extWs.adminPermissions = undefined;
      extWs.adminExpiresAt = undefined;
      try {
        extWs.close(4001, 'ADMIN_LOGGED_OUT');
      } catch {}
    }
  });
}

/**
 * Thu hồi quyền và đóng kết nối WebSocket của tất cả phiên thuộc về một userId cụ thể
 * Sử dụng khi tài khoản bị khóa, đổi vai trò, đổi mật khẩu hoặc bị xóa
 */
export function revokeAdminUser(userId: string, broadcast = true): void {
  if (broadcast) {
    void publishSessionRevocation({ userId, _originInstanceId: instanceId });
  }
  if (!wss) return;
  wss.clients.forEach((client) => {
    const extWs = client as ExtendedWebSocket;
    if (extWs.adminUserId === userId) {
      extWs.role = undefined;
      extWs.adminTokenHash = undefined;
      extWs.adminUserId = undefined;
      extWs.adminPermissions = undefined;
      extWs.adminExpiresAt = undefined;
      try {
        extWs.close(4001, 'USER_DEACTIVATED');
      } catch {}
    }
  });
}

/**
 * Thu hồi quyền và đóng kết nối WebSocket của tất cả người dùng thuộc một vai trò (role)
 * Sử dụng khi vai trò bị chỉnh sửa quyền, xóa hoặc phục hồi từ sao lưu
 */
export function revokeRoleSockets(roleId: string, broadcast = true): void {
  if (broadcast) {
    void publishSessionRevocation({ roleId, _originInstanceId: instanceId });
  }
  if (!wss) return;
  const db = getDb();
  if (!db) return;

  void db.collection('admin_users').find({ roleId }).project({ userId: 1 }).toArray().then(users => {
    const userIds = new Set(users.map(u => u.userId));
    if (userIds.size === 0) return;

    wss?.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.role === 'admin' && extWs.adminUserId && userIds.has(extWs.adminUserId)) {
        extWs.role = undefined;
        extWs.adminTokenHash = undefined;
        extWs.adminUserId = undefined;
        extWs.adminPermissions = undefined;
        extWs.adminExpiresAt = undefined;
        try {
          extWs.close(4001, 'ROLE_PERMISSIONS_CHANGED');
        } catch {}
      }
    });
  }).catch(() => {});
}

export function broadcastLocal(event: RealtimeEvent): void {
  if (!wss) return;

  // Chuẩn hóa dữ liệu cho admin và customer nếu event là order
  let adminMessage: string;
  let customerMessage: string;

  if (event.type === 'order_created' || event.type === 'order_updated') {
    const rawOrder = event.data as any;
    const adminData = (rawOrder && typeof rawOrder === 'object' && 'orderId' in rawOrder)
      ? adminOrderJson(rawOrder as OrderDoc)
      : rawOrder;

    const customerData = (rawOrder && typeof rawOrder === 'object' && 'orderId' in rawOrder)
      ? customerOrderJson(rawOrder as OrderDoc)
      : {
          ...rawOrder,
          id: rawOrder?.id || rawOrder?.orderId,
          items: Array.isArray(rawOrder?.items)
            ? rawOrder.items.map(({ costPrice, ...rest }: any) => rest)
            : rawOrder?.items
        };

    adminMessage = JSON.stringify({ ...event, data: adminData });
    customerMessage = JSON.stringify({ ...event, data: customerData });
  } else {
    const defaultMsg = JSON.stringify(event);
    adminMessage = defaultMsg;
    customerMessage = defaultMsg;
  }

  const now = new Date();

  wss.clients.forEach((client) => {
    const extWs = client as ExtendedWebSocket;
    if (extWs.readyState !== WebSocket.OPEN) return;

    try {
      // 1. Chặn gửi ngay tức thì nếu phiên khách đã hết hạn (zero-delay, không chờ 30s heartbeat)
      if (extWs.role === 'customer' && extWs.customerExpiresAt && extWs.customerExpiresAt <= now) {
        extWs.role = undefined;
        extWs.sessionHash = undefined;
        extWs.customerExpiresAt = undefined;
        try { extWs.close(4001, 'SESSION_EXPIRED'); } catch {}
        return;
      }

      // 2. Chặn gửi ngay tức thì nếu phiên admin đã hết hạn
      if (extWs.role === 'admin' && extWs.adminExpiresAt && extWs.adminExpiresAt <= now) {
        extWs.role = undefined;
        extWs.adminTokenHash = undefined;
        extWs.adminUserId = undefined;
        extWs.adminPermissions = undefined;
        extWs.adminExpiresAt = undefined;
        try { extWs.close(4001, 'ADMIN_SESSION_EXPIRED'); } catch {}
        return;
      }

      if (event.type === 'stock_updated') {
        // Cập nhật tồn kho gửi cho tất cả các socket đang hoạt động
        extWs.send(adminMessage);
      } else if (event.type === 'order_created' || event.type === 'order_updated') {
        if (extWs.role === 'admin') {
          // Phân định phạm vi chặt chẽ: Đơn thể thao vs Đơn nước uống
          const perms = extWs.adminPermissions;
          const isAdmin = !perms || perms.includes('*');
          const rawOrder = event.data as any;
          const isSports = rawOrder?.orderType === 'sports_pos';

          let isAllowed = isAdmin;
          if (!isAllowed && perms) {
            if (isSports) {
              isAllowed = perms.includes('sports-pos') || perms.includes('sports-order-history');
            } else {
              isAllowed = perms.includes('orders') || perms.includes('order-history');
            }
          }

          if (isAllowed) {
            extWs.send(adminMessage);
          }
        } else if (extWs.role === 'customer' && event.sessionHash && extWs.sessionHash === event.sessionHash) {
          extWs.send(customerMessage);
        }
      }
    } catch {}
  });
}

export function broadcastEvent(event: RealtimeEvent): void {
  broadcastLocal(event);
  void publishRealtimeEvent({ ...event, _originInstanceId: instanceId });
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}
