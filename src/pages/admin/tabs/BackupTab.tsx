import React from 'react';
import { formatVnd } from '../../../types/product';

interface BackupTabProps {
  hasDownloadedBackup: boolean;
  backupDownloadedTime: string;
  onExportFullBackup: () => void;
  onImportCatalog: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isImporting: boolean;
  importStatusMessage: string;
  cleanDaysPreset: string;
  setCleanDaysPreset: (preset: string) => void;
  cleanStartDate: string;
  setCleanStartDate: (date: string) => void;
  cleanEndDate: string;
  setCleanEndDate: (date: string) => void;
  cleanIncludeOrders: boolean;
  setCleanIncludeOrders: (val: boolean) => void;
  cleanIncludeInventory: boolean;
  setCleanIncludeInventory: (val: boolean) => void;
  cleanIncludeAuditLogs: boolean;
  setCleanIncludeAuditLogs: (val: boolean) => void;
  cleanPreview: any;
  cleanSuccessMessage: string;
  isCleaning: boolean;
  onOpenCleanConfirmModal: () => void;
  auditLogs: any[];
  isAuditLogsLoading: boolean;
  fetchAuditLogs: () => void;
  auditLogsPage?: number;
  auditLogsTotalPages?: number;
  auditLogsTotal?: number;
  onAuditLogsPageChange?: (newPage: number) => void;
}

