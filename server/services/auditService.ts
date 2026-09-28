import { randomUUID } from 'node:crypto';
import { getCollections } from '../db.js';
import type { AuditLogDoc } from '../types.js';

export async function recordAuditLog(
  adminUsername: string,
  action: AuditLogDoc['action'],
  targetId?: string,
  details: Record<string, unknown> = {},
  ip?: string
): Promise<void> {
  const event = {
    auditId: randomUUID(),
    adminUsername: adminUsername || 'admin',
    action,
    targetId,
    details,
    ip,
    createdAt: new Date()
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await getCollections().auditLogs.insertOne(event);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  console.error('[AuditLog] Error recording log after retries:', (lastError as Error)?.message || 'unknown error');
}
