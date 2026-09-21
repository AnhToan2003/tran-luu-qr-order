import { Router } from 'express';
import { getCollections, getDb } from '../db.js';
import { requirePermission } from '../auth.js';
import { ApiError } from '../errors.js';
import { signCourtCode, verifyCourtSignature } from '../services/qrSign.js';
import { getApiStats, getTelemetryErrors, getTelemetryMetrics } from '../telemetry.js';

export const monitorRouter = Router();

// Monitoring data contains stack traces, IP addresses and QR signatures.
// Only administrators with backup/audit access may use these endpoints.
monitorRouter.use(requirePermission('backup'));

function parseStackTrace(stack?: string) {
  if (!stack) return { file: 'Không xác định', line: 0 };
  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ') || trimmed.includes('node:internal') || trimmed.includes('node_modules')) continue;
    const match = trimmed.match(/(?:at\s+.*?\s+\()?([A-Za-z0-9_.\/\\:-]+):(\d+):(\d+)\)?/);
    if (!match) continue;
    let filePath = match[1].replace(/\\/g, '/');
    const serverIndex = filePath.indexOf('/server/');
    if (serverIndex !== -1) filePath = filePath.substring(serverIndex + 1);
    return { file: filePath, line: Number(match[2]) };
  }
  return { file: 'Server Router / Controller', line: 0 };
}

monitorRouter.get('/overview', async (_req, res) => {
  const c = getCollections();
  const db = getDb();
  const now = new Date();

  const [totalSessions, recentSessionsRaw, sampledSessions, allCourts, courtStats, dbErrors] = await Promise.all([
    c.customerSessions.countDocuments({}),
    c.customerSessions.find({}, {
      projection: { courtCode: 1, courtNameSnapshot: 1, createdAt: 1, expiresAt: 1, terminatedAt: 1, ip: 1 }
    }).sort({ createdAt: -1 }).limit(15).toArray(),
    c.customerSessions.find({}, { projection: { userAgent: 1 } }).sort({ createdAt: -1 }).limit(5000).toArray(),
    c.courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
    c.customerSessions.aggregate([
      {
        $group: {
          _id: '$courtCode',
          count: { $sum: 1 },
          activeCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$expiresAt', now] }, { $eq: [{ $ifNull: ['$terminatedAt', null] }, null] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]).toArray(),
    db.collection('system_errors').find({}).sort({ timestamp: -1 }).limit(40).toArray()
  ]);

  const activeSessions = courtStats.reduce((sum, item) => sum + Number(item.activeCount || 0), 0);
  const statMap = new Map(courtStats.map(item => [String(item._id || ''), item]));
  const courtBreakdown = allCourts.map(court => {
    const stat = statMap.get(court.code);
    return {
      code: court.code,
      name: court.name,
      count: Number(stat?.count || 0),
      activeCount: Number(stat?.activeCount || 0)
    };
  });

  const devices = { ios: 0, android: 0, desktop: 0, other: 0 };
  for (const session of sampledSessions) {
    const ua = String(session.userAgent || '').toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) devices.ios++;
    else if (ua.includes('android')) devices.android++;
    else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) devices.desktop++;
    else devices.other++;
  }

  const combinedErrors = [
    ...getTelemetryErrors(),
    ...dbErrors.map((error: any) => ({
      timestamp: error.timestamp,
      statusCode: error.statusCode,
      code: error.code,
      method: error.method,
      path: error.path,
      message: error.message,
      stack: error.stack
    }))
  ];
  const uniqueErrors = Array.from(
    new Map(combinedErrors.map((item: any) => [`${item.timestamp}-${item.path}-${item.code}`, item])).values()
  )
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 35)
    .map((error: any) => {
      const parsed = parseStackTrace(error.stack);
      return {
        timestamp: error.timestamp || new Date().toISOString(),
        statusCode: error.statusCode || 500,
        code: error.code || 'INTERNAL_ERROR',
        method: String(error.method || 'GET').toUpperCase(),
        path: error.path || '/',
        message: error.message || 'Lỗi hệ thống',
        stack: error.stack || '',
        location: parsed.line ? `${parsed.file}:${parsed.line}` : (error.path || 'server/app.ts'),
        sourceFile: parsed.file,
        sourceLine: parsed.line
      };
    });

  const mem = process.memoryUsage();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    timestamp: new Date().toISOString(),
    mainSystem: {
      isAlive: true,
      pingMs: 0,
      url: process.env.PUBLIC_ORIGIN || 'same-origin'
    },
    users: {
      totalSessions,
      activeSessions,
      devices,
      recentSessions: recentSessionsRaw
    },
    courts: courtBreakdown,
    telemetry: getApiStats(),
    errors: uniqueErrors,
    system: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      recentMetricCount: getTelemetryMetrics().length
    }
  });
});

