import { MongoClient, Db, Collection } from 'mongodb';
import { CourtDoc, ProductDoc, OrderDoc, InventoryMovementDoc, AppSettingDoc } from './types';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
export const DB_NAME = 'tran_luu_order'; // STRICTLY ISOLATED DATABASE

let client: MongoClient | null = null;
let db: Db | null = null;
let isReplicaSet: boolean = false;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db; isReplicaSet: boolean }> {
  if (client && db) {
    return { client, db, isReplicaSet };
  }

  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);

  // Check topology
  try {
    const adminDb = client.db('admin');
    const hello = await adminDb.command({ hello: 1 });
    isReplicaSet = !!hello.setName;
    console.log(`[MongoDB] Connected to ${DB_NAME} at ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}`);
    console.log(`[MongoDB] Topology: ${isReplicaSet ? `Replica Set (${hello.setName})` : 'Standalone (using atomic updates + compensating rollback)'}`);
  } catch (e) {
    console.warn('[MongoDB] Could not query topology, assuming standalone:', e);
    isReplicaSet = false;
  }

  // Ensure indexes
  await ensureIndexes(db);

  return { client, db, isReplicaSet };
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error('MongoClient not connected. Call connectToDatabase() first.');
  }
  return client;
}

export function isReplicaSetTopology(): boolean {
  return isReplicaSet;
}

export function getCollections(targetDb?: Db) {
  const database = targetDb || getDb();
  return {
    courts: database.collection<CourtDoc>('courts'),
    products: database.collection<ProductDoc>('products'),
    orders: database.collection<OrderDoc>('orders'),
    inventoryMovements: database.collection<InventoryMovementDoc>('inventory_movements'),
    appSettings: database.collection<AppSettingDoc>('app_settings')
  };
}

async function ensureIndexes(database: Db): Promise<void> {
  const colls = getCollections(database);

  // Courts indexes
  await colls.courts.createIndex({ code: 1 }, { unique: true });
  await colls.courts.createIndex({ courtId: 1 }, { unique: true });
  await colls.courts.createIndex({ isActive: 1, sortOrder: 1 });

  // Products indexes
  await colls.products.createIndex({ productId: 1 }, { unique: true });
  await colls.products.createIndex({ isAvailable: 1, stock: 1 });
  await colls.products.createIndex({ category: 1 });

  // Orders indexes
  await colls.orders.createIndex({ orderId: 1 }, { unique: true });
  await colls.orders.createIndex({ displayCode: 1 }, { unique: true });
  await colls.orders.createIndex({ customerSessionHash: 1, clientRequestId: 1 }, { unique: true });
  await colls.orders.createIndex({ customerSessionHash: 1, createdAt: -1 });
  await colls.orders.createIndex({ status: 1, createdAt: 1 });
  await colls.orders.createIndex({ courtId: 1, status: 1 });
  await colls.orders.createIndex({ deliveredAt: 1 });

  // Movements indexes
  await colls.inventoryMovements.createIndex({ operationId: 1 }, { unique: true });
  await colls.inventoryMovements.createIndex({ productId: 1, createdAt: -1 });

  // Settings index
  await colls.appSettings.createIndex({ key: 1 }, { unique: true });

  console.log('[MongoDB] All collections & indexes ensured for database:', DB_NAME);
}
