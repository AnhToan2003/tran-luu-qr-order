// Local Acceptance & Preview environment with persistent storage.
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { scryptSync } from 'node:crypto';

let repl: MongoMemoryReplSet | undefined;
let mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  try {
    const probe = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 1500 });
    await probe.connect();
    await probe.close();
    mongoUri = 'mongodb://127.0.0.1:27017';
    console.log('[Preview] Connected to local persistent MongoDB on port 27017');
  } catch {
    console.log('[Preview] Local MongoDB on 27017 not found, launching MongoMemoryReplSet fallback...');
    repl = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    mongoUri = repl.getUri();
  }
}

process.env.MONGO_URI = mongoUri;
process.env.DB_NAME = process.env.DB_NAME || 'tran_luu_order';
process.env.NODE_ENV = 'development';
const salt = 'da8993262f181e1146b86656113084a4';
process.env.ADMIN_PASSWORD_HASH = salt + ':' + scryptSync('admin123', salt, 64).toString('hex');
process.env.ADMIN_USERNAME = 'admin';

const { connectToDatabase, getCollections, closeDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/app.js');
const { seedSampleData } = await import('../server/seedData.js');

await connectToDatabase();
const c = getCollections();

// Seed sample data ONLY if database is empty (force = false)
// Newly created or edited products are 100% preserved on disk!
await seedSampleData(c.courts.db, false);

const server = createApp().listen(3101, '127.0.0.1', () => {
  console.log('UI Server ready at: http://127.0.0.1:3101 — admin / admin123');
  console.log('Database connected to: ' + mongoUri + ' / ' + process.env.DB_NAME);
});

const stop = () => server.close(() => {
  void closeDatabase().then(async () => {
    if (repl) await repl.stop();
  }).then(() => process.exit(0));
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
