import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { existsSync } from 'node:fs';

test('100 Concurrent Users Stress & Concurrency Suite', { timeout: 180000 }, async t => {
  const localBinary = 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe';
  const repl = await MongoMemoryReplSet.create({
    binary: existsSync(localBinary) ? { systemBinary: localBinary, checkMD5: false } : undefined,
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });

  process.env.MONGO_URI = repl.getUri();
  process.env.DB_NAME = 'tran_luu_stress_' + randomBytes(6).toString('hex');
  process.env.NODE_ENV = 'test';

  const salt = randomBytes(16).toString('hex');
  process.env.ADMIN_PASSWORD_HASH = salt + ':' + scryptSync('test-password', salt, 64).toString('hex');

  const { connectToDatabase, closeDatabase, getCollections } = await import('../server/db.js');
  const { createApp } = await import('../server/app.js');
  const { signCourtCode } = await import('../server/services/qrSign.js');

  await connectToDatabase();
  const app = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(r => app.once('listening', r));
  const port = (app.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  const c = getCollections();
  const now = new Date();

  // Seed 10 Courts
  for (let i = 1; i <= 10; i++) {
    const code = String(i).padStart(2, '0');
    await c.courts.insertOne({
      courtId: `c_${code}`,
      code,
      name: `Sân ${code}`,
      isActive: true,
      sortOrder: i,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  // Seed Products: ample stock vs highly contested stock
  await c.products.insertOne({
    productId: 'water_unlimited',
    name: 'Nước Suối Aquafina',
    volume: '500ml',
    category: 'water',
    priceVnd: 10000,
    costPriceVnd: 5000,
    stock: 500,
    isAvailable: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1
  });

  await c.products.insertOne({
    productId: 'energy_limited',
    name: 'Nước Tăng Lực RedBull (Chỉ còn 10 lon)',
    volume: '250ml',
    category: 'energy',
    priceVnd: 20000,
    costPriceVnd: 12000,
    stock: 10,
    isAvailable: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1
  });

  const api = async (path: string, body?: unknown, sessionToken = '', method = body === undefined ? 'GET' : 'POST') => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sessionToken) headers['x-customer-session'] = sessionToken;
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null)
    };
  };

  const userSessions: Array<{ courtCode: string; token: string }> = [];

  try {
    // ---------------------------------------------------------------------------------
    // TEST 1: 100 người cùng lúc quét mã QR khởi tạo phiên tại 10 sân
    // ---------------------------------------------------------------------------------
    await t.test('100 concurrent QR scans & session initializations across courts', async () => {
      const startTime = performance.now();
      const initPromises = Array.from({ length: 100 }, (_, i) => {
        const courtNum = (i % 10) + 1;
        const courtCode = String(courtNum).padStart(2, '0');
        const sig = signCourtCode(courtCode);
        return api('/api/sessions/init', { courtCode, sig });
      });

      const results = await Promise.all(initPromises);
      const elapsed = performance.now() - startTime;

      console.log(`[Benchmark] 100 concurrent QR session inits finished in ${elapsed.toFixed(1)}ms`);

      assert.ok(results.every(r => r.status === 201), `All 100 session inits must return 201, got failures: ${JSON.stringify(results.filter(r => r.status !== 201))}`);

      const tokens = results.map(r => r.data.sessionToken);
      assert.equal(new Set(tokens).size, 100, 'All 100 session tokens must be unique');

      for (let i = 0; i < 100; i++) {
        userSessions.push({
          courtCode: results[i].data.court.code,
          token: tokens[i]
        });
      }
    });

    // ---------------------------------------------------------------------------------
    // TEST 2: 100 người cùng bấm đặt hàng trong 1 giây qua chung Wi-Fi sân (Cùng IP)
    // ---------------------------------------------------------------------------------
    await t.test('100 concurrent orders from shared Wi-Fi (Same IP, separate sessions)', async () => {
      const startTime = performance.now();

      const orderPromises = userSessions.map((session, index) => {
        return api('/api/orders', {
          clientRequestId: randomUUID(),
          courtCode: session.courtCode,
          customerName: `Khách ${index + 1}`,
          customerPhone: '0901234567',
          items: [{
            productId: 'water_unlimited',
            quantity: 1,
            iceQuantity: 1
          }]
        }, session.token);
      });

      const results = await Promise.all(orderPromises);
      const elapsed = performance.now() - startTime;

      console.log(`[Benchmark] 100 concurrent order placements finished in ${elapsed.toFixed(1)}ms (Avg: ${(elapsed / 100).toFixed(1)}ms/order)`);

      // Không có ai bị 429 Too Many Requests do dùng chung IP Wi-Fi
      const rateLimited = results.filter(r => r.status === 429);
      assert.equal(rateLimited.length, 0, 'No order should be blocked by shared Wi-Fi IP rate limit');

      // Tất cả 100 đơn phải thành công 201
      const failed = results.filter(r => r.status !== 201);
      assert.equal(failed.length, 0, `All 100 orders must succeed with 201, got: ${JSON.stringify(failed)}`);

      // 100 mã orderId và mã hiển thị #TL-YYYYMMDD-XXXX phải phân biệt hoàn toàn
      const orderIds = results.map(r => r.data.id);
      const displayCodes = results.map(r => r.data.displayCode);
      assert.equal(new Set(orderIds).size, 100, 'All 100 order IDs must be unique');
      assert.equal(new Set(displayCodes).size, 100, 'All 100 display codes must be unique');

      // Tồn kho sản phẩm phải giảm chính xác 100 đơn vị (500 -> 400)
      const prod = await c.products.findOne({ productId: 'water_unlimited' });
      assert.equal(prod?.stock, 400, 'Stock must be exactly 400 after 100 single-item orders');

      // Bảng inventoryMovements phải ghi nhận đúng 100 bản ghi
      const movementCount = await c.inventoryMovements.countDocuments({ productId: 'water_unlimited', reason: 'order_created' });
      assert.equal(movementCount, 100, 'Inventory movements must have exactly 100 records');
    });

    // ---------------------------------------------------------------------------------
    // TEST 3: 100 người cùng tranh mua 10 lon nước cuối cùng (Race Condition & Over-selling)
    // ---------------------------------------------------------------------------------
    await t.test('100 concurrent racers for only 10 available items (Strict zero-oversell guarantee)', async () => {
      const startTime = performance.now();

      const racePromises = userSessions.map((session, index) => {
        return api('/api/orders', {
          clientRequestId: randomUUID(),
          courtCode: session.courtCode,
          customerName: `Đua mua ${index + 1}`,
          customerPhone: '0909999999',
          items: [{
            productId: 'energy_limited',
            quantity: 1,
            iceQuantity: 0
          }]
        }, session.token);
      });

      const results = await Promise.all(racePromises);
      const elapsed = performance.now() - startTime;

      console.log(`[Benchmark] 100-user race for 10 items finished in ${elapsed.toFixed(1)}ms`);

      const winners = results.filter(r => r.status === 201);
      const losers = results.filter(r => r.status === 409);

      console.log(`[Race Results] Winners (201): ${winners.length}, Losers (409 Out of Stock): ${losers.length}`);

      assert.equal(winners.length, 10, 'Exactly 10 winners can buy the 10 available cans');
      assert.equal(losers.length, 90, 'Exactly 90 racers must receive 409 OUT_OF_STOCK');

      // Tồn kho cuối cùng PHẢI là đúng 0, KHÔNG BAO GIỜ ÂM
      const prod = await c.products.findOne({ productId: 'energy_limited' });
      assert.equal(prod?.stock, 0, 'Contested stock must be exactly 0, never negative!');

      // Số lượt trừ kho trong thẻ kho đúng bằng 10
      const movementCount = await c.inventoryMovements.countDocuments({ productId: 'energy_limited', reason: 'order_created' });
      assert.equal(movementCount, 10, 'Only exactly 10 inventory deduction movements created');
    });

  } finally {
    app.close();
    await closeDatabase();
    await repl.stop();
  }
});
