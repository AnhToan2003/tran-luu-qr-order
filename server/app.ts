import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { authRouter } from './auth.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { orderRouter } from './routes/orderRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { sessionRouter } from './routes/sessionRoutes.js';
import { sportsRouter } from './routes/sportsRoutes.js';
import { rbacRouter } from './routes/rbacRoutes.js';
import { getDb } from './db.js';
import { ApiError } from './errors.js';
import { isRedisAvailable } from './redis.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        fontSrc:    ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // Chỉ bật upgradeInsecureRequests trong production để tránh CSP warning ở dev
        ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use('/api/admin/catalog/import', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    const rawId = req.headers['x-request-id'];
    const requestId = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : randomUUID();
    (req as any).id = requestId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const host = req.get('host') || '';
      const expected = process.env.PUBLIC_ORIGIN || `${req.protocol}://${host}`;
      if (origin) {
        let isAllowed = origin === expected;
        if (!isAllowed) {
          try {
            const originUrl = new URL(origin);
            const hostOnly = host.split(':')[0];
            const isLocal = ['localhost', '127.0.0.1'].includes(originUrl.hostname) || originUrl.hostname === hostOnly;
            const isDevPort = ['3000', '3001', '5173'].includes(originUrl.port);
            if (process.env.NODE_ENV !== 'production' && (isLocal || isDevPort)) {
              isAllowed = true;
            }
          } catch {
            isAllowed = false;
          }
        }
        if (!isAllowed || req.headers['sec-fetch-site'] === 'cross-site') {
          throw new ApiError(403, 'CROSS_SITE_REQUEST', 'Yêu cầu không hợp lệ');
        }
      }
      if (req.is('application/json') === false && req.headers['content-length'] !== '0') throw new ApiError(415, 'JSON_REQUIRED', 'Dữ liệu phải có định dạng JSON');
    }
    next();
  });
  app.use('/api/admin/auth', authRouter);
  app.use('/api/admin/rbac', rbacRouter);
  app.use('/api/admin/sports', sportsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/sessions', sessionRouter);
  app.get('/api/health', async (_req, res) => {
    try {
      await getDb().command({ ping: 1 });
      res.json({
        status: 'ok',
        version: '2.0.0',
        mongodb: 'connected',
        redis: isRedisAvailable() ? 'connected' : 'fallback_memory',
        time: new Date().toISOString()
      });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy API' }));
  const distPath = path.resolve('dist');
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true,
    maxAge: '1y'
  }));
  app.use(express.static(distPath, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    const reqId = (req as any)?.id || 'unknown';
    if (error instanceof ZodError) return void res.status(400).json({ code: 'INVALID_INPUT', message: error.issues.map(i => i.message).join('; ') });
    if (error instanceof ApiError) return void res.status(error.statusCode).json({ code: error.code, message: error.message });
    if (error.code === 11000) return void res.status(409).json({ code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại. Vui lòng tải lại.' });
    if (error.type === 'entity.parse.failed') return void res.status(400).json({ code: 'INVALID_JSON', message: 'JSON không hợp lệ' });
    if (error.type === 'entity.too.large') return void res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Ảnh hoặc yêu cầu quá lớn' });
    console.error(`[API ${reqId}] ${req.method} ${req.originalUrl} - ${error.name}: ${error.message}\n${error.stack}`);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.' });
  };
  app.use(errors);
  return app;
}
