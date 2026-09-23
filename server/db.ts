import 'dotenv/config';
import { MongoClient, type Db, type ClientSession } from 'mongodb';
import type { CourtDoc, ProductDoc, OrderDoc, InventoryMovementDoc, AppSettingDoc, AuditLogDoc, CustomerSessionDoc, SportsItemDoc, SportsMovementDoc, RoleDoc, AdminUserDoc } from './types.js';
export const DB_NAME = process.env.DB_NAME || 'tran_luu_qr_order';
let client: MongoClient;
let db: Db;
let isReplicaSet = false;
export async function connectToDatabase() {
  if (db) return { client, db };
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (process.env.NODE_ENV === 'production' && !mongoUri) {
    throw new Error('[Security] MONGO_URI must be explicitly configured in production.');
  }
  client = new MongoClient(mongoUri || 'mongodb://localhost:27017', {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 200,
    minPoolSize: 10,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 10000
  });
  await client.connect();
  const hello = await client.db('admin').command({ hello: 1 });
  isReplicaSet = !!hello.setName || hello.msg === 'isdbgrid';
  if (!isReplicaSet) {
    if (process.env.NODE_ENV === 'production') {
      await client.close();
      throw new Error(
        '\n===================================================================\n' +
        '[MongoDB Configuration Error]\n' +
        'MongoDB replica set is REQUIRED for multi-document ACID transactions in production mode.\n' +
        'ALLOW_STANDALONE=true không được phép dùng để vượt qua kiểm tra production.\n' +
        'Để khởi tạo Replica Set chuẩn:\n' +
        '  Khởi tạo Replica Set bằng lệnh: `npm run mongo:replica`\n' +
        '  hoặc mở mongosh chạy: `rs.initiate()`\n' +
        '===================================================================\n'
      );
    }
    console.log('[MongoDB] Running on Standalone MongoDB (ALLOW_STANDALONE=true or dev mode).');
  }
  db = client.db(DB_NAME);
  const c = getCollections();
  await Promise.all([
    c.courts.createIndex({ code: 1 }, { unique: true }), c.courts.createIndex({ courtId: 1 }, { unique: true }),
    c.products.createIndex({ productId: 1 }, { unique: true }), c.products.createIndex({ isAvailable: 1, stock: 1 }),
    c.products.createIndex({ isAvailable: 1, deletedAt: 1, stock: 1 }),
    c.orders.createIndex({ orderId: 1 }, { unique: true }), c.orders.createIndex({ displayCode: 1 }, { unique: true }),
    c.orders.createIndex({ customerSessionHash: 1, clientRequestId: 1 }, { unique: true }),
    c.orders.createIndex({ customerSessionHash: 1, createdAt: -1 }), c.orders.createIndex({ status: 1, createdAt: 1 }),
    c.orders.createIndex({ courtId: 1, status: 1 }), c.orders.createIndex({ status: 1, deliveredAt: 1 }),
    c.orders.createIndex({ status: 1, paymentStatus: 1, deliveredAt: -1 }),
    c.orders.createIndex({ deliveredAt: 1 }),
    c.inventoryMovements.createIndex({ operationId: 1 }, { unique: true }), c.inventoryMovements.createIndex({ productId: 1, createdAt: -1 }),
    c.sportsItems.createIndex({ itemId: 1 }, { unique: true }),
    c.sportsItems.createIndex({ category: 1, isAvailable: 1, deletedAt: 1 }),
    c.sportsItems.createIndex({ isService: 1, deletedAt: 1 }),
    c.sportsMovements.createIndex({ operationId: 1 }, { unique: true }),
    c.sportsMovements.createIndex({ itemId: 1, createdAt: -1 }),
    c.appSettings.createIndex({ key: 1 }, { unique: true }),
    db.collection('admin_sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('admin_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.customerSessions.createIndex({ sessionTokenHash: 1 }, { unique: true }),
    c.customerSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.customerSessions.createIndex({ courtCode: 1, createdAt: -1 }),
    c.auditLogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }),
    c.auditLogs.createIndex({ action: 1, createdAt: -1 }),
    c.auditLogs.createIndex({ adminUsername: 1, createdAt: -1 }),
    c.roles.createIndex({ roleId: 1 }, { unique: true }),
    c.adminUsers.createIndex({ userId: 1 }, { unique: true }),
    c.adminUsers.createIndex({ username: 1 }, { unique: true }),
    // system_errors: TTL 30 days, redacted sensitive data
    db.collection('system_errors').createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 86400 }),
    db.collection('system_errors').createIndex({ statusCode: 1, timestamp: -1 }),
    // action_proofs: short-lived one-time tokens for sensitive ops, TTL 10 minutes
    db.collection('action_proofs').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('action_proofs').createIndex({ proofId: 1 }, { unique: true }),
    db.collection('action_proofs').createIndex({ userId: 1, action: 1 })

  ]);
  await c.appSettings.updateOne({ key: 'system_config' }, { $setOnInsert: { key: 'system_config', value: { isAcceptingOrders: true }, updatedAt: new Date() } }, { upsert: true });
  await migrateLegacyBatches(db);
  return { client, db };
}

