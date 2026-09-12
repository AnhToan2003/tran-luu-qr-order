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
    const response=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0] || ''};
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
      customerCookie=(await api('/api/orders/my')).cookie;
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
      assert.equal((await api('/api/orders/my')).data.length,0);
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
      await c.orders.updateOne({orderId},{$set:{deliveredAt:new Date(Date.now()-3*86400000)}});
      assert.equal((await api('/api/admin/orders/active',undefined,adminCookie)).data.length,0);
    });
    await t.test('audit write failure rolls back stock and order',async()=>{
      await c.products.updateOne({productId},{$set:{stock:10}});
      const before=await c.orders.countDocuments();
      await getDb().command({collMod:'inventory_movements',validator:{delta:{$gte:0}},validationLevel:'strict'});
      assert.equal((await api('/api/orders',orderInput(),customerCookie)).status,500);
      assert.equal((await c.products.findOne({productId}))!.stock,10);assert.equal(await c.orders.countDocuments(),before);
      await getDb().command({collMod:'inventory_movements',validator:{}});
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
      const seed=await c.orders.findOne({orderId});
      await c.orders.insertMany(Array.from({length:205},(_,i)=>({...seed!,_id:undefined,orderId:`history-${i}`,displayCode:`history-${i}`,clientRequestId:`history-${i}`})));
      const seen=new Set<string>();let cursor:string|null=null;
      do {const r=await api('/api/admin/reports/history?limit=100'+(cursor?'&cursor='+cursor:''),undefined,adminCookie);assert.equal(r.status,200);for(const order of r.data.orders){assert.ok(!seen.has(order.id));seen.add(order.id)}cursor=r.data.nextCursor;}while(cursor);
      assert.equal(seen.size,await c.orders.countDocuments());
    });
    await t.test('logout revokes session',async()=>{
      assert.equal((await api('/api/admin/auth/logout',{},adminCookie)).status,200);
      assert.equal((await api('/api/admin/products',undefined,adminCookie)).status,401);
    });
  } finally { await new Promise<void>(r=>app.close(()=>r())); await closeDatabase(); await repl.stop(); }
});
