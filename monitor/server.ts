import express from 'express';
import { MongoClient, Db } from 'mongodb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const MONITOR_PORT = Number(process.env.MONITOR_PORT || 3005);
const MAIN_API_URL = process.env.MAIN_API_URL || 'http://localhost:3001';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'tran_luu_qr_order';

const getSecret = () => process.env.QR_SIGN_SECRET || 'tran-luu-court-qr-hmac-secret-v2';
const getLegacySecret = () => process.env.QR_SIGN_SECRET_LEGACY;

function signCourtCode(courtCode: string): string {
  return createHmac('sha256', getSecret())
    .update(`court:${courtCode.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 12);
}

function verifyCourtSignature(courtCode: string, sig?: string | null): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const cleanSig = sig.trim().toLowerCase();
  const expected = signCourtCode(courtCode).toLowerCase();
  if (cleanSig.length === expected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected))) {
    return true;
  }
  const legacy = getLegacySecret();
  if (legacy) {
    const legacyExpected = createHmac('sha256', legacy)
      .update(`court:${courtCode.trim().toLowerCase()}`)
      .digest('hex')
      .slice(0, 12)
      .toLowerCase();
    if (cleanSig.length === legacyExpected.length && timingSafeEqual(Buffer.from(cleanSig), Buffer.from(legacyExpected))) {
      return true;
    }
  }
  return false;
}

function parseStackTrace(stack?: string) {
  if (!stack) return { file: 'Không xác định', line: 0, column: 0 };
  const lines = stack.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('at ') && !trimmed.includes('node:internal') && !trimmed.includes('node_modules')) {
      const match = trimmed.match(/(?:at\s+.*?\s+\()?([A-Za-z0-9_.\/\\:-]+):(\d+):(\d+)\)?/);
      if (match) {
        let filePath = match[1].replace(/\\/g, '/');
        // Truncate workspace prefix for readability
        const idx = filePath.indexOf('/server/');
        if (idx !== -1) filePath = filePath.substring(idx + 1);
        return {
          file: filePath,
          line: Number(match[2]),
          column: Number(match[3]),
          rawCaller: trimmed
        };
      }
    }
  }
  return { file: 'Server Router / Controller', line: 0, column: 0 };
}

let mongoClient: MongoClient | null = null;
let db: Db | null = null;

async function getDatabase(): Promise<Db | null> {
  if (db) return db;
  try {
    mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2500 });
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    return db;
  } catch (err) {
    console.warn('[Monitor Server] Could not connect directly to MongoDB:', (err as Error).message);
    return null;
  }
}

app.use(express.json());

// 1. Phục vụ giao diện Dashboard
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 2. API Tổng quan & Đo lường
app.get('/api/overview', async (_req, res) => {
  let isMainAlive = false;
  let pingMs = 0;
  let mainTelemetry: any = null;

  // Kiểm tra máy chủ chính (Port 3001)
  try {
    const pingStart = Date.now();
    const probeRes = await fetch(`${MAIN_API_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    pingMs = Date.now() - pingStart;
    isMainAlive = probeRes.ok;

    if (isMainAlive) {
      const telRes = await fetch(`${MAIN_API_URL}/api/internal/telemetry`, { signal: AbortSignal.timeout(2000) });
      if (telRes.ok) {
        mainTelemetry = await telRes.json();
      }
    }
  } catch {
    isMainAlive = false;
    pingMs = 999;
  }

  // Dữ liệu từ MongoDB
  let totalSessions = 0;
  let activeSessions = 0;
  let courtBreakdown: Array<{ code: string; name: string; count: number; activeCount: number }> = [];
  let devices = { ios: 0, android: 0, desktop: 0, other: 0 };
  let recentSessions: any[] = [];
  let dbErrors: any[] = [];

  try {
    const database = await getDatabase();
    if (database) {
      const now = new Date();
      const sessionsCol = database.collection('customer_sessions');
      const courtsCol = database.collection('courts');
      const errorsCol = database.collection('system_errors');

      const [allSessions, allCourts, recentErrDocs] = await Promise.all([
        sessionsCol.find().toArray(),
        courtsCol.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
        errorsCol.find().sort({ timestamp: -1 }).limit(40).toArray()
      ]);

      totalSessions = allSessions.length;
      dbErrors = recentErrDocs;

      const courtMap: Record<string, { code: string; name: string; count: number; activeCount: number }> = {};
      for (const c of allCourts) {
        courtMap[c.code] = { code: c.code, name: c.name, count: 0, activeCount: 0 };
      }

      for (const s of allSessions) {
        const isActive = new Date(s.expiresAt) > now && !s.terminatedAt;
        if (isActive) activeSessions++;

        const code = s.courtCode || '01';
        if (!courtMap[code]) {
          courtMap[code] = { code, name: s.courtNameSnapshot || `Sân ${code}`, count: 0, activeCount: 0 };
        }
        courtMap[code].count++;
        if (isActive) courtMap[code].activeCount++;

        // Nhận diện thiết bị
        const ua = (s.userAgent || '').toLowerCase();
        if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
          devices.ios++;
        } else if (ua.includes('android')) {
          devices.android++;
        } else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) {
          devices.desktop++;
        } else {
          devices.other++;
        }
      }

      courtBreakdown = Object.values(courtMap).sort((a, b) => Number(a.code) - Number(b.code));

      recentSessions = allSessions.slice(-15).reverse().map(s => ({
        courtCode: s.courtCode,
        courtNameSnapshot: s.courtNameSnapshot,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        terminatedAt: s.terminatedAt,
        ip: s.ip
      }));
    }
  } catch (err) {
    console.error('[Monitor Overview] DB Query Error:', err);
  }

  // Kết hợp lỗi từ cả DB và In-Memory của máy chủ chính
  const combinedErrors = [
    ...(mainTelemetry?.recentErrors || []),
    ...dbErrors.map(e => ({
      timestamp: e.timestamp,
      statusCode: e.statusCode,
      code: e.code,
      method: e.method,
      path: e.path,
      message: e.message,
      stack: e.stack
    }))
  ];

  // Loại trùng lặp error theo timestamp & path
  const uniqueErrors = Array.from(new Map(combinedErrors.map(item => [`${item.timestamp}-${item.path}-${item.code}`, item])).values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 35);

  const mappedErrors = uniqueErrors.map((e: any) => {
    const parsed = parseStackTrace(e.stack);
    return {
      timestamp: e.timestamp || new Date().toISOString(),
      statusCode: e.statusCode || 500,
      code: e.code || 'INTERNAL_ERROR',
      method: (e.method || 'GET').toUpperCase(),
      path: e.path || '/',
      message: e.message || 'Lỗi hệ thống',
      stack: e.stack || '',
      location: parsed.file !== 'Không xác định' && parsed.line ? `${parsed.file}:${parsed.line}` : (e.path || 'server/app.ts'),
      sourceFile: parsed.file,
      sourceLine: parsed.line
    };
  });

  const mem = process.memoryUsage();

  res.json({
    timestamp: new Date().toISOString(),
    mainSystem: {
      isAlive: isMainAlive,
      pingMs,
      url: MAIN_API_URL
    },
    users: {
      totalSessions,
      activeSessions,
      devices,
      recentSessions
    },
    courts: courtBreakdown,
    telemetry: mainTelemetry?.stats || {
      totalCalls: 0,
      avgLatencyMs: 0,
      successRatePercent: 100,
      endpoints: []
    },
    errors: mappedErrors,
    system: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024)
    }
  });
});