async function migrateLegacyBatches(database: Db) {
  try {
    const movementsCol = database.collection('inventory_movements');
    const legacyMovements = await movementsCol.find({
      $or: [
        { batchId: { $in: [null, undefined] } },
        { batchId: { $regex: '^batch-[0-9]+-[a-zA-Z0-9]{4,8}-' } }
      ]
    }).toArray();

    if (legacyMovements.length > 0) {
      const bulkOps = [];
      for (const m of legacyMovements) {
        let extractedBatch = '';
        const idToMatch = ((m.batchId || m.operationId) as string) || '';
        const opMatch = idToMatch.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
        if (opMatch) {
          extractedBatch = opMatch[1];
        } else {
          const noteMatch = ((m.note as string) || '').match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
          if (noteMatch) extractedBatch = noteMatch[1];
        }
        if (extractedBatch) {
          bulkOps.push({
            updateOne: {
              filter: { _id: m._id },
              update: { $set: { batchId: extractedBatch } }
            }
          });
        }
      }
      if (bulkOps.length > 0) {
        await movementsCol.bulkWrite(bulkOps);
      }
    }

    const sportsCol = database.collection('sports_movements');
    const legacySports = await sportsCol.find({
      $or: [
        { batchId: { $in: [null, undefined] } },
        { batchId: { $regex: '^(?:spbatch|batch)-[0-9]+-[a-f0-9]{6}-' } }
      ]
    }).toArray();

    if (legacySports.length > 0) {
      const bulkOps = [];
      for (const m of legacySports) {
        let extractedBatch = '';
        const idToMatch = ((m.batchId || m.operationId) as string) || '';
        const opMatch = idToMatch.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
        if (opMatch) {
          extractedBatch = opMatch[1];
        } else {
          const noteMatch = ((m.note as string) || '').match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
          if (noteMatch) extractedBatch = noteMatch[1];
        }
        if (extractedBatch) {
          bulkOps.push({
            updateOne: {
              filter: { _id: m._id },
              update: { $set: { batchId: extractedBatch } }
            }
          });
        }
      }
      if (bulkOps.length > 0) {
        await sportsCol.bulkWrite(bulkOps);
      }
    }
  } catch (err) {
    console.warn('[Migration Warning] Không thể chuẩn hóa batchId lịch sử:', err);
  }
}
export const getDb = () => db;
export const closeDatabase = async () => { await client?.close(); db = undefined as unknown as Db; };
export const getCollections = () => ({
  courts: db.collection<CourtDoc>('courts'), products: db.collection<ProductDoc>('products'),
  orders: db.collection<OrderDoc>('orders'), inventoryMovements: db.collection<InventoryMovementDoc>('inventory_movements'),
  sportsItems: db.collection<SportsItemDoc>('sports_items'),
  sportsMovements: db.collection<SportsMovementDoc>('sports_movements'),
  appSettings: db.collection<AppSettingDoc>('app_settings'),
  auditLogs: db.collection<AuditLogDoc>('audit_logs'),
  customerSessions: db.collection<CustomerSessionDoc>('customer_sessions'),
  roles: db.collection<RoleDoc>('roles'),
  adminUsers: db.collection<AdminUserDoc>('admin_users')
});
export async function transaction<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (!isReplicaSet) {
    // P0 FIX: Production MUST have Replica Set for ACID transactions.
    // Standalone MongoDB cannot rollback multi-document writes — data corruption risk.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[FATAL] MongoDB Replica Set is required for production transactions. ' +
        'A multi-document write was attempted on a standalone MongoDB instance. ' +
        'This would cause partial writes with no rollback. Server startup should have prevented this.'
      );
    }
    // Development/test: warn loudly but allow (single-document ops are effectively atomic)
    console.warn(
      '[WARNING] transaction() called without Replica Set (standalone mode). ' +
      'Multi-document operations are NOT atomic. Use only for development/testing.'
    );
    return await work(undefined);
  }
  const session = client.startSession();
  try {
    return await session.withTransaction(
      () => work(session),
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 }
    );
  } finally {
    await session.endSession();
  }
}

export async function snapshotRead<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (!isReplicaSet) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Không thể tạo bản sao lưu snapshot nhất quán vì MongoDB không chạy ở chế độ Replica Set.');
    }
    return await work(undefined);
  }
  const session = client.startSession();
  try {
    return await session.withTransaction(
      () => work(session),
      {
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
        maxCommitTimeMS: 60000
      }
    );
  } catch (err) {
    console.error('[snapshotRead] Snapshot transaction failed:', err);
    throw new Error('Không thể tạo bản sao lưu nhất quán. Vui lòng thử lại.');
  } finally {
    await session.endSession();
  }
}