export const BackupTab: React.FC<BackupTabProps> = ({
  hasDownloadedBackup,
  backupDownloadedTime,
  onExportFullBackup,
  onImportCatalog,
  isImporting,
  importStatusMessage,
  cleanDaysPreset,
  setCleanDaysPreset,
  cleanStartDate,
  setCleanStartDate,
  cleanEndDate,
  setCleanEndDate,
  cleanIncludeOrders,
  setCleanIncludeOrders,
  cleanIncludeInventory,
  setCleanIncludeInventory,
  cleanIncludeAuditLogs,
  setCleanIncludeAuditLogs,
  cleanPreview,
  cleanSuccessMessage,
  isCleaning,
  onOpenCleanConfirmModal,
  auditLogs,
  isAuditLogsLoading,
  fetchAuditLogs,
  auditLogsPage = 1,
  auditLogsTotalPages = 1,
  auditLogsTotal,
  onAuditLogsPageChange,
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '4px' }}>
          💾 Sao Lưu & Dữ Liệu Hệ Thống
        </h2>
      </div>

      {/* SECTION: SAO LƯU & KHÔI PHỤC — 1 ROW GỌN */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '20px',
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}>
        {/* Cột trái: Thông tin + nút Sao lưu */}
        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>💾</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-deep)' }}>Sao lưu toàn bộ hệ thống</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Bao gồm Menu Nước, Kho Thể thao & Dịch vụ sân, Sân & QR, Đơn hàng, Lịch sử nhập hàng, Cấu hình và Nhật ký
              </div>
            </div>
          </div>
          <button
            onClick={onExportFullBackup}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(10, 107, 74, 0.25)'
            }}
          >
            <span>📥</span>
            <span>{hasDownloadedBackup ? `Tải lại bản sao lưu mới (đã tải lúc ${backupDownloadedTime})` : 'Tải Bản Sao Lưu Hệ Thống (.JSON)'}</span>
          </button>
        </div>

        {/* Vạch phân cách */}
        <div style={{ width: '1px', backgroundColor: 'var(--color-border)', alignSelf: 'stretch', flexShrink: 0 }} />

        {/* Cột phải: Khôi phục */}
        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>📂</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-deep)' }}>Khôi phục từ file JSON</div>
            </div>
          </div>
          <input
            type="file"
            id="catalog-import-input"
            accept=".json"
            style={{ display: 'none' }}
            onChange={onImportCatalog}
          />
          <button
            disabled={isImporting}
            onClick={() => document.getElementById('catalog-import-input')?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-deep)',
              border: '1px solid var(--color-border-strong)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              cursor: isImporting ? 'wait' : 'pointer'
            }}
          >
            <span>{isImporting ? '⏳' : '📁'}</span>
            <span>{isImporting ? 'Đang khôi phục...' : 'Chọn file JSON để khôi phục'}</span>
          </button>
          {importStatusMessage && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              backgroundColor: importStatusMessage.startsWith('✅') ? '#F0FDF4' : '#FEF2F2',
              color: importStatusMessage.startsWith('✅') ? '#166534' : '#991B1B',
              border: `1px solid ${importStatusMessage.startsWith('✅') ? '#BBF7D0' : '#FECACA'}`
            }}>
              {importStatusMessage}
            </div>
          )}
        </div>
      </div>

      {/* CARD 3: DỌN DẸP DỮ LIỆU CŨ */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>🧹</span>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
              Dọn Dẹp Dữ Liệu Cũ
            </h3>
          </div>
        </div>

        {/* Cấu hình mốc thời gian & phạm vi dọn dẹp */}
        <div style={{
          backgroundColor: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          border: '1px solid var(--color-border)'
        }}>
          {/* Chọn mốc ngày */}
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)', display: 'block', marginBottom: '8px' }}>
              1. Mốc thời gian dọn dẹp:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: '30', label: '📅 Trước 1 tháng (Mặc định)' },
                { id: '7', label: 'Trước 1 tuần' },
                { id: '90', label: 'Trước 3 tháng' },
                { id: 'all', label: '⚡ Toàn bộ đơn cũ' },
                { id: 'custom', label: '🗓️ Chọn ngày cụ thể' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setCleanDaysPreset(p.id);
                    if (p.id !== 'custom') {
                      setCleanStartDate('');
                      setCleanEndDate('');
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: cleanDaysPreset === p.id ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: cleanDaysPreset === p.id ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: cleanDaysPreset === p.id ? '#FFFFFF' : 'var(--color-deep)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: cleanDaysPreset === p.id ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {cleanDaysPreset === 'custom' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '10px',
                padding: '10px 14px',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>Từ ngày:</label>
                    <input
                      type="date"
                      value={cleanStartDate}
                      onChange={(e) => setCleanStartDate(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>Đến ngày (hoặc Trước ngày):</label>
                    <input
                      type="date"
                      value={cleanEndDate}
                      onChange={(e) => setCleanEndDate(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
                    />
                  </div>
                  {(cleanStartDate || cleanEndDate) && (
                    <button
                      type="button"
                      onClick={() => { setCleanStartDate(''); setCleanEndDate(''); }}
                      style={{ padding: '4px 8px', fontSize: '11px', color: '#DC2626', background: 'none', border: '1px solid #FECACA', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ✕ Xoá ngày
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  💡 Bạn có thể chọn riêng ô <strong>"Đến ngày (hoặc Trước ngày)"</strong> để dọn dữ liệu trước mốc đó, hoặc chọn cả hai ô để dọn trong khoảng ngày.
                </div>
              </div>
            )}
          </div>

          {/* Chọn phạm vi dữ liệu */}
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)', display: 'block', marginBottom: '8px' }}>
              2. Dữ liệu cần dọn dẹp:
            </label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cleanIncludeOrders}
                  onChange={(e) => setCleanIncludeOrders(e.target.checked)}
                />
                <span>Lịch sử đơn hàng cũ (Đã giao / Đã hủy)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cleanIncludeInventory}
                  onChange={(e) => setCleanIncludeInventory(e.target.checked)}
                />
                <span>Biến động kho & Lịch sử nhập hàng cũ (Cả Nước & Thể thao)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cleanIncludeAuditLogs}
                  onChange={(e) => setCleanIncludeAuditLogs(e.target.checked)}
                />
                <span>Nhật ký hoạt động</span>
              </label>
            </div>
          </div>
        </div>

        {/* Thông tin xem trước (Preview Badge) */}
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>KHOẢNG DỌN DẸP</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-deep)', marginTop: '2px' }}>
              {cleanPreview?.rangeLabel || (cleanPreview?.beforeDate ? `Trước ${new Date(cleanPreview.beforeDate).toLocaleDateString('vi-VN')}` : 'Đang tính...')}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>LỊCH SỬ ĐƠN HÀNG</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: cleanIncludeOrders ? '#DC2626' : 'var(--color-text-muted)', marginTop: '2px' }}>
              {cleanIncludeOrders ? `${cleanPreview?.ordersCount ?? 0} đơn` : 'Bỏ qua'}
            </div>
            <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600, marginTop: '1px' }}>
              🛡️ Giữ an toàn {cleanPreview?.activeOrdersPreserved ?? 0} đơn đang làm
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>BIẾN ĐỘNG KHO & NHẬP HÀNG</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: cleanIncludeInventory ? '#EA580C' : 'var(--color-text-muted)', marginTop: '2px' }}>
              {cleanIncludeInventory ? `${cleanPreview?.inventoryCount ?? 0} bản ghi` : 'Bỏ qua'}
            </div>
            {cleanIncludeInventory && typeof cleanPreview?.intakeCount === 'number' && cleanPreview.intakeCount > 0 && (
              <div style={{ fontSize: '10px', color: '#D97706', fontWeight: 600, marginTop: '1px' }}>
                📦 Gồm {cleanPreview.intakeCount} phiếu nhập hàng cũ
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>NHẬT KÝ HOẠT ĐỘNG</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: cleanIncludeAuditLogs ? '#7C3AED' : 'var(--color-text-muted)', marginTop: '2px' }}>
              {cleanIncludeAuditLogs ? `${cleanPreview?.auditLogsCount ?? 0} dòng` : 'Bỏ qua'}
            </div>
          </div>
        </div>

        {/* Thông báo thành công nếu có */}
        {cleanSuccessMessage && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#166534',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700
          }}>
            {cleanSuccessMessage}
          </div>
        )}

        {/* Action Button: Nút dọn dẹp duy nhất */}
        <div style={{ paddingTop: '4px' }}>
          <button
            type="button"
            disabled={isCleaning || (!cleanIncludeOrders && !cleanIncludeInventory && !cleanIncludeAuditLogs)}
            onClick={() => {
              if (!hasDownloadedBackup) {
                alert('⚠️ Để đảm bảo an toàn dữ liệu, bạn cần bấm nút "Tải Bản Sao Lưu Hệ Thống (.JSON)" ở phía trên trước khi thực hiện dọn dẹp!');
                return;
              }
              onOpenCleanConfirmModal();
            }}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: (!cleanIncludeOrders && !cleanIncludeInventory && !cleanIncludeAuditLogs)
                ? '#94A3B8'
                : (hasDownloadedBackup ? '#DC2626' : '#64748B'),
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: 'var(--font-size-sm)',
              border: 'none',
              cursor: isCleaning ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: hasDownloadedBackup ? '0 2px 4px rgba(220, 38, 38, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{hasDownloadedBackup ? '🗑️' : '🔒'}</span>
            <span>
              {isCleaning
                ? 'ĐANG DỌN DẸP...'
                : hasDownloadedBackup
                ? 'DỌN DẸP DỮ LIỆU CŨ'
                : 'DỌN DẸP DỮ LIỆU CŨ (CẦN SAO LƯU TRƯỚC)'}
            </span>
          </button>
        </div>
      </div>

      {/* BẢNG NHẬT KÝ THAO TÁC (AUDIT LOGS) */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
              🛡️ Nhật ký thao tác quản trị (Audit Logs)
            </h3>
          </div>
          <button
            onClick={fetchAuditLogs}
            disabled={isAuditLogsLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <span>🔄</span>
            <span>{isAuditLogsLoading ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>Thời gian</th>
                <th style={{ padding: '10px 12px' }}>Người thực hiện</th>
                <th style={{ padding: '10px 12px' }}>Hành động</th>
                <th style={{ padding: '10px 12px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>Chi tiết thao tác</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Chưa có bản ghi nhật ký kiểm toán nào gần đây.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => {
                  let actionLabel = log.action;
                  let actionBg = 'rgba(10, 107, 74, 0.1)';
                  let actionColor = 'var(--color-primary)';
                  if (log.action === 'product_create') { actionLabel = '➕ Thêm món mới'; actionBg = '#DCFCE7'; actionColor = '#15803D'; }
                  else if (log.action === 'product_update') { actionLabel = '✏️ Sửa sản phẩm'; actionBg = '#E0F2FE'; actionColor = '#0369A1'; }
                  else if (log.action === 'product_delete') { actionLabel = '🗑️ Xóa sản phẩm'; actionBg = '#FEE2E2'; actionColor = '#B91C1C'; }
                  else if (log.action === 'stock_adjustment') { actionLabel = '📦 Điều chỉnh kho'; actionBg = '#FEF3C7'; actionColor = '#B45309'; }
                  else if (log.action === 'order_cancel') { actionLabel = '🛑 Hủy đơn hàng'; actionBg = '#FEE2E2'; actionColor = '#B91C1C'; }
                  else if (log.action === 'order_create') { actionLabel = '🧾 Tạo đơn tại quầy'; actionBg = '#F3E8FF'; actionColor = '#7E22CE'; }
                  else if (log.action === 'settings_update') { actionLabel = '⚙️ Đổi cài đặt'; actionBg = '#F1F5F9'; actionColor = '#475569'; }
                  else if (log.action === 'catalog_import') { actionLabel = '📥 Khôi phục danh mục'; actionBg = '#ECFDF5'; actionColor = '#047857'; }
                  else if (log.action === 'data_cleaned') { actionLabel = '🧹 Dọn dẹp dữ liệu cũ'; actionBg = '#FEF3C7'; actionColor = '#B45309'; }

                  const d = new Date(log.createdAt);
                  const timeStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={log.auditId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                        {timeStr}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-deep)' }}>
                        👤 {log.adminUsername}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: actionBg,
                          color: actionColor
                        }}>
                          {actionLabel}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--color-deep)' }}>
                        {log.details?.cleaned ? <span>Đã dọn: {log.details.cleaned.ordersDeleted} đơn, {log.details.cleaned.inventoryMovementsDeleted} kho, {log.details.cleaned.auditLogsDeleted} nhật ký ({log.details.rangeLabel || (log.details.beforeDate ? `Trước ${new Date(log.details.beforeDate).toLocaleDateString('vi-VN')}` : '')}) </span> : null}
                        {log.details?.name ? <strong>{String(log.details.name)} </strong> : null}
                        {log.details?.courtName ? <span>Sân: {String(log.details.courtName)} </span> : null}
                        {log.details?.reason ? <span>(Lý do: {String(log.details.reason)}) </span> : null}
                        {log.details?.stockAfter !== undefined ? <span>Tồn kho mới: {String(log.details.stockAfter)} chai </span> : null}
                        {log.details?.isAcceptingOrders !== undefined ? <span>Trạng thái nhận đơn: {log.details.isAcceptingOrders ? 'Mở' : 'Tắt'} </span> : null}
                        {log.details?.count ? <span>Số lượng: {String(log.details.count)} món </span> : null}
                        {log.details?.priceVnd ? <span>Giá: {formatVnd(Number(log.details.priceVnd))} </span> : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* THANH PHÂN TRANG NHẬT KÝ KIỂM TOÁN */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)'
        }}>
          <div>
            Hiển thị <strong>{auditLogs.length}</strong> {auditLogsTotal !== undefined ? <>trên tổng số <strong>{auditLogsTotal}</strong> bản ghi</> : 'bản ghi'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => onAuditLogsPageChange && onAuditLogsPageChange(Math.max(1, auditLogsPage - 1))}
              disabled={isAuditLogsLoading || auditLogsPage <= 1}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: auditLogsPage <= 1 ? '#F3F4F6' : 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: auditLogsPage <= 1 ? '#9CA3AF' : 'var(--color-deep)',
                cursor: auditLogsPage <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '11px'
              }}
            >
              ← Trang trước
            </button>

            <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-deep)' }}>
              Trang {auditLogsPage} / {auditLogsTotalPages}
            </span>

            <button
              onClick={() => onAuditLogsPageChange && onAuditLogsPageChange(Math.min(auditLogsTotalPages, auditLogsPage + 1))}
              disabled={isAuditLogsLoading || auditLogsPage >= auditLogsTotalPages}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: auditLogsPage >= auditLogsTotalPages ? '#F3F4F6' : 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: auditLogsPage >= auditLogsTotalPages ? '#9CA3AF' : 'var(--color-deep)',
                cursor: auditLogsPage >= auditLogsTotalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '11px'
              }}
            >
              Trang sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};