monitorRouter.get('/courts-signatures', async (_req, res) => {
  const c = getCollections();
  const now = new Date();
  const [courts, sessionStats] = await Promise.all([
    c.courts.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
    c.customerSessions.aggregate([
      {
        $group: {
          _id: '$courtCode',
          totalSessions: { $sum: 1 },
          activeSessions: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$expiresAt', now] }, { $eq: [{ $ifNull: ['$terminatedAt', null] }, null] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]).toArray()
  ]);
  const stats = new Map(sessionStats.map(item => [String(item._id || ''), item]));
  const publicOrigin = (process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    timestamp: new Date().toISOString(),
    courts: courts.map(court => {
      const sig = signCourtCode(court.code);
      const stat = stats.get(court.code);
      return {
        code: court.code,
        name: court.name,
        sig,
        isActive: court.isActive !== false,
        fullUrl: `${publicOrigin}/?court=${encodeURIComponent(court.code)}&sig=${encodeURIComponent(sig)}`,
        totalSessions: Number(stat?.totalSessions || 0),
        activeSessions: Number(stat?.activeSessions || 0)
      };
    })
  });
});

monitorRouter.post('/verify-signature', async (req, res) => {
  const cleanCode = String(req.body?.courtCode || '').trim().padStart(2, '0');
  if (!/^\d{2}$/.test(cleanCode)) throw new ApiError(400, 'INVALID_COURT_CODE', 'Mã sân không hợp lệ');
  const expectedSig = signCourtCode(cleanCode);
  const publicOrigin = (process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
  res.json({
    courtCode: cleanCode,
    providedSig: String(req.body?.sig || ''),
    expectedSig,
    isValid: verifyCourtSignature(cleanCode, req.body?.sig),
    url: `${publicOrigin}/?court=${encodeURIComponent(cleanCode)}&sig=${encodeURIComponent(expectedSig)}`
  });
});

monitorRouter.post('/test-court-session', async (req, res) => {
  const startedAt = Date.now();
  const cleanCode = String(req.body?.courtCode || '').trim().padStart(2, '0');
  const signature = String(req.body?.sig || '');
  if (!/^\d{2}$/.test(cleanCode) || !verifyCourtSignature(cleanCode, signature)) {
    throw new ApiError(403, 'INVALID_QR_SIGNATURE', 'Mã sân hoặc chữ ký QR không hợp lệ');
  }
  const court = await getCollections().courts.findOne({ code: cleanCode, deletedAt: null });
  if (!court) throw new ApiError(404, 'COURT_NOT_FOUND', 'Sân không tồn tại');
  if (!court.isActive) throw new ApiError(403, 'COURT_INACTIVE', 'Sân đang tạm dừng');
  res.json({
    statusCode: 200,
    elapsedMs: Date.now() - startedAt,
    success: true,
    courtCode: cleanCode,
    message: 'Chữ ký hợp lệ và sân sẵn sàng cấp phiên'
  });
});

const PROBE_PATHS = new Set([
  '/api/health',
  '/api/catalog',
  '/api/orders/public-bank-info',
  '/api-docs/openapi.json'
]);

monitorRouter.get('/proxy', async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '/api/health';
  const parsed = new URL(rawPath, 'http://monitor.local');
  if (!rawPath.startsWith('/') || parsed.origin !== 'http://monitor.local' || !PROBE_PATHS.has(parsed.pathname)) {
    throw new ApiError(400, 'PROBE_PATH_NOT_ALLOWED', 'Endpoint này không nằm trong danh sách kiểm tra an toàn');
  }
  const internalUrl = `http://127.0.0.1:${process.env.PORT || 3001}${parsed.pathname}${parsed.search}`;
  const probeResponse = await fetch(internalUrl, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'TranLuu-Monitor-Probe/3.0' },
    signal: AbortSignal.timeout(5000)
  });
  const contentType = probeResponse.headers.get('content-type') || '';
  res.status(probeResponse.status);
  if (contentType.includes('application/json')) return res.json(await probeResponse.json());
  res.type('text/plain').send(await probeResponse.text());
});
