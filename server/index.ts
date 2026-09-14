import 'dotenv/config';
import { createApp } from './app.js';
import { connectToDatabase, closeDatabase } from './db.js';
import { validateAuthConfig } from './auth.js';
try {
  validateAuthConfig();
  const { db } = await connectToDatabase();
  const { seedSampleData } = await import('./seedData.js');
  await seedSampleData(db, false);
  const { initWebSocketServer } = await import('./websocket.js');
  const server = createApp().listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log('Tran Luu Order API v2 ready (HTTP + WebSocket)'));
  initWebSocketServer(server);
  const shutdown = () => { server.close(() => { void closeDatabase().finally(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch(error) { console.error('Startup failed:', (error as Error).message); process.exit(1); }
