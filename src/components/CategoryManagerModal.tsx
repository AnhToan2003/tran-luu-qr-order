import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

export interface CategoryItemData {
  id: string;
  name: string;
  productCount?: number;
  itemCount?: number;
}

interface CategoryManagerModalProps {
  isOpen: boolean;
  title: string;
  itemLabel?: string; // 'sản phẩm' hoặc 'mặt hàng thể thao'
  categories: CategoryItemData[];
  apiEndpoint: string; // '/api/admin/categories' or '/api/admin/sports/categories'
  onClose: () => void;
  onRefresh: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  title,
  itemLabel = 'sản phẩm',
  categories,
  apiEndpoint,
  onClose,
  onRefresh
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Migration dialog state when deleting a category with products
  const [deleteTarget, setDeleteTarget] = useState<CategoryItemData | null>(null);
  const [migrationType, setMigrationType] = useState<'move' | 'uncategorized' | 'cascade'>('move');
  const [selectedTargetCatId, setSelectedTargetCatId] = useState<string>('');

  if (!isOpen) return null;

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCategoryName.trim();
    if (!cleanName) {
      setErrorMessage('Vui lòng nhập tên hạng mục');
      return;
    }

    setIsSubmittingNew(true);
    setErrorMessage('');
    try {
      const res = await apiFetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tạo hạng mục mới');
      }