// 3. API Danh sách 16 sân và chữ ký QR HMAC
app.get('/api/courts-signatures', async (_req, res) => {
  try {
    const database = await getDatabase();
    let courtDocs: any[] = [];
    let sessionDocs: any[] = [];
    if (database) {
      const courtsCol = database.collection('courts');
      const sessionsCol = database.collection('customer_sessions');
      [courtDocs, sessionDocs] = await Promise.all([
        courtsCol.find({ deletedAt: null }).sort({ sortOrder: 1 }).toArray(),
        sessionsCol.find().toArray()
      ]);
    }

    const now = new Date();
    const courtsList = [];
    for (let i = 1; i <= 16; i++) {
      const code = String(i).padStart(2, '0');
      const dbDoc = courtDocs.find(c => c.code === code);
      const name = dbDoc?.name || `Sân ${code}`;
      const sig = signCourtCode(code);
      const courtSessions = sessionDocs.filter(s => s.courtCode === code);
      const activeSessions = courtSessions.filter(s => new Date(s.expiresAt) > now && !s.terminatedAt).length;

      courtsList.push({
        code,
        name,
        sig,
        isActive: dbDoc ? dbDoc.isActive !== false : true,
        fullUrl: `http://localhost:3000/?court=${code}&sig=${sig}`,
        totalSessions: courtSessions.length,
        activeSessions
      });
    }

    res.json({
      timestamp: new Date().toISOString(),
      secretActive: !!getSecret(),
      courts: courtsList
    });
  } catch (err: any) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// 4. API Xác thực chữ ký mã sân
app.post('/api/verify-signature', (req, res) => {
  const { courtCode, sig } = req.body || {};
  if (!courtCode) {
    return res.status(400).json({ error: true, message: 'Vui lòng cung cấp courtCode' });
  }
  const cleanCode = String(courtCode).trim().padStart(2, '0');
  const expectedSig = signCourtCode(cleanCode);
  const isValid = verifyCourtSignature(cleanCode, sig);
  res.json({
    courtCode: cleanCode,
    providedSig: sig || '',
    expectedSig,
    isValid,
    url: `http://localhost:3000/?court=${cleanCode}&sig=${expectedSig}`
  });
});

// 5. API Kiểm tra cấp phiên cho sân (Test handshake với API chính)
app.post('/api/test-court-session', async (req, res) => {
  const { courtCode, sig } = req.body || {};
  const cleanCode = String(courtCode || '01').trim().padStart(2, '0');
  const courtSig = sig || signCourtCode(cleanCode);
  const start = Date.now();

  try {
    const probeRes = await fetch(`${MAIN_API_URL}/api/sessions/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TranLuu-Monitor-CourtProbe/2.0'
      },
      body: JSON.stringify({ courtCode: cleanCode, sig: courtSig }),
      signal: AbortSignal.timeout(4000)
    });

    const elapsed = Date.now() - start;
    const data = await probeRes.json().catch(() => ({}));

    return res.status(probeRes.status).json({
      statusCode: probeRes.status,
      elapsedMs: elapsed,
      success: probeRes.ok,
      courtCode: cleanCode,
      sig: courtSig,
      sessionToken: data.sessionToken || data.token || null,
      response: data
    });
  } catch (err: any) {
    return res.status(503).json({
      statusCode: 503,
      elapsedMs: Date.now() - start,
      success: false,
      courtCode: cleanCode,
      sig: courtSig,
      error: err.message
    });
  }
});

// 6. Proxy kiểm tra trực tiếp API từ Dashboard
app.get('/api/proxy', async (req, res) => {
  const targetPath = (req.query.path as string) || '/api/health';
  const method = ((req.query.method as string) || 'GET').toUpperCase();
  const url = `${MAIN_API_URL}${targetPath.startsWith('/') ? targetPath : '/' + targetPath}`;

  try {
    const fetchRes = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TranLuu-Monitor-Probe/2.0'
      },
      signal: AbortSignal.timeout(5000)
    });

    const contentType = fetchRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await fetchRes.json();
      return res.status(fetchRes.status).json(data);
    } else {
      const text = await fetchRes.text();
      return res.status(fetchRes.status).send(text);
    }
  } catch (error) {
    return res.status(503).json({
      error: true,
      message: `Không thể kết nối tới ${url}: ${(error as Error).message}`
    });
  }
});

// 7. Khởi động máy chủ Monitor
app.listen(MONITOR_PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[Tran Luu Observability Monitor] Đang chạy độc lập tại:`);
  console.log(`   Local:   http://localhost:${MONITOR_PORT}`);
  console.log(`   Mục tiêu: ${MAIN_API_URL}`);
  console.log(`=======================================================`);
});
