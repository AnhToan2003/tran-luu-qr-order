import 'dotenv/config';
import { createApp } from './app.js';
import { connectToDatabase, closeDatabase } from './db.js';
import { validateAuthConfig } from './auth.js';
import { initRedis, isRedisAvailable, closeRedis } from './redis.js';
import { logError, logInfo } from './logger.js';
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
  const port = Number(process.env.PORT || 3001);
  const server = createApp().listen(port, '0.0.0.0', () => {
    logInfo('app.ready', { port, websocket: true });
  });
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
} catch (error) {
  const startupError = error as Error;
  logError('app.startup_failed', {
    errorName: startupError.name,
    message: startupError.message,
    stack: startupError.stack,
  });
  process.exit(1);
}
