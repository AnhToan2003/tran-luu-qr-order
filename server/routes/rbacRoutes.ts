import { Router } from 'express';
import { z } from 'zod';
import { getCollections, getDb } from '../db.js';
import { requirePermission, requireActionProofFor, hashPassword, revokeUserSessions, revokeRoleSessions, validatePasswordStrength } from '../auth.js';
import { SYSTEM_PERMISSIONS, type SystemPermission, type RoleDoc, type AdminUserDoc } from '../types.js';
import { ApiError } from '../errors.js';

export const rbacRouter = Router();

// Tất cả các route bên dưới đều bắt buộc quyền 'rbac'
rbacRouter.use(requirePermission('rbac'));

function assertCanDelegatePermissions(res: any, permissions: readonly string[]): void {
  const callerPermissions = (res.locals.permissions as string[] | undefined) || [];
  const isFullAdmin = callerPermissions.includes('*') || res.locals.roleId === 'admin' || !res.locals.userId;
  if (isFullAdmin) return;

  // An RBAC manager may only delegate permissions they already possess. This
  // prevents a staff account with the rbac flag from creating a new full-admin
  // account and then using it to bypass the rest of the permission matrix.
  if (!permissions.every(permission => callerPermissions.includes(permission))) {
    throw new ApiError(403, 'PERMISSION_ESCALATION', 'Không thể cấp quyền mà tài khoản hiện tại không sở hữu.');
  }
}

function assertCanAssignRole(res: any, roleId: string, permissions: readonly string[]): void {
  const callerPermissions = (res.locals.permissions as string[] | undefined) || [];
  const isFullAdmin = callerPermissions.includes('*') || res.locals.roleId === 'admin' || !res.locals.userId;
  if (roleId === 'admin' && !isFullAdmin) {
    throw new ApiError(403, 'PERMISSION_ESCALATION', 'Chỉ quản trị viên toàn quyền mới được gán vai trò admin.');
  }
  assertCanDelegatePermissions(res, permissions);
}

/**
 * Prevent an RBAC manager from operating on an account with equal or higher
 * privilege.  Permission checks on the route alone are insufficient because
 * resetting a target's password or deleting that target can otherwise turn
 * into a privilege-escalation or administrative lockout.
 */
async function assertCanManageTarget(res: any, target: AdminUserDoc, c: ReturnType<typeof getCollections>): Promise<void> {
  const callerPermissions = (res.locals.permissions as string[] | undefined) || [];
  const isFullAdmin = callerPermissions.includes('*') || res.locals.roleId === 'admin' || !res.locals.userId;
  if (isFullAdmin) return;

  if (target.roleId === 'admin' || target.userId === res.locals.userId) {
    throw new ApiError(403, 'PROTECTED_USER', 'Chỉ quản trị viên toàn quyền mới được quản lý tài khoản này.');
  }

  const targetRole = await c.roles.findOne({ roleId: target.roleId });
  const targetPermissions = targetRole?.permissions || [];
  if (!targetRole || !targetPermissions.every(permission => callerPermissions.includes(permission))) {
    throw new ApiError(403, 'PERMISSION_ESCALATION', 'Không thể quản lý tài khoản có quyền cao hơn tài khoản hiện tại.');
  }
}

/**
 * 1. Lấy danh sách định nghĩa quyền của hệ thống (phân theo danh mục)
 */
rbacRouter.get('/permissions', (_req, res) => {
  res.json({
    permissions: SYSTEM_PERMISSIONS
  });
});

/**
 * 2. Lấy danh sách Roles
 */
rbacRouter.get('/roles', async (_req, res) => {
  const c = getCollections();
  const roles = await c.roles.find({}).sort({ createdAt: 1 }).toArray();
  res.json({ roles });
});

