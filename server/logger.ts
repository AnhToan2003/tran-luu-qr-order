import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const value = String(process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}

function shouldLog(level: LogLevel) {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[configuredLevel()];
}

function redactString(value: string) {
  return value
    .replace(/((?:mongodb(?:\+srv)?|redis):\/\/)[^\s@]+@/gi, '$1[REDACTED]@')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]');
}

function redactValue(value: unknown, key = ''): unknown {
  if (/authorization|cookie|password|secret|token|api[-_]?key|signature/i.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
  }
  return value;
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'tran-luu-qr-order',
    environment: process.env.NODE_ENV || 'development',
    event,
    ...redactValue(fields) as Record<string, unknown>,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logDebug = (event: string, fields?: Record<string, unknown>) => log('debug', event, fields);
export const logInfo = (event: string, fields?: Record<string, unknown>) => log('info', event, fields);
export const logWarn = (event: string, fields?: Record<string, unknown>) => log('warn', event, fields);

export function logError(event: string, fields: Record<string, unknown> = {}) {
  const safeFields = { ...fields };
  if (process.env.NODE_ENV === 'production' && process.env.LOG_INCLUDE_STACK !== 'true') {
    delete safeFields.stack;
  }
  log('error', event, safeFields);
}

/**
 * Adds a stable request ID and emits query-safe JSON access logs to stdout.
 * Railway can search these fields without an in-app monitoring dashboard.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawRequestId = req.headers['x-request-id'];
  const requestId = typeof rawRequestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(rawRequestId)
    ? rawRequestId
    : randomUUID();
  (req as Request & { id?: string }).id = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    const statusCode = res.statusCode;
    const isHealth = req.path === '/api/health';
    const logRequests = process.env.LOG_REQUESTS === 'true';
    if (isHealth && !logRequests) return;
    if (!logRequests && statusCode < 400) return;
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    log(level, 'http.request', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs: Date.now() - startedAt,
      userAgent: req.headers['user-agent'] || undefined,
    });
  });
  next();
}
