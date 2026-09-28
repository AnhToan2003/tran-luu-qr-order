import 'dotenv/config';
import { MongoClient, type Db, type ClientSession } from 'mongodb';
import { SYSTEM_PERMISSIONS, type CourtDoc, type ProductDoc, type OrderDoc, type InventoryMovementDoc, type AppSettingDoc, type AuditLogDoc, type CustomerSessionDoc, type SportsItemDoc, type SportsMovementDoc, type RoleDoc, type AdminUserDoc } from './types.js';
export const DB_NAME = process.env.DB_NAME || 'tran_luu_qr_order';
let client: MongoClient;
let db: Db;
let isReplicaSet = false;
function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
export async function connectToDatabase() {
  if (db) return { client, db };
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (process.env.NODE_ENV === 'production' && !mongoUri) {
    throw new Error('[Security] MONGO_URI must be explicitly configured in production.');
  }
  const maxPoolSize = boundedEnvInt('MONGO_MAX_POOL_SIZE', 50, 5, 500);
  const minPoolSize = Math.min(maxPoolSize, boundedEnvInt('MONGO_MIN_POOL_SIZE', 2, 0, 100));
  client = new MongoClient(mongoUri || 'mongodb://localhost:27017', {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize,
    minPoolSize,
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
    c.auditLogs.createIndex({ action: 1, createdAt: -1 }),
    c.auditLogs.createIndex({ adminUsername: 1, createdAt: -1 }),
    c.roles.createIndex({ roleId: 1 }, { unique: true }),
    c.adminUsers.createIndex({ userId: 1 }, { unique: true }),
    c.adminUsers.createIndex({ username: 1 }, { unique: true }),
    // action_proofs: short-lived one-time tokens for sensitive ops, TTL 10 minutes
    db.collection('action_proofs').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('action_proofs').createIndex({ proofId: 1 }, { unique: true }),
    db.collection('action_proofs').createIndex({ userId: 1, action: 1 })
  ]);

  // Configurable Audit Log TTL (default 365 days) with collMod fallback for index conflict
  const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10) || 365;
  const retentionSeconds = retentionDays * 86400;
  try {
    await c.auditLogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });
  } catch (idxErr: any) {
    if (idxErr.codeName === 'IndexOptionsConflict' || idxErr.code === 85 || String(idxErr).includes('IndexOptionsConflict')) {
      try {
        await db.command({
          collMod: 'audit_logs',
          index: {
            keyPattern: { createdAt: 1 },
            expireAfterSeconds: retentionSeconds
          }
        });
      } catch (collModErr) {
        console.warn('[DB Init] Could not collMod audit_logs TTL index:', collModErr);
      }
    } else {
      console.warn('[DB Init] auditLogs index warning:', idxErr);
    }
  }

  await applyCollectionValidators(db);
  await ensureSystemRoles(db);
  await c.appSettings.updateOne({ key: 'system_config' }, { $setOnInsert: { key: 'system_config', value: { isAcceptingOrders: true }, updatedAt: new Date() } }, { upsert: true });
  await migrateLegacyBatches(db);
  return { client, db };
}

async function ensureSystemRoles(database: Db) {
  const now = new Date();
  const roles = database.collection<RoleDoc>('roles');
  await roles.updateOne(
    { roleId: 'admin' },
    {
      $set: {
        permissions: SYSTEM_PERMISSIONS.map(permission => permission.id),
        isSystem: true,
        updatedAt: now
      },
      $setOnInsert: {
        roleId: 'admin',
        name: 'Quản trị viên (Admin)',
        description: 'Toàn quyền truy cập tất cả chức năng trên hệ thống',
        createdAt: now
      }
    },
    { upsert: true }
  );
}