// P1/Issue #7 FIX: Validate permissions against known SYSTEM_PERMISSIONS — reject any unknown string
const VALID_PERMISSION_IDS = SYSTEM_PERMISSIONS.map(p => p.id) as [string, ...string[]];
const permissionsSchema = z.array(
  z.enum(VALID_PERMISSION_IDS as [SystemPermission, ...SystemPermission[]])
)
  .transform(arr => [...new Set(arr)])   // Deduplicate FIRST
  .refine(arr => arr.length >= 1, 'Vai trò phải có ít nhất 1 quyền')
  .refine(arr => arr.every(p => p.trim() !== ''), 'Permissions không được rỗng');

/**
 * 3. Tạo Role mới
 */
rbacRouter.post('/roles', requireActionProofFor('rbac.manage'), async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Tên vai trò tối thiểu 2 ký tự').max(50),
    description: z.string().trim().max(200).optional().default(''),
    permissions: permissionsSchema  // P1/Issue #7 FIX: strict enum validation
  });

  const body = schema.parse(req.body);
  assertCanDelegatePermissions(res, body.permissions);
  const c = getCollections();

  // Tạo roleId duy nhất
  const slug = body.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const roleId = `role_${slug}_${Date.now().toString(36)}`;

  const existing = await c.roles.findOne({ name: body.name });
  if (existing) {
    throw new ApiError(400, 'ROLE_EXISTS', 'Tên vai trò này đã tồn tại trong hệ thống');
  }

  const now = new Date();
  const newRole: RoleDoc = {
    roleId,
    name: body.name,
    description: body.description,
    permissions: body.permissions as SystemPermission[],
    isSystem: false,
    createdAt: now,
    updatedAt: now
  };

  await c.roles.insertOne(newRole);
  res.status(201).json({ role: newRole });
});

/**
 * 4. Cập nhật Role
 */
rbacRouter.put('/roles/:roleId', requireActionProofFor('rbac.manage'), async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().max(200).optional(),
    permissions: permissionsSchema  // P1/Issue #7 FIX: strict enum validation
  });

  const roleId = String(req.params.roleId);
  const body = schema.parse(req.body);
  const c = getCollections();

  const role = await c.roles.findOne({ roleId });
  if (!role) {
    throw new ApiError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò cần sửa');
  }

  if (role.roleId === 'admin' && res.locals.userId) {
    throw new ApiError(403, 'PROTECTED_ROLE', 'Chỉ tài khoản quản trị hệ thống mới được sửa vai trò toàn quyền.');
  }
  assertCanDelegatePermissions(res, body.permissions);

  // Nếu là role admin hệ thống, luôn đảm bảo quyền 'rbac' tồn tại
  let finalPermissions = body.permissions as SystemPermission[];
  if (role.roleId === 'admin' && !finalPermissions.includes('rbac')) {
    finalPermissions = [...finalPermissions, 'rbac'];
  }

  const now = new Date();
  await c.roles.updateOne(
    { roleId },
    {
      $set: {
        name: body.name,
        description: body.description ?? role.description,
        permissions: finalPermissions,
        updatedAt: now
      }
    }
  );

  await revokeRoleSessions(roleId);

  const updated = await c.roles.findOne({ roleId });
  res.json({ role: updated });
});

/**
 * 5. Xóa Role
 */
rbacRouter.delete('/roles/:roleId', requireActionProofFor('rbac.manage'), async (req, res) => {
  const roleId = String(req.params.roleId);
  const c = getCollections();

  const role = await c.roles.findOne({ roleId });
  if (!role) {
    throw new ApiError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò cần xóa');
  }

  if (role.isSystem) {
    throw new ApiError(400, 'CANNOT_DELETE_SYSTEM_ROLE', 'Không thể xóa vai trò mặc định của hệ thống');
  }

  assertCanDelegatePermissions(res, role.permissions);

  // Kiểm tra xem có user nào đang dùng role này không
  const usersCount = await c.adminUsers.countDocuments({ roleId });
  if (usersCount > 0) {
    throw new ApiError(400, 'ROLE_IN_USE', `Đang có ${usersCount} tài khoản được gán vai trò này. Vui lòng chuyển vai trò của họ trước khi xóa!`);
  }

  await c.roles.deleteOne({ roleId });
  await revokeRoleSessions(roleId);
  res.json({ ok: true, message: 'Đã xóa vai trò thành công' });
});