      setNewCategoryName('');
      showSuccess(`Đã tạo hạng mục "${cleanName}" thành công!`);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tạo hạng mục');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleStartEdit = (cat: CategoryItemData) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setErrorMessage('');
  };

  const handleSaveEdit = async (id: string) => {
    const cleanName = editingName.trim();
    if (!cleanName) {
      setErrorMessage('Tên hạng mục không được để trống');
      return;
    }

    setIsSavingEdit(true);
    setErrorMessage('');
    try {
      const res = await apiFetch(`${apiEndpoint}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể cập nhật tên hạng mục');
      }

      setEditingId(null);
      setEditingName('');
      showSuccess('Cập nhật tên hạng mục thành công!');
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi sửa hạng mục');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const executeDelete = async (cat: CategoryItemData, moveTo?: string, cascadeDelete?: boolean) => {
    setDeletingId(cat.id);
    setErrorMessage('');
    try {
      let url = `${apiEndpoint}/${encodeURIComponent(cat.id)}`;
      const queryParams: string[] = [];
      if (cascadeDelete) {
        queryParams.push('cascadeDelete=true');
      } else if (moveTo) {
        queryParams.push(`moveTo=${encodeURIComponent(moveTo)}`);
      }
      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      const res = await apiFetch(url, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể xóa hạng mục');
      }

      setDeleteTarget(null);
      showSuccess(`Đã xóa hạng mục "${cat.name}" thành công!`);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa hạng mục');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteClick = (cat: CategoryItemData) => {
    const count = cat.productCount ?? cat.itemCount ?? 0;
    if (count === 0) {
      if (window.confirm(`Bạn có chắc chắn muốn xóa hạng mục "${cat.name}"? Thao tác này không thể hoàn tác.`)) {
        executeDelete(cat);
      }
      return;
    }

    // Nếu có sản phẩm, mở hộp thoại chọn phương án xử lý
    const otherCats = categories.filter(c => c.id !== cat.id);
    setSelectedTargetCatId(otherCats[0]?.id || 'uncategorized');
    setMigrationType(otherCats.length > 0 ? 'move' : 'uncategorized');
    setDeleteTarget(cat);
  };

  const handleConfirmMigrationDelete = () => {
    if (!deleteTarget) return;
    if (migrationType === 'move') {
      if (!selectedTargetCatId) {
        setErrorMessage('Vui lòng chọn hạng mục đích để chuyển sản phẩm sang');
        return;
      }
      executeDelete(deleteTarget, selectedTargetCatId, false);
    } else if (migrationType === 'uncategorized') {
      executeDelete(deleteTarget, 'uncategorized', false);
    } else if (migrationType === 'cascade') {
      if (window.confirm(`CẢNH BÁO NGUY HIỂM: Bạn có chắc chắn muốn xóa toàn bộ sản phẩm thuộc hạng mục "${deleteTarget.name}"? Thao tác này sẽ ẩn/xóa tất cả sản phẩm liên quan.`)) {
        executeDelete(deleteTarget, undefined, true);
      }
    }
  };

  const otherCategories = deleteTarget ? categories.filter(c => c.id !== deleteTarget.id) : [];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(5px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '700px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #E2E8F0',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#F8FAFC'
        }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {title}
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
              Quản lý danh mục, thêm mới, sửa tên và xóa an toàn
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Notifications */}
          {errorMessage && (
            <div style={{
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECDD3',
              borderRadius: '8px',
              color: '#B91C1C',
              fontSize: '13px',
              fontWeight: 700
            }}>
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div style={{
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              color: '#15803D',
              fontSize: '13px',
              fontWeight: 700
            }}>
              {successMessage}
            </div>
          )}

          {/* Form Thêm Hạng Mục Mới */}
          <form onSubmit={handleCreateCategory} style={{
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'flex-end'
          }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                TÊN HẠNG MỤC MỚI
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Trà sữa, Nước suối..."
                value={newCategoryName}
                onChange={e => {
                  setNewCategoryName(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingNew}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isSubmittingNew ? '#94A3B8' : '#10B981',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isSubmittingNew ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
              }}
            >
              {isSubmittingNew ? 'Đang thêm...' : '+ Thêm Hạng Mục'}
            </button>
          </form>

          {/* Table Danh Sách Hạng Mục */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>Tên Hạng Mục</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>Mã ID</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', textAlign: 'center' }}>Số Lượng</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>
                      Chưa có hạng mục nào. Hãy tạo hạng mục đầu tiên phía trên!
                    </td>
                  </tr>
                ) : (
                  categories.map(cat => {
                    const count = cat.productCount ?? cat.itemCount ?? 0;
                    const isEditing = editingId === cat.id;

                    return (
                      <tr key={cat.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1.5px solid #10B981',
                                fontSize: '13px',
                                outline: 'none',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                              autoFocus
                            />
                          ) : (
                            cat.name
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
                          {cat.id}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: count > 0 ? '#EFF6FF' : '#F1F5F9',
                            color: count > 0 ? '#1D4ED8' : '#64748B',
                            fontWeight: 800,
                            fontSize: '11px'
                          }}>
                            {count} {itemLabel}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(cat.id)}
                                  disabled={isSavingEdit}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#10B981',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isSavingEdit ? 'Lưu...' : 'Lưu'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#FFFFFF',
                                    color: '#64748B',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Hủy
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(cat)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#F8FAFC',
                                    color: '#334155',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Sửa Tên
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClick(cat)}
                                  disabled={deletingId === cat.id}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: count > 0 ? '#FEF3C7' : '#FEF2F2',
                                    color: count > 0 ? '#B45309' : '#DC2626',
                                    border: count > 0 ? '1px solid #FCD34D' : '1px solid #FECDD3',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title={count > 0 ? `Xóa hạng mục và xử lý ${count} ${itemLabel}` : 'Xóa hạng mục này'}
                                >
                                  {deletingId === cat.id ? 'Đang xóa...' : (count > 0 ? `Xóa (${count})` : 'Xóa')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MIGRATION / CONFIRMATION DIALOG (KHI XÓA DANH MỤC CÓ SẢN PHẨM) */}
        {deleteTarget && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 10000
          }}>
            <div style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #CBD5E1'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#EF4444'
                }} />
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Xóa Hạng Mục: {deleteTarget.name}
                </h4>
              </div>

              <div style={{
                padding: '12px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECDD3',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991B1B',
                lineHeight: 1.5
              }}>
                Hạng mục này hiện có <strong>{deleteTarget.productCount ?? deleteTarget.itemCount ?? 0} {itemLabel}</strong> đang sử dụng. Để không làm mất dữ liệu, vui lòng chọn cách xử lý:
              </div>

              {/* Tùy chọn 1: Chuyển sang hạng mục khác */}
              {otherCategories.length > 0 && (
                <div style={{
                  marginBottom: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: migrationType === 'move' ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                  backgroundColor: migrationType === 'move' ? '#EFF6FF' : '#FFFFFF',
                  cursor: 'pointer'
                }} onClick={() => setMigrationType('move')}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>
                    <input
                      type="radio"
                      name="migrationOption"
                      checked={migrationType === 'move'}
                      onChange={() => setMigrationType('move')}
                    />
                    Chuyển tất cả {itemLabel} sang hạng mục khác
                  </label>
                  {migrationType === 'move' && (
                    <div style={{ marginTop: '10px', paddingLeft: '24px' }}>
                      <select
                        value={selectedTargetCatId}
                        onChange={e => setSelectedTargetCatId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #94A3B8',
                          fontSize: '13px',
                          backgroundColor: '#FFFFFF',
                          color: '#0F172A',
                          fontWeight: 600
                        }}
                      >
                        {otherCategories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Tùy chọn 2: Chuyển về Chưa phân loại */}
              <div style={{
                marginBottom: '12px',
                padding: '12px',
                borderRadius: '8px',
                border: migrationType === 'uncategorized' ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                backgroundColor: migrationType === 'uncategorized' ? '#EFF6FF' : '#FFFFFF',
                cursor: 'pointer'
              }} onClick={() => setMigrationType('uncategorized')}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>
                  <input
                    type="radio"
                    name="migrationOption"
                    checked={migrationType === 'uncategorized'}
                    onChange={() => setMigrationType('uncategorized')}
                  />
                  Chuyển tất cả {itemLabel} về "Chưa phân loại"
                </label>
                <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: '#64748B' }}>
                  Các {itemLabel} vẫn được giữ nguyên tồn kho nhưng không thuộc danh mục này nữa.
                </p>
              </div>

              {/* Tùy chọn 3: Xóa luôn cả các sản phẩm */}
              <div style={{
                marginBottom: '20px',
                padding: '12px',
                borderRadius: '8px',
                border: migrationType === 'cascade' ? '1.5px solid #DC2626' : '1px solid #E2E8F0',
                backgroundColor: migrationType === 'cascade' ? '#FEF2F2' : '#FFFFFF',
                cursor: 'pointer'
              }} onClick={() => setMigrationType('cascade')}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#B91C1C' }}>
                  <input
                    type="radio"
                    name="migrationOption"
                    checked={migrationType === 'cascade'}
                    onChange={() => setMigrationType('cascade')}
                  />
                  Xóa luôn toàn bộ {itemLabel} thuộc hạng mục này
                </label>
                <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: '#DC2626' }}>
                  Cảnh báo: Thao tác này sẽ ẩn/xóa tất cả {deleteTarget.productCount ?? deleteTarget.itemCount ?? 0} {itemLabel}.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMigrationDelete}
                  disabled={deletingId === deleteTarget.id}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: migrationType === 'cascade' ? '#DC2626' : '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: deletingId === deleteTarget.id ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                >
                  {deletingId === deleteTarget.id ? 'Đang xử lý...' : 'Xác Nhận & Xóa Hạng Mục'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
