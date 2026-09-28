import type { Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireActionProofFor } from '../../auth.js';
import { getCollections } from '../../db.js';
import { recordAuditLog } from '../../services/auditService.js';

export function registerSettingsRoutes(router: Router): void {
  // Every authenticated staff account may read operational status because the
  // shared header displays it. Mutating the status remains restricted below.
  router.get('/settings', async (_req, res) => {
    res.json((await getCollections().appSettings.findOne({ key: 'system_config' }))?.value);
  });

  router.patch('/settings', requirePermission(['orders', 'rbac']), requireActionProofFor('settings'), async (req, res) => {
    const value = z.object({ isAcceptingOrders: z.boolean() }).strict().parse(req.body);
    await getCollections().appSettings.updateOne(
      { key: 'system_config' },
      { $set: { 'value.isAcceptingOrders': value.isAcceptingOrders, updatedAt: new Date() } }
    );
    await recordAuditLog(res.locals.admin, 'settings_update', 'system_config', { isAcceptingOrders: value.isAcceptingOrders }, req.ip);
    res.json(value);
  });
}