/**
 * 6. Lấy danh sách Users
 */
rbacRouter.get('/users', async (_req, res) => {
  const c = getCollections();
  const users = await c.adminUsers
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  const roles = await c.roles.find({}).toArray();
  const roleMap = new Map(roles.map(r => [r.roleId, r.name]));

  const systemAdminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
  const systemAdmin = {
    userId: 'system-env-admin',
    username: systemAdminUsername,
    fullName: 'Quản trị viên hệ thống',
    roleId: 'admin',
    roleName: roleMap.get('admin') || 'Toàn quyền Admin',
    isActive: true,
    isSystemAdmin: true,
    createdAt: null,
    updatedAt: null
  };

  const enrichedUsers = users
    // Dữ liệu cũ có thể chứa user trùng tên admin ENV. Tài khoản đó bị luồng
    // đăng nhập ENV che khuất, nên không hiển thị thành một tài khoản thứ hai.
    .filter(u => u.username.toLowerCase() !== systemAdminUsername.toLowerCase())
    .map(u => ({
      ...u,
      roleName: roleMap.get(u.roleId) || u.roleId,
      isSystemAdmin: false
    }));

  res.json({ users: [systemAdmin, ...enrichedUsers] });
});

/**
 * 7. Thêm User mới
 */
rbacRouter.post('/users', requireActionProofFor('rbac.manage'), async (req, res) => {
  const schema = z.object({
    username: z.string().trim().min(3, 'Tên đăng nhập từ 3 đến 30 ký tự').max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Tên đăng nhập chỉ chứa chữ cái, số, gạch dưới hoặc gạch ngang'),
    fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80),
    // P2/Issue #9 FIX: Minimum 10 characters
    password: z.string().min(10, 'Mật khẩu tối thiểu 10 ký tự').max(128),
    roleId: z.string().min(1, 'Vui lòng chọn vai trò cho tài khoản')
  });

  const body = schema.parse(req.body);
  const c = getCollections();

  // Kiểm tra trùng username
  const cleanUsername = body.username.toLowerCase();
  if (cleanUsername === (process.env.ADMIN_USERNAME || 'admin').toLowerCase()) {
    throw new ApiError(400, 'USERNAME_TAKEN', 'Tên đăng nhập này đã được sử dụng');
  }

  const existing = await c.adminUsers.findOne({
    username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') }
  });
  if (existing) {
    throw new ApiError(400, 'USERNAME_TAKEN', 'Tên đăng nhập này đã tồn tại trong hệ thống');
  }

  // Kiểm tra roleId hợp lệ
  const role = await c.roles.findOne({ roleId: body.roleId });
  if (!role) {
    throw new ApiError(400, 'INVALID_ROLE', 'Vai trò đã chọn không tồn tại');
  }
  assertCanAssignRole(res, body.roleId, role.permissions);

  // P2/Issue #9 FIX: Validate password strength
  validatePasswordStrength(body.password, cleanUsername);

  const now = new Date();
  const userId = `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const newUser: AdminUserDoc = {
    userId,
    username: cleanUsername,
    passwordHash: await hashPassword(body.password),  // P2/Issue #11: async
    fullName: body.fullName,
    roleId: body.roleId,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };

  await c.adminUsers.insertOne(newUser);

  res.status(201).json({
    user: {
      userId: newUser.userId,
      username: newUser.username,
      fullName: newUser.fullName,
      roleId: newUser.roleId,
      roleName: role.name,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt
    }
  });
});

/**
 * 8. Cập nhật User (Set Role, Tên, Trạng thái hoạt động)
 */
rbacRouter.put('/users/:userId', requireActionProofFor('rbac.manage'), async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(80),
    roleId: z.string().min(1),
    isActive: z.boolean()
  });

  const userId = String(req.params.userId);
  const body = schema.parse(req.body);
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản cần sửa');
  }

  // A non-full-admin must not demote, reassign, or otherwise alter a full
  // administrator, even when the requested new role itself is low privilege.
  const callerPermissions = (res.locals.permissions as string[] | undefined) || [];
  const callerIsFullAdmin = callerPermissions.includes('*') || res.locals.roleId === 'admin' || !res.locals.userId;
  if (!callerIsFullAdmin && (user.roleId === 'admin' || user.username === (process.env.ADMIN_USERNAME || 'admin'))) {
    throw new ApiError(403, 'PROTECTED_USER', 'Chỉ quản trị viên toàn quyền mới được sửa tài khoản admin.');
  }

  // Bảo vệ không cho vô hiệu hóa admin chính
  if (user.username === 'admin' && body.isActive === false) {
    throw new ApiError(400, 'PROTECTED_ADMIN', 'Không thể vô hiệu hóa tài khoản quản trị chính');
  }

  // Chống tự nâng quyền hoặc tự đổi trạng thái
  if (user.userId === res.locals.userId) {
    if (body.roleId !== user.roleId) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không thể tự thay đổi vai trò của chính mình');
    }
    if (body.isActive === false) {
      throw new ApiError(403, 'FORBIDDEN', 'Bạn không thể tự khóa tài khoản của chính mình');
    }
  }

  const role = await c.roles.findOne({ roleId: body.roleId });
  if (!role) {
    throw new ApiError(400, 'INVALID_ROLE', 'Vai trò được gán không tồn tại');
  }
  assertCanAssignRole(res, body.roleId, role.permissions);

  const now = new Date();
  await c.adminUsers.updateOne(
    { userId },
    {
      $set: {
        fullName: body.fullName,
        roleId: body.roleId,
        isActive: body.isActive,
        updatedAt: now
      }
    }
  );

  // Thu hồi phiên ngay lập tức nếu đổi vai trò hoặc khóa tài khoản
  if (body.roleId !== user.roleId || body.isActive === false) {
    await revokeUserSessions(userId);
  }

  res.json({
    user: {
      userId: user.userId,
      username: user.username,
      fullName: body.fullName,
      roleId: body.roleId,
      roleName: role.name,
      isActive: body.isActive,
      updatedAt: now
    }
  });
});

/**
 * 9. Đổi mật khẩu User
 */
rbacRouter.put('/users/:userId/password', requireActionProofFor('rbac.manage'), async (req, res) => {
  const schema = z.object({
    // P2/Issue #9 FIX: Minimum 10 characters
    newPassword: z.string().min(10, 'Mật khẩu mới tối thiểu 10 ký tự').max(128)
  });

  const userId = String(req.params.userId);
  const body = schema.parse(req.body);
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  }

  await assertCanManageTarget(res, user, c);

  // P2/Issue #9 FIX: Check password strength when resetting
  validatePasswordStrength(body.newPassword, user.username);

  const now = new Date();
  await c.adminUsers.updateOne(
    { userId },
    {
      $set: {
        passwordHash: await hashPassword(body.newPassword),  // P2/Issue #11: async
        mustChangePassword: false,
        updatedAt: now
      }
    }
  );

  // Thu hồi các phiên cũ khi đổi mật khẩu
  await revokeUserSessions(userId);

  res.json({ ok: true, message: `Đã đổi mật khẩu cho tài khoản '${user.username}' thành công!` });
});

/**
 * 10. Xóa User
 */
rbacRouter.delete('/users/:userId', requireActionProofFor('rbac.manage'), async (req, res) => {
  const userId = String(req.params.userId);
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  }

  if (user.username === (process.env.ADMIN_USERNAME || 'admin')) {
    throw new ApiError(400, 'PROTECTED_USER', 'Không thể xóa tài khoản quản trị hệ thống.');
  }
  await assertCanManageTarget(res, user, c);

  await c.adminUsers.deleteOne({ userId });
  await revokeUserSessions(userId);

  res.json({ ok: true, message: `Đã xóa tài khoản '${user.username}'` });
});
