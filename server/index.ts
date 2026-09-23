import 'dotenv/config';
import { createApp } from './app.js';
import { connectToDatabase, closeDatabase } from './db.js';
import { validateAuthConfig } from './auth.js';
import { initRedis, isRedisAvailable, closeRedis } from './redis.js';
try {
  validateAuthConfig();
  const { db } = await connectToDatabase();
  await initRedis();
  if (process.env.NODE_ENV === 'production' && !isRedisAvailable()) {
    throw new Error('[FATAL] Redis is required and must be reachable in production.');
  }
  const { seedSampleData } = await import('./seedData.js');
  await seedSampleData(db, false);
  const { initWebSocketServer } = await import('./websocket.js');
  const server = createApp().listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log('Tran Luu Order API v2 ready (HTTP + WebSocket)'));
  const wss = initWebSocketServer(server);
  const { initRedisSubscriber } = await import('./redis.js');
  await initRedisSubscriber();
  const shutdown = () => {
    try { wss.close(); } catch {}
    server.close(() => {
      void Promise.all([closeDatabase(), closeRedis()]).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch(error) { console.error('Startup failed:', (error as Error).message); process.exit(1); }
