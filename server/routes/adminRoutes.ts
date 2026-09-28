import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { registerSettingsRoutes } from './admin/settingsRoutes.js';
import { registerAuditRoutes } from './admin/auditRoutes.js';
import { registerCategoryRoutes } from './admin/categoryRoutes.js';
import { registerOrderAdminRoutes } from './admin/orderAdminRoutes.js';
import { registerProductRoutes } from './admin/productRoutes.js';
import { registerInventoryRoutes } from './admin/inventoryRoutes.js';
import { registerCourtRoutes } from './admin/courtRoutes.js';
import { registerReportRoutes } from './admin/reportRoutes.js';
import { registerBackupRoutes } from './admin/backupRoutes.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// Register modular sub-domain routes directly onto adminRouter.
// This maintains 100% compatibility with OpenAPI contract tests,
// route stack reflection, and Swagger documentation while keeping code cleanly separated.
registerSettingsRoutes(adminRouter);
registerAuditRoutes(adminRouter);
registerCategoryRoutes(adminRouter);
registerOrderAdminRoutes(adminRouter);
registerProductRoutes(adminRouter);
registerInventoryRoutes(adminRouter);
registerCourtRoutes(adminRouter);
registerReportRoutes(adminRouter);
registerBackupRoutes(adminRouter);
