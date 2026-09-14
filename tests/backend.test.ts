import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { existsSync } from 'node:fs';
import { dateRange } from '../server/time.js';

test('Vietnam report boundaries',()=>{
  const now=new Date('2026-09-10T18:00:00Z');
  const yesterday=dateRange('yesterday',now);
  assert.equal(yesterday.$gte.toISOString(),'2026-09-09T17:00:00.000Z');
  assert.equal(yesterday.$lt.toISOString(),'2026-09-10T17:00:00.000Z');
  assert.equal(dateRange('7days',now).$gte.toISOString(),'2026-09-04T17:00:00.000Z');
});

test('Real MongoDB replica-set API acceptance suite', {timeout:180000}, async t=>{
  const localBinary='C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe';
  const repl = await MongoMemoryReplSet.create({binary:existsSync(localBinary)?{systemBinary:localBinary,checkMD5:false}:undefined,replSet:{count:1,storageEngine:'wiredTiger'}});
  process.env.MONGO_URI=repl.getUri(); process.env.DB_NAME='tran_luu_test_'+randomBytes(6).toString('hex'); process.env.NODE_ENV='test';
  const salt=randomBytes(16).toString('hex');
  process.env.ADMIN_PASSWORD_HASH=salt+':'+scryptSync('test-password',salt,64).toString('hex');
  const {connectToDatabase,closeDatabase,getCollections,getDb}=await import('../server/db.js');
  const {createApp}=await import('../server/app.js');
  await connectToDatabase();
  const app=createApp().listen(0,'127.0.0.1');
  await new Promise<void>(r=>app.once('listening',r));
  const port=(app.address() as {port:number}).port;
  const base=`http://127.0.0.1:${port}`;
  let adminCookie=''; let customerCookie='';
  const api=async(path:string,body?:unknown,cookie='',method=body===undefined?'GET':'POST',extra:Record<string,string>={})=>{
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
    if (cookie.startsWith('tl_admin=')) {
      headers.cookie = cookie;
    } else if (cookie) {
      headers['x-customer-session'] = cookie;
    }
    const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0] || ''};
  };
  const productId='p1';
  const now=new Date();
  const c=getCollections();
  await c.courts.insertOne({courtId:'c1',code:'05',name:'Test Court',isActive:true,sortOrder:5,deletedAt:null,createdAt:now,updatedAt:now});
  await c.products.insertOne({productId,name:'Test Water',volume:'500ml',category:'water',priceVnd:10000,stock:10,isAvailable:true,deletedAt:null,createdAt:now,updatedAt:now,version:1});
  const orderInput=(requestId=randomUUID(),qty=1)=>({clientRequestId:requestId,courtCode:'05',items:[{productId,quantity:qty,iceQuantity:qty}]});
  try {
    await t.test('admin auth, wrong password, login, CSRF',async()=>{
      assert.equal((await api('/api/admin/products')).status,401);
      assert.equal((await api('/api/admin/auth/login',{username:'admin',password:'wrong'})).status,401);
      const login=await api('/api/admin/auth/login',{username:'admin',password:'test-password'});assert.equal(login.status,200);adminCookie=login.cookie;
      assert.equal((await api('/api/admin/products',undefined,adminCookie)).status,200);
      assert.equal((await api('/api/admin/settings',{isAcceptingOrders:false},adminCookie,'PATCH',{origin:'https://attacker.invalid'})).status,403);
      const { signCourtCode } = await import('../server/services/qrSign.js');
      const sessionInit = await api('/api/sessions/init', { courtCode: '05', sig: signCourtCode('05') });
      assert.equal(sessionInit.status, 201);
      customerCookie = sessionInit.data.sessionToken;
    });
    await t.test('strict input validation and forbidden customer mutations',async()=>{
      for(const qty of [-1,0,1.5,'2']){const body=orderInput();body.items[0].quantity=qty as number;assert.equal((await api('/api/orders',body,customerCookie)).status,400);}
      const duplicate=orderInput();duplicate.items.push({...duplicate.items[0]});assert.equal((await api('/api/orders',duplicate,customerCookie)).status,400);
      assert.equal((await api('/api/orders/any/cancel',{},customerCookie)).status,403);
      assert.equal((await api('/api/orders/any',{},customerCookie,'PATCH')).status,403);
      assert.equal((await c.products.findOne({productId}))!.stock,10);
    });
    let orderId='';
    await t.test('concurrent duplicate request creates one order and one deduction',async()=>{
      const input=orderInput();
      const results=await Promise.all(Array.from({length:6},()=>api('/api/orders',input,customerCookie)));
      assert.ok(results.every(r=>r.status===201),JSON.stringify(results));
      assert.equal(new Set(results.map(r=>r.data.id)).size,1);orderId=results[0].data.id;
      assert.equal(results[0].data.items[0].unitPrice,10000);assert.equal(results[0].data.status,'accepted');
      assert.equal((await c.products.findOne({productId}))!.stock,9);
      const changed={...input,items:[{productId,quantity:2,iceQuantity:1}]};assert.equal((await api('/api/orders',changed,customerCookie)).status,409);
      const { signCourtCode } = await import('../server/services/qrSign.js');
      const otherSession = await api('/api/sessions/init', { courtCode: '05', sig: signCourtCode('05') });
      assert.equal((await api('/api/orders/my', undefined, otherSession.data.sessionToken)).data.length, 0);
    });
    await t.test('concurrent cancel returns stock only once and customer sees terminal state',async()=>{
      const results=await Promise.all(Array.from({length:4},()=>api(`/api/admin/orders/${orderId}/cancel`,{reason:'Test cancellation'},adminCookie)));
      assert.ok(results.every(r=>r.status===200));assert.equal((await c.products.findOne({productId}))!.stock,10);
      assert.equal(await c.inventoryMovements.countDocuments({orderId,reason:'order_cancelled'}),1);
      assert.equal((await api('/api/orders/my',undefined,customerCookie)).data[0].status,'cancelled');
      assert.equal((await api(`/api/admin/orders/${orderId}/transition`,{targetStatus:'preparing'},adminCookie)).status,409);
    });
    await t.test('last bottle race has exactly one winner',async()=>{
      await c.products.updateOne({productId},{$set:{stock:1}});
      const results=await Promise.all([api('/api/orders',orderInput(),customerCookie),api('/api/orders',orderInput(),customerCookie)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal((await c.products.findOne({productId}))!.stock,0);
      orderId=results.find(r=>r.status===201)!.data.id;
    });
    await t.test('delivery finality, today reports and exact totals',async()=>{
      assert.equal((await api(`/api/admin/orders/${orderId}/transition`,{targetStatus:'preparing'},adminCookie)).status,200);
      assert.equal((await api(`/api/admin/orders/${orderId}/transition`,{targetStatus:'delivered'},adminCookie)).status,200);
      assert.equal((await api(`/api/admin/orders/${orderId}/transition`,{targetStatus:'delivered'},adminCookie)).status,200);
      assert.equal((await api(`/api/admin/orders/${orderId}/transition`,{targetStatus:'preparing'},adminCookie)).status,409);
      assert.equal((await api(`/api/admin/orders/${orderId}/cancel`,{reason:'Invalid'},adminCookie)).status,409);
      const report=(await api('/api/admin/reports/summary?timeFilter=today',undefined,adminCookie)).data;
      assert.equal(report.totalRevenueVnd,10000);assert.equal(report.totalOrdersDelivered,1);
      await c.orders.updateOne({orderId},{$set:{deliveredAt:new Date(Date.now()-3*86400000), paymentStatus:'paid'}});
      assert.equal((await api('/api/admin/orders/active',undefined,adminCookie)).data.length,0);
      // Đơn nợ từ các ngày trước vẫn phải xuất hiện ở tab Sổ nợ / Active orders
      await c.orders.updateOne({orderId},{$set:{paymentStatus:'unpaid'}});
      const activeWithDebt = (await api('/api/admin/orders/active',undefined,adminCookie)).data;
      assert.equal(activeWithDebt.length,1);
      assert.equal(activeWithDebt[0].id,orderId);
      await c.orders.updateOne({orderId},{$set:{paymentStatus:'paid'}});
    });
    await t.test('audit write failure rolls back stock and order',async()=>{
      await c.products.updateOne({productId},{$set:{stock:10}});
      const before=await c.orders.countDocuments();
      try {
        await getDb().command({collMod:'inventory_movements',validator:{delta:{$gte:0}},validationLevel:'strict'});
        assert.equal((await api('/api/orders',orderInput(),customerCookie)).status,500);
        assert.equal((await c.products.findOne({productId}))!.stock,10);assert.equal(await c.orders.countDocuments(),before);
      } finally {
        await getDb().command({collMod:'inventory_movements',validator:{}});
      }
    });
    await t.test('closed shop and court prevent new orders; POS shares validation',async()=>{
      assert.equal((await api('/api/admin/settings',{isAcceptingOrders:false},adminCookie,'PATCH')).status,200);
      assert.equal((await api('/api/orders',orderInput(),customerCookie)).status,409);
      await api('/api/admin/settings',{isAcceptingOrders:true},adminCookie,'PATCH');
      await api('/api/admin/courts/c1',{isActive:false},adminCookie,'PATCH');
      assert.equal((await api('/api/orders',orderInput(),customerCookie)).status,404);
      await api('/api/admin/courts/c1',{isActive:true},adminCookie,'PATCH');
      assert.equal((await api('/api/admin/orders/create-for-court',orderInput(),adminCookie)).status,201);
      assert.equal((await api('/api/admin/courts/c1',undefined,adminCookie,'DELETE')).status,409);
    });
    await t.test('stock intake retries, optimistic absolute stock and inventory history',async()=>{
      const before=(await c.products.findOne({productId}))!.stock;
      const body={clientRequestId:randomUUID(),delta:5,reason:'stock_intake'};
      const results=await Promise.all([api('/api/admin/products/p1/stock',body,adminCookie),api('/api/admin/products/p1/stock',body,adminCookie)]);
      assert.ok(results.every(r=>r.status===200));assert.equal((await c.products.findOne({productId}))!.stock,before+5);
      assert.equal((await api('/api/admin/products/p1/stock',{clientRequestId:randomUUID(),setAbsoluteStock:10,expectedStock:before},adminCookie)).status,409);
      assert.ok((await api('/api/admin/products/p1/movements',undefined,adminCookie)).data.length>0);
      assert.equal((await api('/api/admin/products/p1',{priceVnd:-10},adminCookie,'PATCH')).status,400);
    });
    await t.test('history cursor returns all orders beyond first page',async()=>{
      let seed=await c.orders.findOne({orderId});
      if (!seed) seed = await c.orders.findOne();
      await c.orders.insertMany(Array.from({length:205},(_,i)=>({...seed!,_id:undefined,orderId:`history-${i}`,displayCode:`history-${i}`,clientRequestId:`history-${i}`})));
      const seen=new Set<string>();let cursor:string|null=null;
      do {const r=await api('/api/admin/reports/history?limit=100'+(cursor?'&cursor='+cursor:''),undefined,adminCookie);assert.equal(r.status,200);for(const order of r.data.orders){assert.ok(!seen.has(order.id));seen.add(order.id)}cursor=r.data.nextCursor;}while(cursor);
      assert.equal(seen.size,await c.orders.countDocuments());
    });
    await t.test('customer info, QR tamper resistance, payment status and profit tracking', async () => {
      const { signCourtCode } = await import('../server/services/qrSign.js');
      await c.products.updateOne({ productId }, { $set: { costPriceVnd: 6000, stock: 5 } });

      // Invalid signature rejected with 403 at session init
      const badSession = await api('/api/sessions/init', { courtCode: '05', sig: 'deadbeef1234' });
      assert.equal(badSession.status, 403);
      assert.equal(badSession.data.code, 'INVALID_QR_SIGNATURE');

      // Valid order accepted with customer info (frontend payload without sig)
      const goodOrder = { ...orderInput(), customerName: 'Anh Tuấn', customerPhone: '0987654321' };
      const created = await api('/api/orders', goodOrder, customerCookie);
      assert.equal(created.status, 201);
      assert.equal(created.data.customerName, 'Anh Tuấn');
      assert.equal(created.data.customerPhone, '0987654321');
      assert.equal(created.data.paymentStatus, 'unpaid');
      // Khách hàng tuyệt đối không được đọc costPrice (P2)
      assert.equal(created.data.items[0].costPrice, undefined, 'Customer must NOT see costPrice');

      // Admin đọc được costPrice để theo dõi lợi nhuận
      const adminOrdersRes = await api('/api/admin/orders/active', undefined, adminCookie);
      const matchedAdminOrder = adminOrdersRes.data.find((o: any) => o.id === created.data.id);
      assert.ok(matchedAdminOrder, 'Admin must find the created order');
      assert.equal(matchedAdminOrder.items[0].costPrice, 6000, 'Admin can see costPrice for profit tracking');

      // Update payment status to paid via admin endpoint
      const updatePayment = await api(`/api/admin/orders/${created.data.id}/payment`, { paymentStatus: 'paid' }, adminCookie);
      assert.equal(updatePayment.status, 200);
      assert.equal(updatePayment.data.paymentStatus, 'paid');

      // Check payment status reflects unpaid toggle back
      const updateUnpaid = await api(`/api/admin/orders/${created.data.id}/payment`, { paymentStatus: 'unpaid' }, adminCookie);
      assert.equal(updateUnpaid.status, 200);
      assert.equal(updateUnpaid.data.paymentStatus, 'unpaid');
    });
    await t.test('stock intake with cost price and intake history reporting', async () => {
      const intakeReq = {
        clientRequestId: 'intake-test-01',
        delta: 24,
        reason: 'stock_intake',
        costPriceVnd: 7500,
        sellingPriceVnd: 15000,
        note: 'Nhập hàng kiểm thử'
      };
      const stockRes = await api(`/api/admin/products/${productId}/stock`, intakeReq, adminCookie);
      assert.equal(stockRes.status, 200);

      const historyRes = await api('/api/admin/inventory/intake-history?limit=10', undefined, adminCookie);
      assert.equal(historyRes.status, 200);
      assert.ok(historyRes.data.items.length > 0);
      const latest = historyRes.data.items[0];
      assert.equal(latest.costPriceVnd, 7500);
      assert.equal(latest.sellingPriceVnd, 15000);
      assert.equal(latest.quantity, 24);
      assert.equal(latest.totalCostVnd, 7500 * 24);
      assert.equal(latest.expectedRevenueVnd, 15000 * 24);
      assert.equal(latest.profitMarginVnd, 7500 * 24);
      assert.ok(historyRes.data.summary.totalCostValueVnd > 0);
    });
    await t.test('POS order at counter: instant delivery, paid, direct inventory reduction without sig', async () => {
      await c.products.updateOne({ productId }, { $set: { stock: 15 } });
      const posReq = {
        clientRequestId: 'pos-test-req-01',
        items: [{ productId, quantity: 2, iceQuantity: 1 }]
      };
      const posRes = await api('/api/admin/orders/create-pos', posReq, adminCookie);
      assert.equal(posRes.status, 201);
      assert.equal(posRes.data.status, 'delivered');
      assert.equal(posRes.data.paymentStatus, 'paid');
      assert.equal(posRes.data.courtName, 'Tại quầy');
      assert.equal((await c.products.findOne({ productId }))!.stock, 13);

      // Idempotency check: sending same clientRequestId returns same order
      const dupRes = await api('/api/admin/orders/create-pos', posReq, adminCookie);
      assert.equal(dupRes.status, 200);
      assert.equal(dupRes.data.id, posRes.data.id);
      assert.equal((await c.products.findOne({ productId }))!.stock, 13);
    });
    await t.test('POS concurrency, unique date sequences, and request conflict detection', async () => {
      // 1. Request conflict: same clientRequestId with different items returns 409
      const baseReqId = randomUUID();
      const firstPos = await api('/api/admin/orders/create-pos', {
        clientRequestId: baseReqId,
        items: [{ productId, quantity: 1, iceQuantity: 1 }]
      }, adminCookie);
      assert.equal(firstPos.status, 201);
      assert.ok(firstPos.data.displayCode.startsWith('#TL-POS-'));

      const conflictPos = await api('/api/admin/orders/create-pos', {
        clientRequestId: baseReqId,
        items: [{ productId, quantity: 2, iceQuantity: 0 }]
      }, adminCookie);
      assert.equal(conflictPos.status, 409);

      // 2. Concurrency: 5 simultaneous POS orders create 5 unique displayCodes
      const concurrentResults = await Promise.all(
        Array.from({ length: 5 }, () => api('/api/admin/orders/create-pos', {
          clientRequestId: randomUUID(),
          items: [{ productId, quantity: 1, iceQuantity: 0 }]
        }, adminCookie))
      );
      assert.ok(concurrentResults.every(r => r.status === 201));
      const codes = concurrentResults.map(r => r.data.displayCode);
      assert.equal(new Set(codes).size, 5);
      for (const code of codes) {
        assert.ok(/^#TL-POS-\d{8}-\d{3,}$/.test(code), `Code ${code} should match format #TL-POS-YYYYMMDD-NNN`);
      }
    });

    await t.test('Safe purge protects active orders and delivered unpaid debt', async () => {
      const pastDate = new Date(Date.now() - 40 * 86400000);
      // Order 1: Active order 40 days ago
      await c.orders.insertOne({
        orderId: 'old-active',
        displayCode: 'OLD-01',
        clientRequestId: randomUUID(),
        courtId: 'c1',
        courtNameSnapshot: 'Test Court',
        customerSessionHash: 'test',
        status: 'preparing',
        totalVnd: 20000,
        version: 1,
        items: [],
        createdAt: pastDate,
        updatedAt: pastDate,
        editableUntil: pastDate
      });
      // Order 2: Delivered UNPAID debt 40 days ago
      await c.orders.insertOne({
        orderId: 'old-unpaid-debt',
        displayCode: 'DEBT-01',
        clientRequestId: randomUUID(),
        courtId: 'c1',
        courtNameSnapshot: 'Test Court',
        customerSessionHash: 'test',
        status: 'delivered',
        paymentStatus: 'unpaid',
        totalVnd: 50000,
        version: 1,
        items: [],
        createdAt: pastDate,
        updatedAt: pastDate,
        editableUntil: pastDate,
        deliveredAt: pastDate
      });
      // Order 3: Delivered PAID order 40 days ago (eligible for purge)
      await c.orders.insertOne({
        orderId: 'old-delivered-paid',
        displayCode: 'PAID-01',
        clientRequestId: randomUUID(),
        courtId: 'c1',
        courtNameSnapshot: 'Test Court',
        customerSessionHash: 'test',
        status: 'delivered',
        paymentStatus: 'paid',
        totalVnd: 30000,
        version: 1,
        items: [],
        createdAt: pastDate,
        updatedAt: pastDate,
        editableUntil: pastDate,
        deliveredAt: pastDate,
        paidAt: pastDate
      });

      // Preview check: only eligible orders counted, activePreserved counted
      const previewRes = await api('/api/admin/clean/preview?days=30', undefined, adminCookie);
      assert.equal(previewRes.status, 200);
      assert.ok(previewRes.data.activeOrdersPreserved >= 2);

      // Purge execution
      const purgeRes = await api('/api/admin/clean/purge', { days: '30', includeOrders: true, includeInventory: false, includeAuditLogs: false }, adminCookie);
      assert.equal(purgeRes.status, 200);

      // Verify old-active still exists
      assert.ok(await c.orders.findOne({ orderId: 'old-active' }));
      // Verify old-unpaid-debt still exists (DEBT NEVER PURGED)
      assert.ok(await c.orders.findOne({ orderId: 'old-unpaid-debt' }));
      // Verify old-delivered-paid was safely purged
      assert.equal(await c.orders.findOne({ orderId: 'old-delivered-paid' }), null);
    });

    await t.test('Backup export includes sequences and import preserves active product stock', async () => {
      const currentProd = await c.products.findOne({ productId });
      assert.ok(currentProd);
      const activeStock = currentProd.stock;

      // 1. Export backup
      const backupRes = await api('/api/admin/backup/full', undefined, adminCookie);
      assert.equal(backupRes.status, 200);
      assert.equal(backupRes.data.schemaVersion, '2.0.0');
      assert.ok(Array.isArray(backupRes.data.orderSequences));

      // 2. Import catalog with different stock in payload
      const importPayload = {
        products: [
          {
            productId,
            name: 'Renamed Product Test',
            volume: '500ml',
            category: 'water',
            costPriceVnd: 8500,
            priceVnd: 18000,
            stock: 999
          }
        ],
        orderSequences: [
          { key: 'order_sequence:pos:0101', value: 50 }
        ]
      };

      const importRes = await api('/api/admin/catalog/import', importPayload, adminCookie);
      assert.equal(importRes.status, 200);
      assert.ok(importRes.data.ok);

      // Verify product price/name updated but live stock preserved!
      const afterImportProd = await c.products.findOne({ productId });
      assert.equal(afterImportProd!.name, 'Renamed Product Test');
      assert.equal(afterImportProd!.priceVnd, 18000);
      assert.equal(afterImportProd!.costPriceVnd, 8500);
      assert.equal(afterImportProd!.stock, activeStock);

      // Verify sequence stored with $max
      const seqDoc = await c.appSettings.findOne({ key: 'order_sequence:pos:0101' });
      const seqValue = typeof seqDoc?.value === 'object' ? seqDoc?.value?.sequence : seqDoc?.value;
      assert.equal(seqValue, 50);
    });

    await t.test('Courts endpoint generates authentic HMAC signature for all courts', async () => {
      const { verifyCourtSignature } = await import('../server/services/qrSign.js');
      const courtsRes = await api('/api/admin/courts', undefined, adminCookie);
      assert.equal(courtsRes.status, 200);
      assert.ok(Array.isArray(courtsRes.data));
      assert.ok(courtsRes.data.length > 0);
      for (const court of courtsRes.data) {
        assert.ok(court.sig, `Court ${court.code} must have sig`);
        assert.ok(verifyCourtSignature(court.code, court.sig), `Signature ${court.sig} must be valid for court ${court.code}`);
      }
    });

    await t.test('Customer session isolation, privacy, court binding, idempotency, termination and atomic deliver-and-pay', async () => {
      const { signCourtCode } = await import('../server/services/qrSign.js');

      // Reset stock & court accepting orders to ensure clean state
      await c.products.updateOne({ productId }, { $set: { stock: 50, isAvailable: true } });
      await c.courts.updateOne({ code: '05' }, { $set: { isActive: true } });
      await api('/api/admin/settings', { isAcceptingOrders: true }, adminCookie, 'PATCH');

      // 1. Khách A và Khách B cùng quét mã QR Sân 05 nhận 2 token độc lập
      const sig05 = signCourtCode('05');
      const sessionA = await api('/api/sessions/init', { courtCode: '05', sig: sig05 });
      const sessionB = await api('/api/sessions/init', { courtCode: '05', sig: sig05 });
      assert.equal(sessionA.status, 201);
      assert.equal(sessionB.status, 201);
      assert.notEqual(sessionA.data.sessionToken, sessionB.data.sessionToken);

      // 2. Khách A đặt đơn tại Sân 05 (frontend payload không cần sig)
      const reqIdA = randomUUID();
      const orderA = await api('/api/orders', {
        courtCode: '05',
        clientRequestId: reqIdA,
        customerName: 'Khách VIP A',
        customerPhone: '0901234567',
        items: [{ productId, quantity: 1, iceQuantity: 1 }]
      }, '', 'POST', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(orderA.status, 201);
      assert.equal(orderA.data.customerName, 'Khách VIP A');

      // 3. Khách B kiểm tra đơn của mình -> HOÀN TOÀN TRỐNG, KHÔNG THẤY ĐƠN HOẶC THÔNG TIN CỦA A
      const ordersB = await api('/api/orders/my', undefined, '', 'GET', { 'x-customer-session': sessionB.data.sessionToken });
      assert.equal(ordersB.status, 200);
      assert.equal(ordersB.data.length, 0);

      // 4. Khách A reload/reconnect -> thấy đúng đơn của chính mình
      const ordersA = await api('/api/orders/my', undefined, '', 'GET', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(ordersA.status, 200);
      assert.equal(ordersA.data.length, 1);
      assert.equal(ordersA.data[0].id, orderA.data.id);
      assert.equal(ordersA.data[0].customerName, 'Khách VIP A');

      // 5. Khách A retry với cùng clientRequestId -> IDEMPOTENT (trả về đúng đơn cũ, không tạo đơn mới, không trừ kho)
      const stockBefore = (await c.products.findOne({ productId }))!.stock;
      const retryA = await api('/api/orders', {
        courtCode: '05',
        clientRequestId: reqIdA,
        customerName: 'Khách VIP A',
        items: [{ productId, quantity: 1, iceQuantity: 1 }]
      }, '', 'POST', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(retryA.status, 201);
      assert.equal(retryA.data.id, orderA.data.id);
      const stockAfter = (await c.products.findOne({ productId }))!.stock;
      assert.equal(stockAfter, stockBefore);

      // 6. Gửi cùng clientRequestId nhưng thay đổi giỏ hàng -> 409 REQUEST_CONFLICT
      const conflictA = await api('/api/orders', {
        courtCode: '05',
        clientRequestId: reqIdA,
        customerName: 'Khách VIP A',
        items: [{ productId, quantity: 2, iceQuantity: 2 }]
      }, '', 'POST', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(conflictA.status, 409);

      // 7. Ràng buộc sân: Dùng phiên Sân 05 nhưng đặt đơn cho Sân 08 -> 403 COURT_MISMATCH
      await c.courts.updateOne({ code: '08' }, { $setOnInsert: { courtId: 'c8', code: '08', name: 'Sân 08', isActive: true, sortOrder: 8, createdAt: new Date(), updatedAt: new Date(), deletedAt: null } }, { upsert: true });
      const mismatch = await api('/api/orders', {
        courtCode: '08',
        clientRequestId: randomUUID(),
        items: [{ productId, quantity: 1, iceQuantity: 0 }]
      }, '', 'POST', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(mismatch.status, 403);
      assert.equal(mismatch.data.code, 'COURT_MISMATCH');

      // 8. Kết thúc phiên khách hàng (/api/sessions/terminate)
      const term = await api('/api/sessions/terminate', {}, '', 'POST', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(term.status, 200);

      // Sau khi terminate, truy vấn phiên trả về 401 SESSION_EXPIRED
      const currA = await api('/api/sessions/current', undefined, '', 'GET', { 'x-customer-session': sessionA.data.sessionToken });
      assert.equal(currA.status, 401);

      // BẢO TOÀN DỮ LIỆU: Đơn hàng của A và công nợ trên quầy VẪN TỒN TẠI NGUYÊN VẸN 100%
      const adminOrders = await api('/api/admin/orders/active', undefined, adminCookie);
      assert.ok(adminOrders.data.some((o: any) => o.id === orderA.data.id));

      // 9. Thao tác giao hàng kèm thu tiền nguyên tử (deliver-and-pay) trong 1 transaction
      const deliverAndPay = await api(`/api/admin/orders/${orderA.data.id}/deliver-and-pay`, { paymentStatus: 'paid' }, adminCookie);
      assert.equal(deliverAndPay.status, 200);
      assert.equal(deliverAndPay.data.status, 'delivered');
      assert.equal(deliverAndPay.data.paymentStatus, 'paid');
    });

    await t.test('logout revokes session',async()=>{
      assert.equal((await api('/api/admin/auth/logout',{},adminCookie)).status,200);
      assert.equal((await api('/api/admin/products',undefined,adminCookie)).status,401);
    });
  } finally { await new Promise<void>(r=>app.close(()=>r())); await closeDatabase(); await repl.stop(); }
});
