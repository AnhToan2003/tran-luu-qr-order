import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { authRouter, requirePermission } from './auth.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { orderRouter } from './routes/orderRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { sessionRouter } from './routes/sessionRoutes.js';
import { sportsRouter } from './routes/sportsRoutes.js';
import { rbacRouter } from './routes/rbacRoutes.js';
import { monitorRouter } from './routes/monitorRoutes.js';
import { getDb } from './db.js';
import { ApiError } from './errors.js';
import { isRedisAvailable } from './redis.js';
import { openapiSpec } from './swagger/openapiSpec.js';
import { getSwaggerUiHtml } from './swagger/swaggerUiHtml.js';
import { telemetryMiddleware, recordSystemError } from './telemetry.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  const mainHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        fontSrc:    ["'self'", 'data:', "https://fonts.gstatic.com"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // Chỉ bật upgradeInsecureRequests khi production thực sự chạy trên domain HTTPS
        ...(process.env.NODE_ENV === 'production' && process.env.PUBLIC_ORIGIN?.startsWith('https://') ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false
  });

  const swaggerHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
        imgSrc:     ["'self'", 'data:', 'blob:', "https://cdn.jsdelivr.net", "https://validator.swagger.io"],
        fontSrc:    ["'self'", 'data:', "https://fonts.gstatic.com"],
        connectSrc: ["'self'", 'http:', 'https:', 'ws:', 'wss:']
      }
    },
    crossOriginEmbedderPolicy: false
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api-docs')) {
      return swaggerHelmet(req, res, next);
    }
    return mainHelmet(req, res, next);
  });
  app.use('/api/admin/catalog/import', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(telemetryMiddleware);
  app.use('/api', (req, res, next) => {
    const rawId = req.headers['x-request-id'];
    const requestId = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : randomUUID();
    (req as any).id = requestId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('Cache-Control', 'no-store');

    const isProd = process.env.NODE_ENV === 'production';
    const origin = req.headers.origin;
    if (origin) {
      const isLocalOrigin = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isAllowedProd = isProd && process.env.PUBLIC_ORIGIN && origin === process.env.PUBLIC_ORIGIN;
      const isAllowedDev = !isProd && isLocalOrigin;
      if (isAllowedProd || isAllowedDev) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id, X-Requested-With');
      }
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const host = req.get('host') || '';
      const expected = process.env.PUBLIC_ORIGIN || `${req.protocol}://${host}`;
      if (origin) {
        let isAllowed = false;
        if (isProd) {
          isAllowed = (origin === expected) || (Boolean(process.env.PUBLIC_ORIGIN) && origin === process.env.PUBLIC_ORIGIN);
        } else {
          try {
            const originUrl = new URL(origin);
            const isLocalHost = ['localhost', '127.0.0.1'].includes(originUrl.hostname);
            const isDevPort = ['3000', '3001', '5173'].includes(originUrl.port);
            isAllowed = (origin === expected) || (isLocalHost && isDevPort);
          } catch {
            isAllowed = false;
          }
        }
        const isLocalOrigin = origin.includes('localhost') || origin.includes('127.0.0.1');
        if (!isAllowed || (req.headers['sec-fetch-site'] === 'cross-site' && isProd && !isLocalOrigin)) {
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
  app.use('/api/monitor', monitorRouter);
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

  // Swagger Documentation & Independent API Test Interface
  app.get('/api-docs/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    const isProd = process.env.NODE_ENV === 'production';
    const prodUrl = (process.env.PUBLIC_ORIGIN && !process.env.PUBLIC_ORIGIN.includes('localhost'))
      ? process.env.PUBLIC_ORIGIN
      : 'https://api.tranluubadminton.vn';

    const localBackendUrl = `http://localhost:${process.env.PORT || 3001}`;
    const localFrontendUrl = 'http://localhost:3000';

    const servers = isProd
      ? [
          {
            url: prodUrl,
            description: 'Production'
          },
          {
            url: localBackendUrl,
            description: 'Local'
          }
        ]
      : [
          {
            url: localBackendUrl,
            description: 'Local'
          },
          {
            url: prodUrl,
            description: 'Production'
          }
        ];

    res.json({
      ...openapiSpec,
      servers
    });
  });
  app.get(['/api-docs', '/api-docs/'], (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(getSwaggerUiHtml('/api-docs/openapi.json'));
  });

  app.get(['/monitor', '/monitor/'], requirePermission('backup'), (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.resolve('monitor/dashboard.html'));
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
    const statusCode = error instanceof ZodError ? 400 : (error instanceof ApiError ? error.statusCode : (error.code === 11000 ? 409 : (error.type === 'entity.parse.failed' ? 400 : (error.type === 'entity.too.large' ? 413 : 500))));
    const errorCode = error instanceof ApiError ? error.code : (error.code === 11000 ? 'DUPLICATE' : (error instanceof ZodError ? 'INVALID_INPUT' : error.name || 'SERVER_ERROR'));

    recordSystemError({
      id: reqId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      code: errorCode,
      message: error.message || 'Lỗi không xác định',
      stack: error.stack,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

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
