/**
 * Integration Test: Transaction Rollback & Stock Integrity (Issue #1)
 *
 * Uses mongodb-memory-server in Replica Set mode to test ACID transactions.
 * Verifies that failed multi-item orders do NOT partially reduce stock.
 *
 * Run: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';

let replSet: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  // Start in-memory Replica Set (required for ACID transactions)
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ storageEngine: 'wiredTiger' }]
  });
  const uri = replSet.getUri();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test_transaction');
}, 60_000);

afterAll(async () => {
  await client?.close();
  await replSet?.stop();
}, 30_000);

beforeEach(async () => {
  // Clean collections before each test
  await db.collection('products').deleteMany({});
  await db.collection('inventory_movements').deleteMany({});
  await db.collection('orders').deleteMany({});
});

// Helper: Create a test product
async function createProduct(productId: string, stock: number, name = 'Test Product') {
  await db.collection('products').insertOne({
    productId,
    name,
    priceVnd: 10000,
    stock,
    version: 1,
    isAvailable: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

// Simulate the transaction logic from orderService
async function simulateOrderTransaction(
  items: Array<{ productId: string; quantity: number }>
): Promise<{ success: boolean; error?: string }> {
  const session = client.startSession();
  try {
    let success = false;
    await session.withTransaction(async () => {
      for (const item of items) {
        // Simulate stock check and decrement
        const product = await db.collection('products').findOne(
          { productId: item.productId, deletedAt: null },
          { session }
        );

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.productId}: have ${product.stock}, need ${item.quantity}`);
        }

        // Decrement stock
        await db.collection('products').updateOne(
          { productId: item.productId, version: product.version },
          {
            $inc: { stock: -item.quantity, version: 1 },
            $set: { updatedAt: new Date() }
          },
          { session }
        );

        // Record movement
        await db.collection('inventory_movements').insertOne({
          productId: item.productId,
          delta: -item.quantity,
          reason: 'order_created',
          orderId: 'test-order-id',
          operationId: `op-${Date.now()}-${item.productId}`,
          stockAfter: product.stock - item.quantity,
          createdAt: new Date()
        }, { session });
      }
      success = true;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
    return { success };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    await session.endSession();
  }
}

// =============================================================================
// P0 Issue #1: Multi-Item Transaction Rollback Tests
// =============================================================================

describe('P0 Issue #1: Multi-item Order Rollback (Drink Orders)', () => {
  it('REGRESSION: failed order on 2nd item does NOT reduce stock of 1st item', async () => {
    // Setup: Product A has stock=21, Product B does NOT exist
    await createProduct('product-a', 21, 'Coca Cola');
    // product-b intentionally NOT created

    const stockBefore = await db.collection('products').findOne({ productId: 'product-a' });
    expect(stockBefore?.stock).toBe(21);

    // Attempt order with product-a (valid) + product-b (invalid)
    const result = await simulateOrderTransaction([
      { productId: 'product-a', quantity: 1 },
      { productId: 'product-b', quantity: 1 }  // This will fail
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Product not found: product-b');

    // CRITICAL ASSERTION: stock of product-a must NOT have changed
    const stockAfter = await db.collection('products').findOne({ productId: 'product-a' });
    expect(stockAfter?.stock).toBe(21);  // Must still be 21, not 20

    // CRITICAL ASSERTION: no orphan movements should exist
    const movements = await db.collection('inventory_movements').find({}).toArray();
    expect(movements).toHaveLength(0);  // Transaction rolled back
  });

  it('successful 2-item order reduces stock of BOTH items atomically', async () => {
    await createProduct('product-c', 10, 'Pepsi');
    await createProduct('product-d', 5, 'Sprite');

    const result = await simulateOrderTransaction([
      { productId: 'product-c', quantity: 2 },
      { productId: 'product-d', quantity: 1 }
    ]);

    expect(result.success).toBe(true);

    const productC = await db.collection('products').findOne({ productId: 'product-c' });
    const productD = await db.collection('products').findOne({ productId: 'product-d' });

    expect(productC?.stock).toBe(8);   // 10 - 2
    expect(productD?.stock).toBe(4);   // 5 - 1

    const movements = await db.collection('inventory_movements').find({}).toArray();
    expect(movements).toHaveLength(2);  // Both movements recorded
  });

  it('REGRESSION: order with insufficient stock is fully rolled back', async () => {
    await createProduct('product-e', 3, 'Water');
    await createProduct('product-f', 10, 'Tea');

    // Try to order 5 of product-e (only 3 in stock) + 1 of product-f
    const result = await simulateOrderTransaction([
      { productId: 'product-e', quantity: 5 },  // Will fail: only 3 in stock
      { productId: 'product-f', quantity: 1 }
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient stock');

    // Both stocks must be unchanged
    const productE = await db.collection('products').findOne({ productId: 'product-e' });
    const productF = await db.collection('products').findOne({ productId: 'product-f' });
    expect(productE?.stock).toBe(3);
    expect(productF?.stock).toBe(10);

    // No movements
    const movements = await db.collection('inventory_movements').find({}).toArray();
    expect(movements).toHaveLength(0);
  });
});

describe('P0 Issue #1: Concurrent Order - No Oversell', () => {
  it('concurrent orders for same product do not oversell', async () => {
    await createProduct('limited-product', 5, 'Limited Edition');

    // Launch 10 concurrent orders, each requesting 1 unit
    // Only 5 should succeed
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      productId: 'limited-product',
      quantity: 1
    }));

    const results = await Promise.allSettled(
      attempts.map(item => simulateOrderTransaction([item]))
    );

    const successes = results.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;

    const finalProduct = await db.collection('products').findOne({ productId: 'limited-product' });

    // Stock must not go negative
    expect(finalProduct?.stock).toBeGreaterThanOrEqual(0);
    // Success count must not exceed initial stock
    expect(successes).toBeLessThanOrEqual(5);
  });
});
