import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ZodError } from 'zod';
import { authRouter, requireAdmin, requirePermission } from './auth.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { orderRouter } from './routes/orderRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { sessionRouter } from './routes/sessionRoutes.js';
import { sportsRouter } from './routes/sportsRoutes.js';
import { rbacRouter } from './routes/rbacRoutes.js';
import { getDb } from './db.js';
import { ApiError } from './errors.js';
import { isRedisAvailable } from './redis.js';
import { openapiSpec } from './swagger/openapiSpec.js';
import { getSwaggerUiHtml } from './swagger/swaggerUiHtml.js';
import { logError, requestLoggingMiddleware } from './logger.js';

// P3/P14 FIX: Parse allowed dev origins precisely — no includes('localhost') substring match
const DEV_ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
]);

function isAllowedOrigin(origin: string, isProd: boolean, publicOrigin?: string): boolean {
  try {
    const parsed = new URL(origin);
    if (isProd) {
      // Production: exact match against PUBLIC_ORIGIN only
      return Boolean(publicOrigin) && origin === publicOrigin;
    } else {
      // Development: only exact matches from the allowlist
      return DEV_ALLOWED_ORIGINS.has(origin) ||
        (parsed.hostname === 'localhost' && ['3000', '3001', '5173'].includes(parsed.port)) ||
        (parsed.hostname === '127.0.0.1' && ['3000', '3001', '5173'].includes(parsed.port));
    }
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // P1/Issue #3 FIX: Only trust specific proxy CIDR, not blindly trust 1 hop.
  // TRUSTED_PROXY_CIDRS should be set to the actual reverse proxy IP/CIDR (e.g., Nginx container IP).
  // Using a number (1) allows any client to spoof X-Forwarded-For.
  const trustedProxyCidrs = process.env.TRUSTED_PROXY_CIDRS;
  if (trustedProxyCidrs) {
    // Accept comma-separated CIDR list or single value
    const cidrs = trustedProxyCidrs.split(',').map(s => s.trim()).filter(Boolean);
    app.set('trust proxy', cidrs.length === 1 ? cidrs[0] : cidrs);
  } else if (process.env.NODE_ENV !== 'production') {
    // Dev: trust loopback proxy (127.0.0.1 / ::1) only
    app.set('trust proxy', 'loopback');
  } else {
    // Production without TRUSTED_PROXY_CIDRS: do not trust any forwarded headers
    app.set('trust proxy', false);
  }

  // P2/Issue #12 FIX: Generate per-request CSP nonce
  const generateNonce = () => randomBytes(16).toString('base64');

  const mainHelmet = (nonce: string) => helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // P2 FIX: Remove 'unsafe-inline' — use nonce instead
        scriptSrc:  ["'self'", `'nonce-${nonce}'`],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        fontSrc:    ["'self'", 'data:', "https://fonts.gstatic.com"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // P3/Issue #26 FIX: Only upgrade insecure requests on real HTTPS production domains
        ...(
          process.env.NODE_ENV === 'production' &&
          process.env.PUBLIC_ORIGIN?.startsWith('https://') &&
          !process.env.PUBLIC_ORIGIN?.includes('localhost')
            ? { upgradeInsecureRequests: [] }
            : {}
        )
      }
    },
    crossOriginEmbedderPolicy: false
  });

  // P2/Issue #12+13 FIX: Swagger helmet — remove unsafe-eval + no CDN in production
  const isProdEnv = process.env.NODE_ENV === 'production';
  const swaggerHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // In production we bundle swagger UI locally, no CDN needed
        scriptSrc:  isProdEnv
          ? ["'self'", "'unsafe-inline'"]  // Swagger UI still needs inline scripts
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc:   ["'self'", "'unsafe-inline'",
          ...(isProdEnv ? [] : ["https://cdn.jsdelivr.net", "https://fonts.googleapis.com"])],
        imgSrc:     ["'self'", 'data:', 'blob:',
          ...(isProdEnv ? [] : ["https://cdn.jsdelivr.net", "https://validator.swagger.io"])],
        fontSrc:    ["'self'", 'data:',
          ...(isProdEnv ? [] : ["https://fonts.gstatic.com"])],
        connectSrc: ["'self'", 'http:', 'https:', 'ws:', 'wss:']
      }
    },
    crossOriginEmbedderPolicy: false
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api-docs')) {
      return swaggerHelmet(req, res, next);
    }
    const nonce = generateNonce();
    (req as any).cspNonce = nonce;
    return mainHelmet(nonce)(req, res, next);
  });

  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(requestLoggingMiddleware);

  // Large catalog imports are parsed only after authentication and the backup
  // permission check.  Parsing a 50 MB body before auth would let an
  // unauthenticated caller consume memory/CPU as a denial-of-service vector.
  app.use('/api/admin/catalog/import', (req, res, next) => {
    const rawLength = req.headers['content-length'];
    const contentLength = rawLength ? Number(rawLength) : 0;
    if (Number.isFinite(contentLength) && contentLength > 50 * 1024 * 1024) {
      return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Tệp import vượt quá giới hạn 50 MB.' });
    }
    next();
  }, requireAdmin, requirePermission('backup'), express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '3mb' }));

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    const isProd = process.env.NODE_ENV === 'production';
    const origin = req.headers.origin;
    if (origin) {
      // P1/Issue #14 FIX: Use isAllowedOrigin with proper URL parsing
      const allowed = isAllowedOrigin(origin, isProd, process.env.PUBLIC_ORIGIN);
      if (allowed) {
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
        const isAllowed = isAllowedOrigin(origin, isProd, expected);
        if (!isAllowed || (req.headers['sec-fetch-site'] === 'cross-site' && isProd)) {
          throw new ApiError(403, 'CROSS_SITE_REQUEST', 'Yêu cầu không hợp lệ');
        }
      }
      if (req.is('application/json') === false && req.headers['content-length'] !== '0') {
        throw new ApiError(415, 'JSON_REQUIRED', 'Dữ liệu phải có định dạng JSON');
      }
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

  // P1/Issue #15 FIX: Public health = liveness only (no version/topology leakage)
  // Detailed readiness is protected and only accessible internally.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Detailed readiness check — requires admin permission and is intended for deployment checks.
  app.get('/api/health/ready', requirePermission('backup'), async (_req, res) => {
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

  // P1/Issue #13 FIX: Swagger protected by admin permission in production
  app.get('/api-docs/openapi.json', requirePermission('backup'), (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');

    const isProd = process.env.NODE_ENV === 'production';
    const prodUrl = (process.env.PUBLIC_ORIGIN && !process.env.PUBLIC_ORIGIN.includes('localhost'))
      ? process.env.PUBLIC_ORIGIN
      : 'https://api.tranluubadminton.vn';

    const localBackendUrl = `http://localhost:${process.env.PORT || 3001}`;

    const servers = isProd
      ? [{ url: prodUrl, description: 'Production' }]  // No local server in production docs
      : [{ url: localBackendUrl, description: 'Local' }, { url: prodUrl, description: 'Production' }];

    res.json({ ...openapiSpec, servers });
  });

  app.get(['/api-docs', '/api-docs/'], requirePermission('backup'), (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(getSwaggerUiHtml('/api-docs/openapi.json'));
  });

  // The former in-app monitor was intentionally removed. Keep an explicit
  // 404 before the SPA fallback so stale bookmarks cannot silently render
  // the customer application at the old path.
  app.get(['/monitor', '/monitor/'], (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Trang không tồn tại' });
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
    const statusCode = error instanceof ZodError ? 400
      : (error instanceof ApiError ? error.statusCode
      : (error.code === 11000 ? 409
      : (error.type === 'entity.parse.failed' ? 400
      : (error.type === 'entity.too.large' ? 413 : 500))));
    const errorCode = error instanceof ApiError ? error.code
      : (error.code === 11000 ? 'DUPLICATE'
      : (error instanceof ZodError ? 'INVALID_INPUT' : error.name || 'SERVER_ERROR'));

    logError('api.error', {
      requestId: reqId,
      method: req.method,
      path: req.path,
      statusCode,
      code: errorCode,
      message: error.message || 'Lỗi không xác định',
      errorName: error.name,
      stack: error.stack,
    });

    if (error instanceof ZodError) return void res.status(400).json({ code: 'INVALID_INPUT', message: error.issues.map(i => i.message).join('; ') });
    if (error instanceof ApiError) return void res.status(error.statusCode).json({ code: error.code, message: error.message });
    if (error.code === 11000) return void res.status(409).json({ code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại. Vui lòng tải lại.' });
    if (error.type === 'entity.parse.failed') return void res.status(400).json({ code: 'INVALID_JSON', message: 'JSON không hợp lệ' });
    if (error.type === 'entity.too.large') return void res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Ảnh hoặc yêu cầu quá lớn' });
    // P2/Issue #16 FIX: Do not expose stack trace to client in production
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.' });
  };
  app.use(errors);
  return app;
}
