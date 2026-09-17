import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api';

interface PermissionDef {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface RoleItem {
  roleId: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
}

interface UserItem {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
}

export const RbacUsersTab: React.FC = () => {
  const [activeSubView, setActiveSubView] = useState<'users' | 'roles'>('users');
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');

  // Modals
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);

  // Form states - User
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('');

  const [editFullName, setEditFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Form states - Role
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [permRes, roleRes, userRes] = await Promise.all([
        apiFetch('/api/admin/rbac/permissions'),
        apiFetch('/api/admin/rbac/roles'),
        apiFetch('/api/admin/rbac/users')
      ]);

      if (permRes.ok) {
        const d = await permRes.json();
        setPermissions(d.permissions || []);
      }
      if (roleRes.ok) {
        const d = await roleRes.json();
        setRoles(d.roles || []);
        if (d.roles?.length > 0 && !newUserRole) {
          setNewUserRole(d.roles[0].roleId);
        }
      }
      if (userRes.ok) {
        const d = await userRes.json();
        setUsers(d.users || []);
      }
    } catch {
      showToast('Lỗi khi tải dữ liệu phân quyền');
    } finally {
      setIsLoading(false);
    }
  }, [newUserRole]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Handle Create User
  const handleOpenCreateUser = () => {
    setNewUsername('');
    setNewFullName('');
    setNewPassword('');
    setNewUserRole(roles[0]?.roleId || 'staff_water');
    setFormError('');
    setIsCreateUserOpen(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/rbac/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          fullName: newFullName.trim(),
          password: newPassword,
          roleId: newUserRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi tạo tài khoản');

      setIsCreateUserOpen(false);
      showToast(`Đã tạo tài khoản "${newUsername.trim()}" thành công`);
      void fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi xử lý');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit User
  const handleOpenEditUser = (user: UserItem) => {
    setSelectedUser(user);
    setEditFullName(user.fullName);
    setEditUserRole(user.roleId);
    setEditIsActive(user.isActive);
    setFormError('');
    setIsEditUserOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError('');
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/rbac/users/${selectedUser.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          roleId: editUserRole,
          isActive: editIsActive
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi cập nhật');

      setIsEditUserOpen(false);
      showToast(`Đã cập nhật tài khoản "${selectedUser.username}"`);
      void fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi cập nhật tài khoản');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Change Password
  const handleOpenChangePassword = (user: UserItem) => {
    setSelectedUser(user);
    setNewPasswordInput('');
    setFormError('');
    setIsChangePasswordOpen(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError('');
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/rbac/users/${selectedUser.userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPasswordInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi đổi mật khẩu');

      setIsChangePasswordOpen(false);
      showToast(`Đã đổi mật khẩu cho "${selectedUser.username}"`);
    } catch (err: any) {
      setFormError(err.message || 'Lỗi đổi mật khẩu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (user: UserItem) => {
    if (!window.confirm(`Bạn có chắc muốn xóa tài khoản "${user.username}" (${user.fullName})?`)) return;
    try {
      const res = await apiFetch(`/api/admin/rbac/users/${user.userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi xóa tài khoản');

      showToast(data.message || 'Đã xóa tài khoản');
      void fetchData();
    } catch (err: any) {
      alert(err.message || 'Lỗi');
    }
  };

  // Role Modals
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setRolePerms(['orders']);
    setFormError('');
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: RoleItem) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description || '');
    setRolePerms(role.permissions || []);
    setFormError('');
    setIsRoleModalOpen(true);
  };

  const handleTogglePermission = (permId: string) => {
    setRolePerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleSelectAllPermissions = () => {
    if (rolePerms.length === permissions.length) {
      setRolePerms(['orders']);
    } else {
      setRolePerms(permissions.map(p => p.id));
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    try {
      const url = editingRole ? `/api/admin/rbac/roles/${editingRole.roleId}` : '/api/admin/rbac/roles';
      const method = editingRole ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roleName.trim(),
          description: roleDesc.trim(),
          permissions: rolePerms
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi lưu vai trò');

      setIsRoleModalOpen(false);
      showToast(editingRole ? `Đã cập nhật vai trò "${roleName}"` : `Đã tạo vai trò "${roleName}"`);
      void fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi xử lý vai trò');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRole = async (role: RoleItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vai trò "${role.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/admin/rbac/roles/${role.roleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi xóa vai trò');

      showToast('Đã xóa vai trò');
      void fetchData();
    } catch (err: any) {
      alert(err.message || 'Lỗi');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          backgroundColor: '#065F46',
          color: '#FFFFFF',
          padding: '10px 18px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 2000,
          fontWeight: 700,
          fontSize: '13px'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
            Quản Trị Phân Quyền & Tài Khoản
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Thiết lập quyền truy cập từng danh mục chức năng và quản lý tài khoản nhân viên
          </p>
        </div>

        {/* Sub Navigation */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveSubView('users')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              border: activeSubView === 'users' ? '1px solid var(--color-primary)' : '1px solid #CBD5E1',
              backgroundColor: activeSubView === 'users' ? 'var(--color-primary)' : '#FFFFFF',
              color: activeSubView === 'users' ? '#FFFFFF' : '#334155'
            }}
          >
            Tài Khoản Người Dùng ({users.length})
          </button>
          <button
            onClick={() => setActiveSubView('roles')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              border: activeSubView === 'roles' ? '1px solid var(--color-primary)' : '1px solid #CBD5E1',
              backgroundColor: activeSubView === 'roles' ? 'var(--color-primary)' : '#FFFFFF',
              color: activeSubView === 'roles' ? '#FFFFFF' : '#334155'
            }}
          >
            Vai Trò & Danh Mục Quyền ({roles.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
          Đang tải dữ liệu phân quyền...
        </div>
      ) : activeSubView === 'users' ? (
        /* ================= SUB-VIEW 1: QUẢN LÝ TÀI KHOẢN (USERS) ================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>
              Danh sách tài khoản nhân viên & quản trị viên
            </div>
            <button
              onClick={handleOpenCreateUser}
              style={{
                padding: '9px 16px',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(10, 107, 74, 0.2)'
              }}
            >
              + Thêm Tài Khoản Mới
            </button>
          </div>

          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Tên đăng nhập</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Họ và tên</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Vai trò hiện tại</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Trạng thái</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr
                    key={u.userId}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFD'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0F172A' }}>
                      {u.username}
                      {u.username === 'admin' && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', color: '#64748B' }}>
                          Gốc
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155', fontWeight: 600 }}>
                      {u.fullName}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: u.roleId === 'admin' ? '#FEF3C7' : '#F1F5F9',
                        color: u.roleId === 'admin' ? '#B45309' : '#0F172A'
                      }}>
                        {u.roleName}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: u.isActive ? '#ECFDF5' : '#FEE2E2',
                        color: u.isActive ? '#059669' : '#DC2626'
                      }}>
                        {u.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#334155',
                            cursor: 'pointer'
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleOpenChangePassword(u)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#0284C7',
                            cursor: 'pointer'
                          }}
                        >
                          Đổi mật khẩu
                        </button>
                        {u.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: '#FFF1F2',
                              border: '1px solid #FECDD3',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#E11D48',
                              cursor: 'pointer'
                            }}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= SUB-VIEW 2: QUẢN LÝ VAI TRÒ & PHÂN QUYỀN (ROLES) ================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>
              Danh sách vai trò & phạm vi quyền hạn các danh mục
            </div>
            <button
              onClick={handleOpenCreateRole}
              style={{
                padding: '9px 16px',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(10, 107, 74, 0.2)'
              }}
            >
              + Thêm Vai Trò Mới
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {roles.map(role => (
              <div
                key={role.roleId}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                        {role.name}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>
                        ID: {role.roleId}
                      </span>
                    </div>
                    {role.isSystem ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '4px' }}>
                        Hệ thống
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#ECFDF5', color: '#047857', padding: '2px 8px', borderRadius: '4px' }}>
                        Tùy chỉnh
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748B', lineHeight: '1.4' }}>
                    {role.description || 'Chưa có mô tả vai trò'}
                  </p>

                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Các danh mục được phép ({role.permissions.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {role.permissions.map(permId => {
                        const def = permissions.find(p => p.id === permId);
                        return (
                          <span
                            key={permId}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              color: '#1E293B',
                              padding: '3px 8px',
                              borderRadius: '4px'
                            }}
                          >
                            {def ? def.name : permId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                  <button
                    onClick={() => handleOpenEditRole(role)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#0F172A',
                      cursor: 'pointer'
                    }}
                  >
                    Phân quyền danh mục
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => handleDeleteRole(role)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#FFF1F2',
                        border: '1px solid #FECDD3',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#E11D48',
                        cursor: 'pointer'
                      }}
                    >
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= MODAL: THÊM USER MỚI ================= */}
      {isCreateUserOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '460px',
            padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
              Thêm Tài Khoản Mới
            </h3>
            {formError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', fontSize: '12px', fontWeight: 600, marginBottom: '14px' }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>TÊN ĐĂNG NHẬP *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: nhanvien_nuoc1"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>HỌ VÀ TÊN *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>MẬT KHẨU KHỞI TẠO *</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Tối thiểu 6 ký tự"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    title={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {showNewPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>VAI TRÒ (ROLE) *</label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                >
                  {roles.map(r => (
                    <option key={r.roleId} value={r.roleId}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateUserOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Tạo Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: SỬA USER ================= */}
      {isEditUserOpen && selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '460px',
            padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
              Chỉnh Sửa Tài Khoản: {selectedUser.username}
            </h3>
            {formError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', fontSize: '12px', fontWeight: 600, marginBottom: '14px' }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>HỌ VÀ TÊN *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>VAI TRÒ (SET ROLE) *</label>
                <select
                  value={editUserRole}
                  onChange={e => setEditUserRole(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                >
                  {roles.map(r => (
                    <option key={r.roleId} value={r.roleId}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="userActiveCheck"
                  checked={editIsActive}
                  disabled={selectedUser.username === 'admin'}
                  onChange={e => setEditIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="userActiveCheck" style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}>
                  Kích hoạt tài khoản này (cho phép đăng nhập)
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditUserOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ĐỔI MẬT KHẨU ================= */}
      {isChangePasswordOpen && selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '400px',
            padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
              Đổi Mật Khẩu: {selectedUser.username}
            </h3>
            {formError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', fontSize: '12px', fontWeight: 600, marginBottom: '14px' }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>MẬT KHẨU MỚI *</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    value={newPasswordInput}
                    onChange={e => setNewPasswordInput(e.target.value)}
                    style={{ width: '100%', padding: '9px 36px 9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(v => !v)}
                    title={showResetPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {showResetPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Đổi Mật Khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: THÊM / SỬA VAI TRÒ & MA TRẬN PHÂN QUYỀN ================= */}
      {isRoleModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '640px',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                {editingRole ? `Phân Quyền Vai Trò: ${editingRole.name}` : 'Tạo Vai Trò Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRole} style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>TÊN VAI TRÒ *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nhân viên quầy ca tối"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>MÔ TẢ VAI TRÒ</label>
                <input
                  type="text"
                  placeholder="Mô tả tóm tắt nhiệm vụ của vai trò này"
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                    PHÂN QUYỀN TRUY CẬP CÁC DANH MỤC *
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllPermissions}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {rolePerms.length === permissions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả danh mục'}
                  </button>
                </div>

                <div style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  backgroundColor: '#F8FAFC',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}>
                  {permissions.map(p => {
                    const isChecked = rolePerms.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          backgroundColor: isChecked ? '#FFFFFF' : 'transparent',
                          borderRadius: '6px',
                          border: isChecked ? '1px solid #CBD5E1' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTogglePermission(p.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {p.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Vai Trò'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
