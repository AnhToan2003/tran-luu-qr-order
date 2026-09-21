import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';

export interface ApiMetric {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface SystemErrorLog {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  stack?: string;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

const MAX_METRICS = 500;
const MAX_ERRORS = 200;

const recentMetrics: ApiMetric[] = [];
const recentErrors: SystemErrorLog[] = [];

/**
 * Middleware ghi nhận thời gian phản hồi và lưu vết mọi request API
 */
export function telemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const reqId = (req as any).id || Math.random().toString(36).substring(2, 10);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const metric: ApiMetric = {
      id: reqId,
      method: req.method,
      path: req.baseUrl ? `${req.baseUrl}${req.path}` : req.path,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date()
    };

    recentMetrics.push(metric);
    if (recentMetrics.length > MAX_METRICS) {
      recentMetrics.shift();
    }
  });

  next();
}

/**
 * Ghi nhận lỗi hệ thống vào bộ nhớ đệm và lưu vào MongoDB
 */
export function recordSystemError(errorData: Omit<SystemErrorLog, 'timestamp'>) {
  const log: SystemErrorLog = {
    ...errorData,
    timestamp: new Date()
  };

  recentErrors.push(log);
  if (recentErrors.length > MAX_ERRORS) {
    recentErrors.shift();
  }

  // Ghi không đồng bộ vào MongoDB system_errors
  try {
    const db = getDb();
    if (db) {
      db.collection('system_errors').insertOne(log).catch(() => {});
    }
  } catch {}
}

export function getTelemetryMetrics() {
  return [...recentMetrics];
}

export function getTelemetryErrors() {
  return [...recentErrors];
}

export function getApiStats() {
  const metrics = recentMetrics;
  const totalCalls = metrics.length;
  if (totalCalls === 0) {
    return {
      totalCalls: 0,
      avgLatencyMs: 0,
      successRatePercent: 100,
      endpoints: {}
    };
  }

  let totalLatency = 0;
  let successCount = 0;
  const endpointMap: Record<string, { calls: number; totalMs: number; errors: number }> = {};

  for (const m of metrics) {
    totalLatency += m.durationMs;
    if (m.statusCode < 400) {
      successCount++;
    }

    const key = `${m.method} ${m.path.split('?')[0]}`;
    if (!endpointMap[key]) {
      endpointMap[key] = { calls: 0, totalMs: 0, errors: 0 };
    }
    endpointMap[key].calls++;
    endpointMap[key].totalMs += m.durationMs;
    if (m.statusCode >= 400) {
      endpointMap[key].errors++;
    }
  }

  return {
    totalCalls,
    avgLatencyMs: Math.round(totalLatency / totalCalls),
    successRatePercent: Math.round((successCount / totalCalls) * 100),
    endpoints: Object.entries(endpointMap).map(([endpoint, data]) => ({
      endpoint,
      calls: data.calls,
      avgMs: Math.round(data.totalMs / data.calls),
      errorRate: Math.round((data.errors / data.calls) * 100)
    }))
  };
}