async function applyCollectionValidators(database: Db) {
  const validators: Record<string, object> = {
    orders: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['orderId', 'displayCode', 'status', 'totalVnd', 'items', 'courtId', 'createdAt'],
        properties: {
          orderId: { bsonType: 'string', description: 'must be a string and is required' },
          displayCode: { bsonType: 'string', description: 'must be a string and is required' },
          status: {
            enum: ['new', 'accepted', 'preparing', 'delivered', 'cancelled'],
            description: 'must be a valid order status'
          },
          paymentStatus: {
            enum: ['unpaid', 'paid'],
            description: 'must be a valid payment status'
          },
          totalVnd: { bsonType: ['int', 'double', 'long', 'decimal'], minimum: 0, description: 'must be a non-negative number' },
          items: {
            bsonType: 'array',
            minItems: 1,
            description: 'items must be a non-empty array'
          },
          courtId: { bsonType: 'string', description: 'must be a string and is required' },
          createdAt: { bsonType: 'date', description: 'must be a date and is required' }
        }
      }
    },
    admin_users: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['userId', 'username', 'passwordHash', 'fullName', 'roleId', 'isActive'],
        properties: {
          userId: { bsonType: 'string', description: 'must be a string and is required' },
          username: { bsonType: 'string', description: 'must be a string and is required' },
          passwordHash: { bsonType: 'string', description: 'must be a string and is required' },
          fullName: { bsonType: 'string', description: 'must be a string and is required' },
          roleId: { bsonType: 'string', description: 'must be a string and is required' },
          isActive: { bsonType: 'bool', description: 'must be a boolean and is required' }
        }
      }
    },
    products: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['productId', 'name', 'priceVnd', 'stock', 'isAvailable'],
        properties: {
          productId: { bsonType: 'string', description: 'must be a string and is required' },
          name: { bsonType: 'string', description: 'must be a string and is required' },
          priceVnd: { bsonType: ['int', 'double', 'long', 'decimal'], minimum: 0, description: 'must be a non-negative number' },
          stock: { bsonType: ['int', 'double', 'long', 'decimal'], description: 'must be a number' },
          isAvailable: { bsonType: 'bool', description: 'must be a boolean and is required' }
        }
      }
    },
    courts: {
      $jsonSchema: {
        bsonType: 'object', required: ['courtId', 'code', 'name', 'isActive', 'createdAt'],
        properties: {
          courtId: { bsonType: 'string' }, code: { bsonType: 'string' }, name: { bsonType: 'string' },
          isActive: { bsonType: 'bool' }, qrVersion: { bsonType: ['int', 'long'], minimum: 0 },
          createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' }
        }
      }
    },
    sports_items: {
      $jsonSchema: {
        bsonType: 'object', required: ['itemId', 'name', 'category', 'unit', 'priceVnd', 'stock', 'isService', 'isAvailable'],
        properties: {
          itemId: { bsonType: 'string' }, name: { bsonType: 'string' }, category: { bsonType: 'string' }, unit: { bsonType: 'string' },
          priceVnd: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
          costPriceVnd: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
          stock: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
          isService: { bsonType: 'bool' }, isAvailable: { bsonType: 'bool' }
        }
      }
    },
    inventory_movements: {
      $jsonSchema: {
        bsonType: 'object', required: ['operationId', 'productId', 'delta', 'stockAfter', 'reason', 'createdAt'],
        properties: {
          operationId: { bsonType: 'string' }, productId: { bsonType: 'string' },
          delta: { bsonType: ['int', 'long', 'double', 'decimal'] }, stockAfter: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
          reason: { bsonType: 'string' }, createdAt: { bsonType: 'date' }
        }
      }
    },
    sports_movements: {
      $jsonSchema: {
        bsonType: 'object', required: ['operationId', 'itemId', 'delta', 'stockAfter', 'reason', 'createdAt'],
        properties: {
          operationId: { bsonType: 'string' }, itemId: { bsonType: 'string' },
          delta: { bsonType: ['int', 'long', 'double', 'decimal'] }, stockAfter: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
          reason: { bsonType: 'string' }, createdAt: { bsonType: 'date' }
        }
      }
    },
    roles: {
      $jsonSchema: {
        bsonType: 'object', required: ['roleId', 'name', 'permissions', 'isSystem'],
        properties: {
          roleId: { bsonType: 'string' }, name: { bsonType: 'string' }, permissions: { bsonType: 'array', items: { bsonType: 'string' } }, isSystem: { bsonType: 'bool' }
        }
      }
    },
    customer_sessions: {
      $jsonSchema: {
        bsonType: 'object', required: ['sessionTokenHash', 'courtId', 'courtCode', 'createdAt', 'expiresAt'],
        properties: {
          sessionTokenHash: { bsonType: 'string' }, courtId: { bsonType: 'string' }, courtCode: { bsonType: 'string' },
          createdAt: { bsonType: 'date' }, expiresAt: { bsonType: 'date' }
        }
      }
    },
    audit_logs: {
      $jsonSchema: {
        bsonType: 'object', required: ['auditId', 'adminUsername', 'action', 'createdAt'],
        properties: {
          auditId: { bsonType: 'string' }, adminUsername: { bsonType: 'string' }, action: { bsonType: 'string' }, createdAt: { bsonType: 'date' }
        }
      }
    },
    app_settings: {
      $jsonSchema: {
        bsonType: 'object', required: ['key'], properties: { key: { bsonType: 'string' } }
      }
    }
  };

  try {
    const existingCollections = await database.listCollections().toArray();
    const existingNames = new Set(existingCollections.map(col => col.name));

    for (const [collName, validator] of Object.entries(validators)) {
      try {
        if (existingNames.has(collName)) {
          await database.command({
            collMod: collName,
            validator,
            validationLevel: 'moderate',
            validationAction: 'error'
          });
        } else {
          await database.createCollection(collName, {
            validator,
            validationLevel: 'moderate',
            validationAction: 'error'
          });
        }
      } catch (err: any) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn(`[DB Schema] Could not apply validator for ${collName}:`, err?.message || err);
      }
    }
  } catch (outerErr: any) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[DB Schema] Không thể áp dụng validator production: ${outerErr?.message || outerErr}`);
    }
    console.warn('[DB Schema] Failed listing collections for schema validators:', outerErr?.message || outerErr);
  }
}

async function migrateLegacyBatches(database: Db) {
  try {
    const markerKey = 'migration:legacy_batch_ids:v1';
    if (await database.collection('app_settings').findOne({ key: markerKey })) return;

    async function normalizeCollection(collectionName: string, pattern: RegExp) {
      const collection = database.collection(collectionName);
      const cursor = collection.find({
        $or: [{ batchId: { $in: [null, undefined] } }, { batchId: { $type: 'string' } }]
      }).project({ _id: 1, batchId: 1, operationId: 1, note: 1 }).batchSize(500);
      let operations: any[] = [];
      for await (const movement of cursor) {
        const source = `${movement.batchId || ''} ${movement.operationId || ''} ${movement.note || ''}`;
        const matched = source.match(pattern)?.[1];
        if (!matched || movement.batchId === matched) continue;
        operations.push({ updateOne: { filter: { _id: movement._id }, update: { $set: { batchId: matched } } } });
        if (operations.length >= 500) {
          await collection.bulkWrite(operations, { ordered: false });
          operations = [];
        }
      }
      if (operations.length > 0) await collection.bulkWrite(operations, { ordered: false });
    }

    await normalizeCollection('inventory_movements', /(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
    await normalizeCollection('sports_movements', /((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
    await database.collection('app_settings').updateOne(
      { key: markerKey },
      { $set: { value: { completedAt: new Date() }, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
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
