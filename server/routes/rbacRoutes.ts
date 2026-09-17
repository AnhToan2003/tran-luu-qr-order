import { Router } from 'express';
import { z } from 'zod';
import { getCollections, getDb } from '../db.js';
import { requirePermission, hashPassword, revokeUserSessions, revokeRoleSessions } from '../auth.js';
import { SYSTEM_PERMISSIONS, type SystemPermission, type RoleDoc, type AdminUserDoc } from '../types.js';
import { ApiError } from '../errors.js';

export const rbacRouter = Router();

// Tất cả các route bên dưới đều bắt buộc quyền 'rbac'
rbacRouter.use(requirePermission('rbac'));

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

/**
 * 3. Tạo Role mới
 */
rbacRouter.post('/roles', async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Tên vai trò tối thiểu 2 ký tự').max(50),
    description: z.string().trim().max(200).optional().default(''),
    permissions: z.array(z.string()).min(1, 'Vai trò phải có ít nhất 1 quyền')
  });

  const body = schema.parse(req.body);
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
rbacRouter.put('/roles/:roleId', async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().max(200).optional(),
    permissions: z.array(z.string()).min(1, 'Vai trò phải có ít nhất 1 quyền')
  });

  const { roleId } = req.params;
  const body = schema.parse(req.body);
  const c = getCollections();

  const role = await c.roles.findOne({ roleId });
  if (!role) {
    throw new ApiError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò cần sửa');
  }

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
rbacRouter.delete('/roles/:roleId', async (req, res) => {
  const { roleId } = req.params;
  const c = getCollections();

  const role = await c.roles.findOne({ roleId });
  if (!role) {
    throw new ApiError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò cần xóa');
  }

  if (role.isSystem) {
    throw new ApiError(400, 'CANNOT_DELETE_SYSTEM_ROLE', 'Không thể xóa vai trò mặc định của hệ thống');
  }

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

  const systemAdmin = {
    userId: 'system-env-admin',
    username: process.env.ADMIN_USERNAME || 'admin',
    fullName: 'Quản trị viên hệ thống',
    roleId: 'admin',
    roleName: roleMap.get('admin') || 'Toàn quyền Admin',
    isActive: true,
    isSystemAdmin: true,
    createdAt: null,
    updatedAt: null
  };

  const enrichedUsers = users.map(u => ({
    ...u,
    roleName: roleMap.get(u.roleId) || u.roleId,
    isSystemAdmin: false
  }));

  res.json({ users: [systemAdmin, ...enrichedUsers] });
});

/**
 * 7. Thêm User mới
 */
rbacRouter.post('/users', async (req, res) => {
  const schema = z.object({
    username: z.string().trim().min(3, 'Tên đăng nhập từ 3 đến 30 ký tự').max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Tên đăng nhập chỉ chứa chữ cái, số, gạch dưới hoặc gạch ngang'),
    fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100),
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

  const now = new Date();
  const userId = `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const newUser: AdminUserDoc = {
    userId,
    username: cleanUsername,
    passwordHash: hashPassword(body.password),
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
rbacRouter.put('/users/:userId', async (req, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(80),
    roleId: z.string().min(1),
    isActive: z.boolean()
  });

  const { userId } = req.params;
  const body = schema.parse(req.body);
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản cần sửa');
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
rbacRouter.put('/users/:userId/password', async (req, res) => {
  const schema = z.object({
    newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự').max(100)
  });

  const { userId } = req.params;
  const body = schema.parse(req.body);
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  }

  const now = new Date();
  await c.adminUsers.updateOne(
    { userId },
    {
      $set: {
        passwordHash: hashPassword(body.newPassword),
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
rbacRouter.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const c = getCollections();

  const user = await c.adminUsers.findOne({ userId });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  }

  if (user.username === 'admin' || user.userId === res.locals.userId) {
    throw new ApiError(400, 'PROTECTED_USER', 'Không thể xóa tài khoản admin chính hoặc tài khoản bạn đang đăng nhập');
  }

  await c.adminUsers.deleteOne({ userId });
  await revokeUserSessions(userId);

  res.json({ ok: true, message: `Đã xóa tài khoản '${user.username}'` });
});
