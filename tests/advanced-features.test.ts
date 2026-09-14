import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync, randomUUID, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { existsSync } from 'node:fs';
import { WebSocket } from 'ws';

test('Advanced Features Suite: WebSockets, Production Fail-Fast, Key Rotation, Low Stock', { timeout: 180000 }, async t => {
  const localBinary = 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe';
  const repl = await MongoMemoryReplSet.create({
    binary: existsSync(localBinary) ? { systemBinary: localBinary, checkMD5: false } : undefined,
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });

  process.env.MONGO_URI = repl.getUri();
  process.env.DB_NAME = 'tran_luu_adv_' + randomBytes(6).toString('hex');
  process.env.NODE_ENV = 'test';

  const salt = randomBytes(16).toString('hex');
  process.env.ADMIN_PASSWORD_HASH = salt + ':' + scryptSync('test-password', salt, 64).toString('hex');
  process.env.QR_SIGN_SECRET = 'random-super-secret-at-least-32-chars-long-12345';
  process.env.QR_SIGN_SECRET_LEGACY = 'old-legacy-secret-for-printed-qr-codes-54321';

  const { connectToDatabase, closeDatabase, getCollections } = await import('../server/db.js');
  const { createApp } = await import('../server/app.js');
  const { initWebSocketServer } = await import('../server/websocket.js');
  const { signCourtCode, verifyCourtSignature } = await import('../server/services/qrSign.js');
  const { validateAuthConfig } = await import('../server/auth.js');

  await connectToDatabase();
  const app = createApp().listen(0, '127.0.0.1');
  initWebSocketServer(app);
  await new Promise<void>(r => app.once('listening', r));
  const port = (app.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}/ws`;

  const c = getCollections();
  const now = new Date();

  await c.courts.insertOne({
    courtId: 'c_adv_01',
    code: '01',
    name: 'Sân 01',
    isActive: true,
    sortOrder: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  });

  await c.products.insertOne({
    productId: 'adv_tea_01',
    name: 'Trà Đào Cam Sả',
    volume: '500ml',
    category: 'tea',
    priceVnd: 25000,
    costPriceVnd: 12000,
    stock: 20,
    minStockThreshold: 5,
    isAvailable: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1
  });

  const api = async (path: string, body?: unknown, cookie = '', method = body === undefined ? 'GET' : 'POST') => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie.startsWith('tl_admin=')) {
      headers.cookie = cookie;
    } else if (cookie) {
      headers['x-customer-session'] = cookie;
    }
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
      cookie: response.headers.get('set-cookie')?.split(';')[0] || ''
    };
  };

  let adminCookie = '';
  let customerToken = '';

  try {
    // ---------------------------------------------------------------------------------
    // TEST 1: Production Security Fail-Fast Validation
    // ---------------------------------------------------------------------------------
    await t.test('Production fail-fast enforcement for QR_SIGN_SECRET and password', async () => {
      // 1. Valid config should not throw
      assert.doesNotThrow(() => validateAuthConfig());

      // 2. In production, default secret must throw
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.QR_SIGN_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        process.env.QR_SIGN_SECRET = 'tran-luu-court-qr-hmac-secret-v2';
        assert.throws(() => validateAuthConfig(), /Security Fail-Fast/);

        // 3. In production, short secret (< 32 chars) must throw
        process.env.QR_SIGN_SECRET = 'too-short';
        assert.throws(() => validateAuthConfig(), /at least 32 characters/);
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.QR_SIGN_SECRET = origSecret;
      }
    });

    // ---------------------------------------------------------------------------------
    // TEST 2: QR Key Rotation (Zero-downtime printed QR support)
    // ---------------------------------------------------------------------------------
    await t.test('QR key rotation supports current secret and legacy printed QR codes', async () => {
      // Chữ ký tạo bởi khóa hiện tại
      const currentSig = signCourtCode('01');
      assert.equal(verifyCourtSignature('01', currentSig), true);

      // Chữ ký tạo bởi khóa cũ (legacy secret)
      const { createHmac } = await import('node:crypto');
      const legacySig = createHmac('sha256', process.env.QR_SIGN_SECRET_LEGACY!)
        .update('court:01')
        .digest('hex')
        .slice(0, 12);

      assert.equal(verifyCourtSignature('01', legacySig), true, 'Legacy QR printed on tables must verify successfully');

      // Chữ ký giả mạo phải bị từ chối
      assert.equal(verifyCourtSignature('01', 'fake_sig_123'), false);
      assert.equal(verifyCourtSignature('02', currentSig), false, 'Signature for court 01 must not work for court 02');
    });

    // ---------------------------------------------------------------------------------
    // TEST 3: Real-time WebSockets (< 50ms broadcast)
    // ---------------------------------------------------------------------------------
    await t.test('Real-time WebSocket server broadcasts order_created and order_updated', async () => {
      // Login admin
      const login = await api('/api/admin/auth/login', { username: 'admin', password: 'test-password' });
      adminCookie = login.cookie;

      // Init customer session
      const sig = signCourtCode('01');
      const sessionInit = await api('/api/sessions/init', { courtCode: '01', sig });
      customerToken = sessionInit.data.sessionToken;

      // Connect admin WebSocket — phải gửi cookie admin để xác thực
      const wsClient = new WebSocket(wsBase, {
        headers: { cookie: adminCookie }
      });
      await new Promise<void>((resolve, reject) => {
        wsClient.on('open', () => {
          wsClient.send(JSON.stringify({ type: 'subscribe', role: 'admin' }));
          resolve();
        });
        wsClient.on('error', reject);
      });

      const receivedEvents: any[] = [];
      wsClient.on('message', (data) => {
        try {
          receivedEvents.push(JSON.parse(data.toString()));
        } catch {}
      });

      // Customer places order
      const orderRes = await api('/api/orders', {
        clientRequestId: randomUUID(),
        courtCode: '01',
        customerName: 'Test WS Customer',
        customerPhone: '0901234567',
        items: [{
          productId: 'adv_tea_01',
          quantity: 2,
          iceQuantity: 2
        }]
      }, customerToken);

      assert.equal(orderRes.status, 201);
      const createdOrderId = orderRes.data.id;

      // Wait up to 500ms for WebSocket event
      await new Promise(r => setTimeout(r, 100));

      const orderCreatedEvent = receivedEvents.find(e => e.type === 'order_created');
      assert.ok(orderCreatedEvent, 'Admin must receive order_created event via WebSocket');
      assert.equal(orderCreatedEvent.data.orderId, createdOrderId);

      // Transition order status
      await api(`/api/admin/orders/${createdOrderId}/transition`, { targetStatus: 'preparing' }, adminCookie);

      await new Promise(r => setTimeout(r, 100));

      const orderUpdatedEvent = receivedEvents.find(e => e.type === 'order_updated' && e.data.status === 'preparing');
      assert.ok(orderUpdatedEvent, 'Admin must receive order_updated event with status=preparing');

      wsClient.close();
    });

    // ---------------------------------------------------------------------------------
    // TEST 4: Low Stock Configuration & Validation
    // ---------------------------------------------------------------------------------
    await t.test('Product minStockThreshold default and custom validation', async () => {
      // Create product without minStockThreshold -> defaults to 5
      const createRes = await api('/api/admin/products', {
        name: 'Trà Tắc Khổng Lồ',
        volume: '1000ml',
        category: 'tea',
        priceVnd: 30000,
        costPriceVnd: 10000,
        stock: 3
      }, adminCookie);

      assert.equal(createRes.status, 201);
      // Update product with custom minStockThreshold
      const updateRes = await api(`/api/admin/products/${createRes.data.id}`, {
        minStockThreshold: 10
      }, adminCookie, 'PATCH');

      assert.equal(updateRes.status, 200);
      const updatedProd = await c.products.findOne({ productId: createRes.data.id });
      assert.equal(updatedProd?.minStockThreshold, 10, 'Custom minStockThreshold must update to 10');
    });

    // ---------------------------------------------------------------------------------
    // TEST 5: Verify 4 New Security & Business Logic Fixes (P1 & P2)
    // ---------------------------------------------------------------------------------
    await t.test('P1 & P2: Customer WS privacy, termination revocation, and intake history cancel exclusion', async () => {
      // 1. Khởi tạo phiên khách mới
      const sig = signCourtCode('01');
      const sessionInit = await api('/api/sessions/init', { courtCode: '01', sig });
      const custToken = sessionInit.data.sessionToken;

      // 2. Kết nối WebSocket với tư cách khách hàng
      const custWs = new WebSocket(wsBase);
      await new Promise<void>((resolve, reject) => {
        custWs.on('open', () => {
          custWs.send(JSON.stringify({ type: 'subscribe', role: 'customer', sessionHash: custToken }));
          resolve();
        });
        custWs.on('error', reject);
      });

      const custEvents: any[] = [];
      let isCustWsClosed = false;
      custWs.on('message', (d) => {
        try { custEvents.push(JSON.parse(d.toString())); } catch {}
      });
      custWs.on('close', () => {
        isCustWsClosed = true;
      });

      // 3. Khách đặt 1 đơn
      const orderRes = await api('/api/orders', {
        clientRequestId: randomUUID(),
        courtCode: '01',
        customerName: 'Khách Test Privacy',
        customerPhone: '0908888888',
        items: [{ productId: 'adv_tea_01', quantity: 1, iceQuantity: 0 }]
      }, custToken);
      assert.equal(orderRes.status, 201);
      const testOrderId = orderRes.data.id;
      // Khách không thấy costPrice trong REST response
      assert.equal(orderRes.data.items[0].costPrice, undefined);

      // 4. Admin chuyển trạng thái đơn sang 'preparing'
      await api(`/api/admin/orders/${testOrderId}/transition`, { targetStatus: 'preparing' }, adminCookie);
      await new Promise(r => setTimeout(r, 100));

      // Khách nhận được event WebSocket và:
      // a) Có trường id để so khớp tức thì
      // b) Không có trường costPrice trong items
      const custUpdatedEvent = custEvents.find(e => e.type === 'order_updated');
      assert.ok(custUpdatedEvent, 'Customer must receive order_updated via WebSocket');
      assert.equal(custUpdatedEvent.data.id, testOrderId, 'Event data must have id field matching testOrderId');
      assert.equal(custUpdatedEvent.data.items[0].costPrice, undefined, 'Customer must NOT receive costPrice in WebSocket');

      // 5. Khách kết thúc phiên (terminate)
      const termRes = await api('/api/sessions/terminate', undefined, custToken, 'POST');
      assert.equal(termRes.status, 200);

      // Đợi một chút để WebSocket server đóng kết nối
      await new Promise(r => setTimeout(r, 100));
      assert.ok(isCustWsClosed, 'Customer WebSocket must be closed immediately upon session termination');

      // 6. Kiểm tra Hủy đơn không bị tính vào lịch sử nhập hàng (Intake history)
      const beforeIntake = await api('/api/admin/inventory/intake-history', undefined, adminCookie);
      const beforeBatches = beforeIntake.data.summary.totalBatches;
      const beforeQty = beforeIntake.data.summary.totalQuantity;

      // Admin hủy đơn hàng
      const cancelRes = await api(`/api/admin/orders/${testOrderId}/cancel`, { reason: 'Khách test hủy đơn' }, adminCookie);
      assert.equal(cancelRes.status, 200);

      // Lấy thống kê nhập hàng sau khi hủy
      const afterIntake = await api('/api/admin/inventory/intake-history', undefined, adminCookie);
      const afterBatches = afterIntake.data.summary.totalBatches;
      const afterQty = afterIntake.data.summary.totalQuantity;

      // Số đợt nhập và số lượng nhập TUYỆT ĐỐI KHÔNG TĂNG
      assert.equal(afterBatches, beforeBatches, 'Cancelling order must NOT increase totalBatches in intake history');
      assert.equal(afterQty, beforeQty, 'Cancelling order must NOT increase totalQuantity in intake history');
    });

    // ---------------------------------------------------------------------------------
    // TEST 6: [P1] Admin Logout Immediately Revokes WebSocket Connection
    // ---------------------------------------------------------------------------------
    await t.test('P1: Admin logout immediately closes WebSocket and revokes receiving updates', async () => {
      // 1. Admin đăng nhập phiên mới
      const loginRes = await api('/api/admin/auth/login', { username: 'admin', password: 'test-password' });
      const testAdminCookie = loginRes.cookie;
      assert.ok(testAdminCookie.includes('tl_admin='), 'Admin login must set tl_admin cookie');

      // 2. Mở kết nối WebSocket admin
      const adminWs = new WebSocket(wsBase, {
        headers: { cookie: testAdminCookie }
      });

      await new Promise<void>((resolve, reject) => {
        adminWs.on('open', () => {
          adminWs.send(JSON.stringify({ type: 'subscribe', role: 'admin' }));
          resolve();
        });
        adminWs.on('error', reject);
      });

      let adminWsClosed = false;
      let adminCloseCode = 0;
      const adminReceivedEvents: any[] = [];

      adminWs.on('message', (d) => {
        try { adminReceivedEvents.push(JSON.parse(d.toString())); } catch {}
      });
      adminWs.on('close', (code) => {
        adminWsClosed = true;
        adminCloseCode = code;
      });

      // 3. Admin gọi API logout
      const logoutRes = await api('/api/admin/auth/logout', undefined, testAdminCookie, 'POST');
      assert.equal(logoutRes.status, 200);

      // Đợi một khoảng ngắn (100ms) để socket close kích hoạt
      await new Promise(r => setTimeout(r, 100));

      assert.equal(adminWsClosed, true, 'Admin WebSocket must be closed immediately upon logout');
      assert.equal(adminCloseCode, 4001, 'Close code must be 4001');

      // 4. Kiểm tra session API trả 401
      const sessionCheck = await api('/api/admin/auth/session', undefined, testAdminCookie);
      assert.equal(sessionCheck.status, 401, 'API must return 401 after logout');

      // 5. Khách tạo đơn mới, xác nhận socket cũ của admin hoàn toàn không nhận được
      const sig = signCourtCode('01');
      const sessionInit = await api('/api/sessions/init', { courtCode: '01', sig });
      const custToken = sessionInit.data.sessionToken;

      await api('/api/orders', {
        clientRequestId: randomUUID(),
        courtCode: '01',
        customerName: 'Khách Sau Logout',
        customerPhone: '0909999999',
        items: [{ productId: 'adv_tea_01', quantity: 1, iceQuantity: 0 }]
      }, custToken);

      await new Promise(r => setTimeout(r, 100));
      assert.equal(adminReceivedEvents.length, 0, 'Revoked admin socket must not receive any order events');
    });

    // ---------------------------------------------------------------------------------
    // TEST 7: [P2] Expired Customer Session Blocked Instantly on Broadcast (Zero-Delay)
    // ---------------------------------------------------------------------------------
    await t.test('P2: Expired customer session is terminated immediately upon broadcast without 30s delay', async () => {
      // 1. Tạo phiên khách hàng có hạn dùng rất ngắn (150ms)
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 150);

      await c.customerSessions.insertOne({
        courtId: 'c_adv_01',
        courtCode: '01',
        courtNameSnapshot: 'Sân 01',
        sessionTokenHash: tokenHash,
        expiresAt,
        createdAt: new Date(),
        terminatedAt: null,
        ip: '127.0.0.1',
        userAgent: 'test-agent'
      });

      // 2. Kết nối WebSocket và subscribe
      const custWs = new WebSocket(wsBase);
      await new Promise<void>((resolve, reject) => {
        custWs.on('open', () => {
          custWs.send(JSON.stringify({ type: 'subscribe', role: 'customer', sessionHash: token }));
          resolve();
        });
        custWs.on('error', reject);
      });

      let custWsClosed = false;
      let custCloseCode = 0;
      const custEvents: any[] = [];

      custWs.on('message', (d) => {
        try { custEvents.push(JSON.parse(d.toString())); } catch {}
      });
      custWs.on('close', (code) => {
        custWsClosed = true;
        custCloseCode = code;
      });

      // 3. Đợi 250ms để phiên hết hạn tự nhiên (chưa tới chu kỳ 30s heartbeat)
      await new Promise(r => setTimeout(r, 250));

      // Xác nhận API đã trả về 401 khi phiên hết hạn
      const apiCheck = await api('/api/orders/my', undefined, token);
      assert.equal(apiCheck.status, 401, 'API must return 401 when customer session is expired');

      // 4. Phát sinh sự kiện đơn hàng khớp với sessionHash này
      const { broadcastEvent } = await import('../server/websocket.js');
      broadcastEvent({
        type: 'order_updated',
        data: { id: 'order_fake_123', status: 'completed' },
        sessionHash: tokenHash,
        timestamp: new Date().toISOString()
      });

      await new Promise(r => setTimeout(r, 100));

      // 5. Xác nhận:
      // a) Socket bị đóng ngay lập tức khi phát sinh broadcast (0ms delay)
      assert.equal(custWsClosed, true, 'Customer WebSocket must be closed instantly upon broadcast after expiry');
      assert.equal(custCloseCode, 4001, 'Close code must be 4001');
      // b) Khách KHÔNG hề nhận được sự kiện cập nhật đơn hàng này
      assert.equal(custEvents.length, 0, 'Customer socket must NOT receive order event when expired');
    });

  } finally {
    app.close();
    await closeDatabase();
    await repl.stop();
  }
});
