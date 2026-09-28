import type { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { requirePermission, requireActionProofFor, hashPassword, revokeUserSessions, revokeRoleSessions } from '../../auth.js';
import { getCollections, snapshotRead, transaction } from '../../db.js';
import { ApiError } from '../../errors.js';
import { productJson } from '../../serialize.js';
import { productFields, dateTimeString } from '../../validation.js';
import { invalidateCatalogCache } from '../../redis.js';
import { SYSTEM_PERMISSIONS } from '../../types.js';
import { migrateBackupToV2 } from '../../utils/backupMigration.js';
import { createRateLimitStore } from '../../rateLimitStore.js';
import { recordAuditLog } from '../../services/auditService.js';

const catalogImportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('catalog-import'),
  keyGenerator: (req) => `catalog-import:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')}`,
  message: { code: 'TOO_MANY_ATTEMPTS', message: 'Quá nhiều lần import. Vui lòng thử lại sau.' }
});

const backupExportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore('backup-export'),
  keyGenerator: (req, res) => `backup-export:${res.locals.userId || res.locals.admin}:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')}`,
  message: { code: 'TOO_MANY_ATTEMPTS', message: 'Đã xuất sao lưu quá nhiều lần. Vui lòng thử lại sau.' }
});

// ===== SAFE DATA CLEAN / PURGE HELPER =====
function parseCleanDateFilter(input: {
  startDate?: string;
  endDate?: string;
  customDate?: string;
  beforeDate?: string;
  days?: string;
  before?: string;
}): { dateFilter: Record<string, Date>; rangeLabel: string; beforeDateIso: string } {
  if (input.days === 'all' || input.days === '0') {
    return {
      dateFilter: { $lte: new Date() },
      rangeLabel: 'Toàn bộ đơn cũ đã xong & nhật ký',
      beforeDateIso: new Date().toISOString()
    };
  }

  const startDateStr = input.startDate?.trim() || '';
  const endDateStr = input.endDate?.trim() || input.customDate?.trim() || '';
  if (startDateStr || endDateStr) {
    const filter: Record<string, Date> = {};
    if (startDateStr) filter.$gte = new Date(startDateStr + 'T00:00:00+07:00');
    if (endDateStr) filter.$lte = new Date(endDateStr + 'T23:59:59.999+07:00');
    const label = startDateStr && endDateStr
      ? `Từ ${new Date(startDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')} đến ${new Date(endDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`
      : startDateStr
        ? `Từ ngày ${new Date(startDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`
        : `Trước ngày ${new Date(endDateStr + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}`;
    const iso = endDateStr
      ? new Date(endDateStr + 'T23:59:59.999+07:00').toISOString()
      : new Date().toISOString();
    return { dateFilter: filter, rangeLabel: label, beforeDateIso: iso };
  }

  const beforeStr = input.beforeDate || input.before;
  if (beforeStr) {
    const cutoff = beforeStr.includes('T') ? new Date(beforeStr) : new Date(beforeStr + 'T23:59:59.999+07:00');
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  const now = new Date();
  const vnFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [currentYear, currentMonth, currentDay] = vnFormatter.format(now).split('-').map(Number);
  const daysStr = input.days || '30';

  if (daysStr === '30' || daysStr === '1m') {
    const targetMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(currentDay, maxDays);
    const targetIsoDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    const cutoff = new Date(`${targetIsoDate}T23:59:59.999+07:00`);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (1 tháng trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  if (daysStr === '90' || daysStr === '3m') {
    let targetMonth = currentMonth - 3;
    let targetYear = currentYear;
    if (targetMonth <= 0) {
      targetMonth += 12;
      targetYear -= 1;
    }
    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(currentDay, maxDays);
    const targetIsoDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    const cutoff = new Date(`${targetIsoDate}T23:59:59.999+07:00`);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (3 tháng trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  if (daysStr === '7' || daysStr === '1w') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      dateFilter: { $lt: cutoff },
      rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')} (1 tuần trước)`,
      beforeDateIso: cutoff.toISOString()
    };
  }

  const days = parseInt(daysStr, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    dateFilter: { $lt: cutoff },
    rangeLabel: `Trước ngày ${cutoff.toLocaleDateString('vi-VN')}`,
    beforeDateIso: cutoff.toISOString()
  };
}

export function registerBackupRoutes(router: Router): void {
  router.post('/backup/full', backupExportRateLimit, requirePermission('backup'), requireActionProofFor('backup.export'), async (req, res) => {
    const c = getCollections();

    const [products, courts, orders, settings, auditLogs, inventoryMovements, orderSequences, sportsItems, sportsMovements, roles, users] = await snapshotRead(async (session) => {
      const p = await c.products.find({ deletedAt: null }, { session }).sort({ category: 1, name: 1 }).toArray();
      const ct = await c.courts.find({ deletedAt: null }, { session }).sort({ sortOrder: 1 }).toArray();
      const ord = await c.orders.find({}, { session }).sort({ createdAt: -1 }).toArray();
      const st = await c.appSettings.findOne({ key: 'system_config' }, { session });
      const al = await c.auditLogs.find({}, { session }).sort({ createdAt: -1 }).toArray();
      const im = await c.inventoryMovements.find({}, { session }).sort({ createdAt: -1 }).toArray();
      const seq = await c.appSettings.find({ key: { $regex: '^order_sequence' } }, { session }).toArray();
      const si = await c.sportsItems.find({ deletedAt: null }, { session }).sort({ category: 1, name: 1 }).toArray();
      const sm = await c.sportsMovements.find({}, { session }).sort({ createdAt: -1 }).toArray();
      const r = await c.roles.find({}, { session }).sort({ isSystem: -1, createdAt: 1 }).toArray();
      const u = await c.adminUsers.find({}, { projection: { passwordHash: 0 }, session }).sort({ createdAt: -1 }).toArray();
      return [p, ct, ord, st, al, im, seq, si, sm, r, u];
    });

    const fullBackup = {
      system: 'Sân Cầu Lông Trần Lựu',
      backupType: 'full_system',
      schemaVersion: '2.0.0',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      stats: {
        productsCount: products.length,
        sportsItemsCount: sportsItems.length,
        courtsCount: courts.length,
        ordersCount: orders.length,
        rolesCount: roles.length,
        usersCount: users.length,
        auditLogsCount: auditLogs.length,
        inventoryCount: inventoryMovements.length,
        sportsMovementsCount: sportsMovements.length,
        stockIntakeCount: inventoryMovements.filter(m => ['stock_intake', 'quick_restock', 'stock_adjustment'].includes(m.reason)).length,
        orderSequencesCount: orderSequences.length
      },
      products: products.map(productJson),
      sportsItems: sportsItems.map(item => ({
        itemId: item.itemId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        costPriceVnd: item.costPriceVnd,
        priceVnd: item.priceVnd,
        stock: item.stock,
        minStockThreshold: item.minStockThreshold ?? 5,
        isService: item.isService,
        isAvailable: item.isAvailable,
        imageSvg: item.imageSvg || '',
        tag: item.tag || ''
      })),
      courts: courts.map(court => ({ courtId: court.courtId, code: court.code, name: court.name, isActive: court.isActive, sortOrder: court.sortOrder, qrVersion: court.qrVersion ?? 0 })),
      orders: orders.map(o => ({
        id: o.orderId,
        orderId: o.orderId,
        displayCode: o.displayCode,
        clientRequestId: o.clientRequestId,
        requestFingerprint: o.requestFingerprint || null,
        orderType: o.orderType || 'drinks',
        courtId: o.courtId,
        courtName: o.courtNameSnapshot,
        customerName: o.customerName || '',
        customerPhone: o.customerPhone || '',
        customerSessionHash: o.customerSessionHash,
        paymentStatus: o.paymentStatus || 'unpaid',
        paymentMethod: o.paymentMethod || null,
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        paymentHistory: (o.paymentHistory || []).map((p: any) => ({
          from: p.from,
          to: p.to,
          paymentStatus: p.to || p.paymentStatus,
          paymentMethod: p.paymentMethod || null,
          changedBy: p.changedBy || 'system',
          reason: p.reason || null,
          at: p.at ? p.at.toISOString() : (p.changedAt ? p.changedAt.toISOString() : new Date().toISOString())
        })),
        status: o.status,
        totalVnd: o.totalVnd,
        createdAt: o.createdAt.toISOString(),
        editableUntil: o.editableUntil.toISOString(),
        acceptedAt: o.acceptedAt ? o.acceptedAt.toISOString() : null,
        preparingAt: o.preparingAt ? o.preparingAt.toISOString() : null,
        deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        cancelledAt: o.cancelledAt ? o.cancelledAt.toISOString() : null,
        cancelReason: o.cancelReason,
        items: o.items.map(i => ({
          productId: i.productId,
          name: i.nameSnapshot,
          volume: i.volumeSnapshot,
          unitPrice: i.unitPriceVnd,
          costPrice: i.costPriceVnd ?? 0,
          quantity: i.quantity,
          iceQuantity: i.iceQuantity,
          lineTotal: i.lineTotalVnd,
          itemType: i.itemType || (o.orderType === 'sports_pos' ? 'sports' : 'drink')
        }))
      })),
      roles: roles.map(r => ({
        roleId: r.roleId,
        name: r.name,
        description: r.description || '',
        permissions: r.permissions,
        isSystem: r.isSystem || false
      })),
      users: users.map(u => ({
        userId: u.userId,
        username: u.username,
        fullName: u.fullName,
        roleId: u.roleId,
        customPermissions: u.customPermissions || [],
        isActive: u.isActive
      })),
      orderSequences: orderSequences.map(s => ({
        key: s.key,
        value: {
          sequence: typeof s.value?.sequence === 'number'
            ? s.value.sequence
            : (typeof s.value === 'number' ? s.value : 1)
        }
      })),
      auditLogs,
      inventoryMovements,
      sportsMovements: sportsMovements.map(m => ({
        operationId: m.operationId,
        itemId: m.itemId,
        itemNameSnapshot: m.itemNameSnapshot,
        unitSnapshot: m.unitSnapshot,
        delta: m.delta,
        costPriceVnd: m.costPriceVnd,
        sellingPriceVnd: m.sellingPriceVnd,
        totalCostVnd: m.totalCostVnd,
        stockAfter: m.stockAfter,
        reason: m.reason,
        note: m.note || '',
        createdAt: m.createdAt
      })),
      settings: settings?.value || null
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tran_luu_full_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    await recordAuditLog(res.locals.admin, 'backup_exported', undefined, {
      products: products.length,
      courts: courts.length,
      orders: orders.length,
      users: users.length
    }, req.ip);
    res.json(fullBackup);
  });

  router.post('/catalog/import', catalogImportRateLimit, requirePermission('backup'), requireActionProofFor('catalog.import'), async (req, res) => {
    const { data: body, migrated, fromVersion } = migrateBackupToV2(req.body);

    const backupImportSchema = z.object({
      schemaVersion: z.string().optional(),
      system: z.string().optional(),
      products: z.array(z.record(z.string(), z.unknown())).optional(),
      sportsItems: z.array(z.record(z.string(), z.unknown())).optional(),
      courts: z.array(z.record(z.string(), z.unknown())).optional(),
      orders: z.array(z.record(z.string(), z.unknown())).optional(),
      roles: z.array(z.record(z.string(), z.unknown())).optional(),
      users: z.array(z.record(z.string(), z.unknown())).optional(),
      orderSequences: z.array(z.record(z.string(), z.unknown())).optional(),
      inventoryMovements: z.array(z.record(z.string(), z.unknown())).optional(),
      sportsMovements: z.array(z.record(z.string(), z.unknown())).optional(),
      auditLogs: z.array(z.record(z.string(), z.unknown())).optional(),
      settings: z.record(z.string(), z.unknown()).optional().nullable()
    }).passthrough();

    const parsedBackup = backupImportSchema.safeParse(body);
    if (!parsedBackup.success) {
      throw new ApiError(400, 'INVALID_IMPORT', 'Định dạng tệp JSON không hợp lệ');
    }

    const c = getCollections();
    const now = new Date();

    const rawProducts = Array.isArray(body) ? body : Array.isArray(body.products) ? body.products : null;
    const hasRoles = Array.isArray(body.roles) && body.roles.length > 0;
    const hasUsers = Array.isArray(body.users) && body.users.length > 0;

    if (hasRoles || hasUsers) {
      const callerPerms = (res.locals.permissions as string[]) || [];
      const canManageRbac = callerPerms.includes('*') || callerPerms.includes('rbac') || res.locals.roleId === 'admin';
      if (!canManageRbac) {
        throw new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền khôi phục vai trò (roles) hoặc tài khoản người dùng (users). Cần quyền rbac.');
      }
    }

    if (Array.isArray(body.courts) && body.courts.length > 0) {
      const seenCodes = new Set<string>();
      for (const item of body.courts) {
        if (item.code) {
          const codeStr = String(item.code).trim();
          if (seenCodes.has(codeStr)) {
            throw new ApiError(409, 'DUPLICATE', `Mã sân ${codeStr} bị trùng lặp trong tệp nhập.`);
          }
          seenCodes.add(codeStr);
          const existing = await c.courts.findOne({ code: codeStr, deletedAt: null });
          if (existing && item.courtId && existing.courtId !== item.courtId) {
            throw new ApiError(409, 'DUPLICATE', `Mã sân ${codeStr} đã tồn tại trong hệ thống với ID khác (${existing.courtId}).`);
          }
          if (item.qrVersion !== undefined && (!Number.isSafeInteger(Number(item.qrVersion)) || Number(item.qrVersion) < 0)) {
            throw new ApiError(400, 'INVALID_IMPORT_DATA', `Phiên bản QR của sân ${codeStr} không hợp lệ.`);
          }
        }
      }
    }

    if (rawProducts && rawProducts.length > 0) {
      rawProducts.forEach((item: any, idx: number) => {
        const parsed = productFields.partial({ imageSvg: true, tag: true, isAvailable: true }).safeParse(item);
        if (!parsed.success) {
          const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu sản phẩm tại dòng ${idx + 1} (${item?.name || 'không tên'}) không hợp lệ: ${details}`);
        }
      });
    }

    if (Array.isArray(body.sportsItems) && body.sportsItems.length > 0) {
      const sportsItemImportSchema = z.object({
        name: z.string().trim().min(1, 'Tên sản phẩm/dịch vụ không được để trống'),
        category: z.string().trim().min(1, 'Hạng mục không được để trống'),
        unit: z.string().optional(),
        costPriceVnd: z.coerce.number().min(0, 'Giá vốn không được âm').optional(),
        priceVnd: z.coerce.number().min(0, 'Giá bán không được âm').optional(),
        stock: z.coerce.number().min(0, 'Tồn kho không được âm').optional(),
        minStockThreshold: z.coerce.number().min(0, 'Ngưỡng cảnh báo tồn kho không được âm').optional(),
        isService: z.boolean().optional(),
        isAvailable: z.boolean().optional(),
        imageSvg: z.string().optional(),
        tag: z.string().optional()
      });

      body.sportsItems.forEach((item: any, idx: number) => {
        const parsed = sportsItemImportSchema.safeParse(item);
        if (!parsed.success) {
          const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Mặt hàng thể thao tại dòng ${idx + 1} (${item?.name || 'không tên'}) không hợp lệ: ${details}`);
        }
      });
    }

    const validPermissionIds = new Set(SYSTEM_PERMISSIONS.map(permission => permission.id));
    const validateImportedPermissions = (permissions: unknown, label: string) => {
      if (!Array.isArray(permissions)) {
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `${label} phải có danh sách quyền hợp lệ`);
      }
      const invalid = permissions.filter(permission => typeof permission !== 'string' || !validPermissionIds.has(permission as any));
      if (invalid.length > 0) {
        throw new ApiError(400, 'INVALID_IMPORT_DATA', `${label} chứa quyền không hợp lệ: ${invalid.map(String).join(', ')}`);
      }
    };

    if (Array.isArray(body.roles) && body.roles.length > 0) {
      body.roles.forEach((r: any, idx: number) => {
        if (!r.roleId || !r.name || !Array.isArray(r.permissions)) {
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu vai trò tại dòng ${idx + 1} không hợp lệ (cần roleId, name, permissions)`);
        }
        validateImportedPermissions(r.permissions, `Vai trò "${r.name}"`);
        if (r.roleId === 'admin' || r.isSystem === true) {
          throw new ApiError(400, 'PROTECTED_SYSTEM_ROLE', 'Không được ghi đè vai trò hệ thống qua tệp import');
        }
      });
    }

    if (Array.isArray(body.orders)) {
      const importedOrderSchema = z.object({
        orderId: z.string().trim().min(1).optional(),
        id: z.string().trim().min(1).optional(),
        displayCode: z.string().trim().min(1).optional(),
        courtId: z.string().trim().min(1),
        orderType: z.enum(['drinks', 'sports_pos']).optional(),
        status: z.enum(['new', 'accepted', 'preparing', 'delivered', 'cancelled']).optional(),
        paymentStatus: z.enum(['unpaid', 'paid']).optional(),
        paymentMethod: z.enum(['cash', 'transfer']).nullable().optional(),
        totalVnd: z.coerce.number().finite().min(0),
        items: z.array(z.object({
          productId: z.string().trim().min(1),
          quantity: z.coerce.number().int().min(1).max(100_000),
          iceQuantity: z.coerce.number().int().min(0).optional(),
          unitPriceVnd: z.coerce.number().finite().min(0).optional(),
          unitPrice: z.coerce.number().finite().min(0).optional(),
          costPriceVnd: z.coerce.number().finite().min(0).optional(),
          lineTotalVnd: z.coerce.number().finite().min(0).optional(),
          lineTotal: z.coerce.number().finite().min(0).optional(),
          itemType: z.enum(['drink', 'sports', 'service']).optional()
        }).passthrough()).min(1)
      }).passthrough().refine(order => Boolean(order.orderId || order.id), { message: 'Thiếu orderId' });

      body.orders.forEach((order: unknown, idx: number) => {
        const result = importedOrderSchema.safeParse(order);
        if (!result.success) {
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Đơn hàng tại dòng ${idx + 1} không hợp lệ: ${result.error.issues.map(issue => issue.message).join(', ')}`);
        }
        const calculated = result.data.items.reduce((sum, item) => sum + Number(item.lineTotalVnd ?? item.lineTotal ?? ((item.unitPriceVnd ?? item.unitPrice ?? 0) * item.quantity)), 0);
        if (Math.abs(calculated - result.data.totalVnd) > 1) {
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Đơn hàng tại dòng ${idx + 1} có tổng tiền không khớp các dòng hàng`);
        }
      });
    }

    const movementSchema = z.object({
      operationId: z.string().trim().min(1),
      delta: z.coerce.number().finite(),
      stockAfter: z.coerce.number().finite().min(0),
      createdAt: dateTimeString.optional()
    }).passthrough();
    for (const [label, movements] of [
      ['Biến động kho nước', body.inventoryMovements],
      ['Biến động kho thể thao', body.sportsMovements]
    ] as const) {
      if (!Array.isArray(movements)) continue;
      movements.forEach((movement: unknown, idx: number) => {
        const result = movementSchema.safeParse(movement);
        if (!result.success) throw new ApiError(400, 'INVALID_IMPORT_DATA', `${label} tại dòng ${idx + 1} không hợp lệ`);
      });
    }

    if (body.settings) {
      const settingsResult = z.object({
        isAcceptingOrders: z.boolean().optional(),
        chimeIntervalSeconds: z.coerce.number().int().min(1).max(3600).optional(),
        editWindowSeconds: z.coerce.number().int().min(0).max(86400).optional()
      }).passthrough().safeParse(body.settings);
      if (!settingsResult.success) throw new ApiError(400, 'INVALID_IMPORT_DATA', 'Cấu hình hệ thống trong tệp import không hợp lệ');
    }

    if (Array.isArray(body.users) && body.users.length > 0) {
      const userImportSchema = z.object({
        userId: z.string().trim().min(1, 'UserId không hợp lệ'),
        username: z.string().trim().min(1, 'Username không hợp lệ'),
        roleId: z.string().trim().min(1, 'RoleId không hợp lệ')
      });

      const existingRoles = await c.roles.find({}, { projection: { roleId: 1 } }).toArray();
      const allowedRoleIds = new Set<string>(existingRoles.map(r => r.roleId));
      allowedRoleIds.add('admin');
      if (Array.isArray(body.roles)) {
        body.roles.forEach((r: any) => {
          if (r && r.roleId) allowedRoleIds.add(r.roleId);
        });
      }

      body.users.forEach((u: any, idx: number) => {
        const parsed = userImportSchema.safeParse(u);
        if (!parsed.success) {
          const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Dữ liệu người dùng tại dòng ${idx + 1} (${u?.username || 'không tên'}) không hợp lệ: ${details}`);
        }
        if (!allowedRoleIds.has(u.roleId)) {
          throw new ApiError(400, 'INVALID_IMPORT_DATA', `Người dùng "${u.username}" tại dòng ${idx + 1} có roleId "${u.roleId}" không tồn tại trong hệ thống hoặc tệp nhập`);
        }
        validateImportedPermissions(u.customPermissions || [], `Tài khoản "${u.username}"`);
        if (u.roleId === 'admin') {
          throw new ApiError(400, 'PROTECTED_SYSTEM_ROLE', 'Không được gán vai trò hệ thống admin qua tệp import');
        }
      });
    }

    let importedProducts = 0;
    let importedCourts = 0;
    let importedOrders = 0;
    let importedSequences = 0;
    let importedSettings = 0;
    let importedMovements = 0;
    let importedAudit = 0;
    let importedSportsItems = 0;
    let importedSportsMovements = 0;
    let importedRoles = 0;
    let importedUsers = 0;
    const temporaryCredentials: Array<{ username: string; userId: string; tempPassword: string }> = [];

    await transaction(async session => {
      const rawProductsList = Array.isArray(body) ? body : Array.isArray(body.products) ? body.products : null;
      if (rawProductsList && rawProductsList.length > 0) {
        for (const item of rawProductsList) {
          const parsed = productFields.partial({ imageSvg: true, tag: true, isAvailable: true }).safeParse(item);
          if (!parsed.success) continue;
          const prodId = item.productId || item.id || randomUUID();
          const costPriceVnd = (item.costPriceVnd !== undefined) ? Number(item.costPriceVnd) : (parsed.data.costPriceVnd !== undefined ? Number(parsed.data.costPriceVnd) : undefined);

          const updateSet: Record<string, any> = {
            name: parsed.data.name,
            volume: parsed.data.volume,
            category: parsed.data.category,
            priceVnd: parsed.data.priceVnd,
            tag: parsed.data.tag || '',
            imageSvg: parsed.data.imageSvg || '',
            isAvailable: parsed.data.isAvailable !== false,
            deletedAt: null,
            updatedAt: now
          };
          if (costPriceVnd !== undefined) {
            updateSet.costPriceVnd = costPriceVnd;
          }

          await c.products.updateOne(
            { productId: prodId },
            {
              $set: updateSet,
              $setOnInsert: {
                productId: prodId,
                stock: parsed.data.stock ?? 0,
                version: 1,
                createdAt: now
              }
            },
            { session, upsert: true }
          );
          importedProducts++;
        }
      }

      if (Array.isArray(body.courts) && body.courts.length > 0) {
        for (const item of body.courts) {
          if (!item.code || !item.name) continue;
          const courtId = item.courtId || item.id || randomUUID();
          await c.courts.updateOne(
            { courtId },
            {
              $set: {
                code: String(item.code),
                name: String(item.name),
                sortOrder: Number(item.sortOrder || item.code),
                isActive: item.isActive !== false,
                qrVersion: item.qrVersion === undefined ? 0 : Number(item.qrVersion),
                deletedAt: null,
                updatedAt: now
              },
              $setOnInsert: {
                courtId,
                createdAt: now
              }
            },
            { session, upsert: true }
          );
          importedCourts++;
        }
      }

      if (Array.isArray(body.orders) && body.orders.length > 0) {
        for (const o of body.orders) {
          if (!o.orderId && !o.id) continue;
          const orderId = o.orderId || o.id;
          const existing = await c.orders.findOne({ orderId }, { session });
          if (!existing && o.courtId && Array.isArray(o.items)) {
            await c.orders.insertOne({
              orderId,
              displayCode: o.displayCode || `TL-${orderId.slice(-4)}`,
              clientRequestId: o.clientRequestId || randomUUID(),
              requestFingerprint: o.requestFingerprint || null,
              orderType: o.orderType || 'drinks',
              courtId: o.courtId,
              courtNameSnapshot: o.courtName || o.courtNameSnapshot || '',
              customerName: o.customerName || '',
              customerPhone: o.customerPhone || '',
              customerSessionHash: o.customerSessionHash || 'restored',
              paymentStatus: o.paymentStatus || 'unpaid',
              paymentMethod: o.paymentMethod || null,
              paidAt: o.paidAt ? new Date(o.paidAt) : null,
              status: o.status || 'delivered',
              totalVnd: Number(o.totalVnd) || 0,
              version: Number(o.version) || 1,
              items: o.items.map((i: any) => ({
                productId: i.productId,
                nameSnapshot: i.name || i.nameSnapshot || '',
                volumeSnapshot: i.volume || i.volumeSnapshot || '',
                unitPriceVnd: Number(i.unitPrice || i.unitPriceVnd) || 0,
                costPriceVnd: Number(i.costPrice || i.costPriceVnd) || 0,
                quantity: Number(i.quantity) || 1,
                iceQuantity: Number(i.iceQuantity) || 0,
                lineTotalVnd: Number(i.lineTotal || i.lineTotalVnd) || 0,
                itemType: i.itemType || (o.orderType === 'sports_pos' ? 'sports' : 'drink')
              })),
              createdAt: o.createdAt ? new Date(o.createdAt) : now,
              updatedAt: o.updatedAt ? new Date(o.updatedAt) : now,
              editableUntil: o.editableUntil ? new Date(o.editableUntil) : now,
              acceptedAt: o.acceptedAt ? new Date(o.acceptedAt) : null,
              preparingAt: o.preparingAt ? new Date(o.preparingAt) : null,
              deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
              cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
              cancelReason: o.cancelReason || null,
              paymentHistory: Array.isArray(o.paymentHistory) ? o.paymentHistory.map((p: any) => ({
                from: p.from,
                to: p.to || p.paymentStatus,
                paymentStatus: p.to || p.paymentStatus,
                paymentMethod: p.paymentMethod || null,
                changedBy: p.changedBy || 'import',
                reason: p.reason || null,
                at: p.at ? new Date(p.at) : (p.changedAt ? new Date(p.changedAt) : now)
              })) : []
            }, { session });
            importedOrders++;
          }
        }
      }

      if (Array.isArray(body.orderSequences) && body.orderSequences.length > 0) {
        for (const seq of body.orderSequences) {
          if (seq && typeof seq.key === 'string') {
            const seqNum = typeof seq.value === 'number'
              ? seq.value
              : (typeof seq.value?.sequence === 'number' ? seq.value.sequence : null);
            if (typeof seqNum === 'number') {
              await c.appSettings.updateOne(
                { key: seq.key },
                {
                  $max: { 'value.sequence': seqNum },
                  $set: { updatedAt: now },
                  $setOnInsert: { key: seq.key }
                },
                { session, upsert: true }
              );
              importedSequences++;
            }
          }
        }
      }

      if (body.settings && typeof body.settings === 'object') {
        const updateFields: Record<string, any> = { updatedAt: now };
        if (body.settings.isAcceptingOrders !== undefined) {
          updateFields['value.isAcceptingOrders'] = Boolean(body.settings.isAcceptingOrders);
        }
        if (body.settings.chimeIntervalSeconds !== undefined) {
          updateFields['value.chimeIntervalSeconds'] = Number(body.settings.chimeIntervalSeconds);
        }
        if (body.settings.editWindowSeconds !== undefined) {
          updateFields['value.editWindowSeconds'] = Number(body.settings.editWindowSeconds);
        }
        await c.appSettings.updateOne(
          { key: 'system_config' },
          { $set: updateFields, $setOnInsert: { key: 'system_config' } },
          { session, upsert: true }
        );
        importedSettings++;
      }

      const rawMovements = Array.isArray(body.inventoryMovements) ? body.inventoryMovements : (Array.isArray(body.inventory) ? body.inventory : null);
      if (rawMovements && rawMovements.length > 0) {
        for (const mov of rawMovements) {
          if (mov.operationId && mov.productId && typeof mov.delta === 'number') {
            const existing = await c.inventoryMovements.findOne({ operationId: mov.operationId }, { session });
            if (!existing) {
              await c.inventoryMovements.insertOne({
                productId: mov.productId,
                delta: Number(mov.delta),
                reason: mov.reason || 'stock_intake',
                orderId: mov.orderId || null,
                operationId: mov.operationId,
                stockAfter: Number(mov.stockAfter) || 0,
                productNameSnapshot: mov.productNameSnapshot || '',
                volumeSnapshot: mov.volumeSnapshot || '',
                costPriceVnd: Number(mov.costPriceVnd) || 0,
                sellingPriceVnd: Number(mov.sellingPriceVnd) || 0,
                totalCostVnd: Number(mov.totalCostVnd) || 0,
                note: mov.note || '',
                createdAt: mov.createdAt ? new Date(mov.createdAt) : now
              }, { session });
              importedMovements++;
            }
          }
        }
      }

      if (Array.isArray(body.auditLogs) && body.auditLogs.length > 0) {
        for (const log of body.auditLogs) {
          if (log.auditId && log.adminUsername && log.action) {
            const existing = await c.auditLogs.findOne({ auditId: log.auditId }, { session });
            if (!existing) {
              await c.auditLogs.insertOne({
                auditId: log.auditId,
                adminUsername: log.adminUsername,
                action: log.action,
                targetId: log.targetId,
                details: log.details || {},
                ip: log.ip,
                createdAt: log.createdAt ? new Date(log.createdAt) : now
              }, { session });
              importedAudit++;
            }
          }
        }
      }

      if (Array.isArray(body.sportsItems) && body.sportsItems.length > 0) {
        for (const item of body.sportsItems) {
          if (!item.name || !item.category) continue;
          const itemId = item.itemId || item.id || randomUUID();
          await c.sportsItems.updateOne(
            { itemId },
            {
              $set: {
                name: item.name,
                category: item.category,
                unit: item.unit || 'Cái',
                costPriceVnd: typeof item.costPriceVnd === 'number'
                  ? Math.max(0, item.costPriceVnd)
                  : (!isNaN(Number(item.costPriceVnd)) ? Math.max(0, Number(item.costPriceVnd)) : 0),
                priceVnd: typeof item.priceVnd === 'number'
                  ? Math.max(0, item.priceVnd)
                  : (!isNaN(Number(item.priceVnd)) ? Math.max(0, Number(item.priceVnd)) : 0),
                minStockThreshold: item.minStockThreshold !== undefined && item.minStockThreshold !== null && !isNaN(Number(item.minStockThreshold))
                  ? Math.max(0, Number(item.minStockThreshold))
                  : 5,
                isService: Boolean(item.isService || item.category === 'service'),
                isAvailable: item.isAvailable !== false,
                imageSvg: item.imageSvg || '',
                tag: item.tag || '',
                deletedAt: null,
                updatedAt: now
              },
              $setOnInsert: {
                itemId,
                stock: item.stock !== undefined && item.stock !== null && !isNaN(Number(item.stock))
                  ? Math.max(0, Number(item.stock))
                  : 0,
                createdAt: now
              }
            },
            { session, upsert: true }
          );
          importedSportsItems++;
        }
      }

      if (Array.isArray(body.sportsMovements) && body.sportsMovements.length > 0) {
        for (const mov of body.sportsMovements) {
          if (mov.operationId && mov.itemId) {
            const existing = await c.sportsMovements.findOne({ operationId: mov.operationId }, { session });
            if (!existing) {
              await c.sportsMovements.insertOne({
                operationId: mov.operationId,
                itemId: mov.itemId,
                itemNameSnapshot: mov.itemNameSnapshot || mov.itemName || '',
                unitSnapshot: mov.unitSnapshot || mov.unit || 'Cái',
                delta: Number(mov.delta) || 0,
                costPriceVnd: Number(mov.costPriceVnd) || 0,
                sellingPriceVnd: Number(mov.sellingPriceVnd) || 0,
                totalCostVnd: Number(mov.totalCostVnd) || 0,
                stockAfter: Number(mov.stockAfter) || 0,
                reason: mov.reason || 'stock_intake',
                note: mov.note || '',
                createdAt: mov.createdAt ? new Date(mov.createdAt) : now
              }, { session });
              importedSportsMovements++;
            }
          }
        }
      }

      if (Array.isArray(body.roles) && body.roles.length > 0) {
        for (const r of body.roles) {
          if (!r.roleId || !r.name || !Array.isArray(r.permissions)) continue;
          await c.roles.updateOne(
            { roleId: r.roleId },
            {
              $set: {
                name: String(r.name),
                description: r.description ? String(r.description) : '',
                permissions: r.permissions,
                isSystem: Boolean(r.isSystem),
                updatedAt: now
              },
              $setOnInsert: {
                roleId: r.roleId,
                createdAt: now
              }
            },
            { session, upsert: true }
          );
          importedRoles++;
        }
      }

      if (Array.isArray(body.users) && body.users.length > 0) {
        for (const u of body.users) {
          if (!u.userId || !u.username || !u.roleId) continue;
          const updateSet: Record<string, any> = {
            username: String(u.username).trim().toLowerCase(),
            fullName: u.fullName ? String(u.fullName).trim() : 'Người dùng hệ thống',
            roleId: String(u.roleId).trim(),
            customPermissions: Array.isArray(u.customPermissions) ? u.customPermissions : [],
            isActive: u.isActive !== false,
            updatedAt: now
          };
          const existingUser = await c.adminUsers.findOne({ userId: u.userId }, { session });
          if (!existingUser) {
            const tempPassword = 'Temp@' + randomUUID().replace(/-/g, '').slice(0, 8);
            updateSet.passwordHash = await hashPassword(tempPassword);
            updateSet.mustChangePassword = true;
            updateSet.createdAt = now;
            await c.adminUsers.insertOne({
              userId: u.userId,
              ...updateSet
            } as any, { session });
            temporaryCredentials.push({ username: u.username, userId: u.userId, tempPassword });
          } else {
            await c.adminUsers.updateOne({ userId: u.userId }, { $set: updateSet }, { session });
          }
          importedUsers++;
        }
      }
    });

    if (importedRoles > 0 && Array.isArray(body.roles)) {
      for (const r of body.roles) {
        if (r.roleId) await revokeRoleSessions(r.roleId);
      }
    }
    if (importedUsers > 0 && Array.isArray(body.users)) {
      for (const u of body.users) {
        if (u.userId) await revokeUserSessions(u.userId);
      }
    }

    if (importedProducts === 0 && importedCourts === 0 && importedOrders === 0 && importedSequences === 0 && importedSettings === 0 && importedMovements === 0 && importedAudit === 0 && importedSportsItems === 0 && importedSportsMovements === 0 && importedRoles === 0 && importedUsers === 0) {
      if (body.archiveType === 'periodic_cleanup') {
        const stats = body.stats;
        const count = (stats?.ordersCount || 0) + (body.orders?.length || 0);
        if (count === 0) {
          throw new ApiError(
            400,
            'EMPTY_ARCHIVE',
            `Tệp bạn tải lên là "Bản lưu trữ dữ liệu cũ" nhưng đang rỗng (0 đơn hàng do toàn bộ đơn trên hệ thống đều là đơn mới). Tệp này không chứa danh mục sản phẩm. Để sao lưu và khôi phục sản phẩm, vui lòng bấm nút "Tải sao lưu danh mục" ở thẻ bên trái!`
          );
        }
      }
      throw new ApiError(
        400,
        'INVALID_IMPORT',
        'Tệp JSON không chứa danh sách sản phẩm hay đơn hàng hợp lệ. Vui lòng chọn tệp sao lưu do hệ thống tạo (tran_luu_catalog_...json hoặc tran_luu_full_backup_...json).'
      );
    }

    const summaryParts: string[] = [];
    if (importedProducts > 0) summaryParts.push(`${importedProducts} sản phẩm nước`);
    if (importedSportsItems > 0) summaryParts.push(`${importedSportsItems} mặt hàng/dịch vụ thể thao`);
    if (importedCourts > 0) summaryParts.push(`${importedCourts} sân`);
    if (importedOrders > 0) summaryParts.push(`${importedOrders} đơn hàng`);
    if (importedSequences > 0) summaryParts.push(`${importedSequences} bộ đếm mã đơn`);
    if (importedSettings > 0) summaryParts.push('cấu hình hệ thống');
    if (importedMovements > 0) summaryParts.push(`${importedMovements} biến động kho nước`);
    if (importedSportsMovements > 0) summaryParts.push(`${importedSportsMovements} biến động kho thể thao`);
    if (importedAudit > 0) summaryParts.push(`${importedAudit} nhật ký`);
    if (importedRoles > 0) summaryParts.push(`${importedRoles} vai trò`);
    if (importedUsers > 0) summaryParts.push(`${importedUsers} tài khoản người dùng`);
    const summaryMsg = summaryParts.join(', ');

    await invalidateCatalogCache();
    await recordAuditLog(res.locals.admin, 'catalog_import', undefined, { importedProducts, importedSportsItems, importedCourts, importedOrders, importedSequences, importedSettings, importedMovements, importedSportsMovements, importedRoles, importedUsers }, req.ip);
    res.json({
      ok: true,
      migrated,
      fromVersion,
      schemaVersion: '2.0.0',
      importedCount: importedProducts + importedSportsItems,
      importedProducts,
      importedSportsItems,
      importedCourts,
      importedOrders,
      importedSequences,
      importedSettings,
      importedMovements,
      importedSportsMovements,
      importedRoles,
      importedUsers,
      temporaryCredentials,
      message: `Đã khôi phục thành công: ${summaryMsg}!${temporaryCredentials.length > 0 ? ` (Đã tạo ${temporaryCredentials.length} mật khẩu tạm cho tài khoản mới)` : ''}`
    });
  });

  router.get('/clean/preview', requirePermission('backup'), async (req, res) => {
    const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(req.query as any);
    const c = getCollections();
    const [ordersCount, inventoryCount, auditLogsCount, activeOrdersPreserved, intakeCount, sportsMovementsCount] = await Promise.all([
      c.orders.countDocuments({
        createdAt: dateFilter,
        $or: [
          { status: 'cancelled' },
          { status: 'delivered', paymentStatus: 'paid' }
        ]
      }),
      c.inventoryMovements.countDocuments({ createdAt: dateFilter }),
      c.auditLogs.countDocuments({ createdAt: dateFilter }),
      c.orders.countDocuments({
        $or: [
          { status: { $in: ['new', 'accepted', 'preparing'] } },
          { status: 'delivered', paymentStatus: { $ne: 'paid' } }
        ]
      }),
      c.inventoryMovements.countDocuments({
        createdAt: dateFilter,
        reason: { $in: ['stock_intake', 'quick_restock', 'stock_adjustment'] }
      }),
      c.sportsMovements.countDocuments({ createdAt: dateFilter })
    ]);

    res.json({
      rangeLabel,
      beforeDate: beforeDateIso,
      ordersCount,
      inventoryCount: inventoryCount + sportsMovementsCount,
      intakeCount,
      auditLogsCount,
      activeOrdersPreserved
    });
  });

  router.post('/clean/purge', requirePermission('backup'), requireActionProofFor('data.purge'), async (req, res) => {
    const schema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      beforeDate: z.string().optional(),
      days: z.string().optional(),
      customDate: z.string().optional(),
      includeOrders: z.boolean().default(true),
      includeInventory: z.boolean().default(true),
      includeAuditLogs: z.boolean().default(true)
    });
    const input = schema.parse(req.body);
    const { dateFilter, rangeLabel, beforeDateIso } = parseCleanDateFilter(input);

    const c = getCollections();
    let deletedOrders = 0;
    let deletedInventory = 0;
    let deletedIntake = 0;
    let deletedAuditLogs = 0;

    await transaction(async session => {
      if (input.includeOrders) {
        const r = await c.orders.deleteMany({
          createdAt: dateFilter,
          $or: [
            { status: 'cancelled' },
            { status: 'delivered', paymentStatus: 'paid' }
          ]
        }, { session });
        deletedOrders = r.deletedCount;
      }

      if (input.includeInventory) {
        deletedIntake = await c.inventoryMovements.countDocuments({
          createdAt: dateFilter,
          reason: { $in: ['stock_intake', 'quick_restock', 'stock_adjustment'] }
        }, { session });
        const r = await c.inventoryMovements.deleteMany({
          createdAt: dateFilter
        }, { session });
        const rSports = await c.sportsMovements.deleteMany({
          createdAt: dateFilter
        }, { session });
        deletedInventory = r.deletedCount + rSports.deletedCount;
      }

      if (input.includeAuditLogs) {
        const r = await c.auditLogs.deleteMany({
          createdAt: dateFilter
        }, { session });
        deletedAuditLogs = r.deletedCount;
      }
    });

    await recordAuditLog(
      res.locals.admin,
      'data_cleaned',
      undefined,
      {
        rangeLabel,
        beforeDate: beforeDateIso,
        cleaned: {
          ordersDeleted: deletedOrders,
          inventoryMovementsDeleted: deletedInventory,
          stockIntakeDeleted: deletedIntake,
          auditLogsDeleted: deletedAuditLogs
        }
      },
      req.ip
    );

    res.json({
      ok: true,
      rangeLabel,
      deletedOrders,
      deletedInventory,
      deletedIntake,
      deletedAuditLogs,
      cleaned: {
        ordersDeleted: deletedOrders,
        inventoryMovementsDeleted: deletedInventory,
        stockIntakeDeleted: deletedIntake,
        auditLogsDeleted: deletedAuditLogs
      }
    });
  });
}
