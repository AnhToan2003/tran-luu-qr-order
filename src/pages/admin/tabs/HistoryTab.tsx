import React from 'react';
import { Order, Court } from '../../../types/order';
import { formatVnd } from '../../../types/product';

interface HistoryTabProps {
  historyOrders: Order[];
  historySummary: {
    totalMatched: number;
    totalRevenueVnd: number;
    totalBottles: number;
  };
  historyCourtFilter: string;
  historyStatusFilter: string;
  historyTimePreset: string;
  historyStartDate: string;
  historyEndDate: string;
  historySearchQuery: string;
  historyCursor: string | null;
  historyBusy: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (newPage: number) => void;
  courts: Court[];
  onExportHistory: () => void;
  onLoadMore: () => void;
  setHistoryCourtFilter: (val: string) => void;
  setHistoryStatusFilter: (val: string) => void;
  setHistoryTimePreset: (val: string) => void;
  setHistoryStartDate: (val: string) => void;
  setHistoryEndDate: (val: string) => void;
  setHistorySearchQuery: (val: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  historyOrders,
  historySummary,
  historyCourtFilter,
  historyStatusFilter,
  historyTimePreset,
  historyStartDate,
  historyEndDate,
  historySearchQuery,
  historyCursor: _unusedHistoryCursor,
  historyBusy,
  page = 1,
  totalPages = 1,
  onPageChange,
  courts,
  onExportHistory,
  onLoadMore: _unusedOnLoadMore,
  setHistoryCourtFilter,
  setHistoryStatusFilter,
  setHistoryTimePreset,
  setHistoryStartDate,
  setHistoryEndDate,
  setHistorySearchQuery,
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header with Title and Export button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
            📜 Lịch Sử Đơn Hàng & Xuất Báo Cáo Excel
          </h2>
        </div>

        {/* Excel Export Button */}
        <button
          onClick={onExportHistory}
          style={{
            padding: '10px 20px',
            backgroundColor: '#15803D',
            color: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            fontWeight: 800,
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(21, 128, 61, 0.25)',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <span>📊</span>
          <span>XUẤT FILE EXCEL ({historySummary.totalMatched} ĐƠN)</span>
        </button>
      </div>

      {/* KPI Summary Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>📋 Tổng đơn khớp bộ lọc</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '4px' }}>
            {historySummary.totalMatched} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>đơn</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>💰 Doanh thu thực thu</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '4px' }}>
            {formatVnd(historySummary.totalRevenueVnd)}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>🥤 Số chai nước đã phục vụ</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0284C7', marginTop: '4px' }}>
            {historySummary.totalBottles} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>chai</span>
          </div>
        </div>
      </div>

      {/* Filter Control Panel */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {/* Row 1: Time Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginRight: '4px' }}>
            Mốc thời gian:
          </span>
          {[
            { id: 'yesterday', label: 'Hôm qua' },
            { id: 'today', label: 'Hôm nay' },
            { id: '7days', label: '1 tuần' },
            { id: 'month', label: '1 tháng' },
            { id: 'all', label: 'Tất cả' },
            { id: 'custom', label: '📅 Chọn khoảng ngày' }
          ].map(preset => (
            <button
              key={preset.id}
              onClick={() => {
                setHistoryTimePreset(preset.id);
                if (preset.id !== 'custom') {
                  setHistoryStartDate('');
                  setHistoryEndDate('');
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: historyTimePreset === preset.id ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: historyTimePreset === preset.id ? 'var(--color-primary)' : 'var(--color-bg)',
                color: historyTimePreset === preset.id ? '#FFFFFF' : 'var(--color-deep)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: historyTimePreset === preset.id ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Row 1.5: Custom Date Range Inputs (Shown when custom is selected) */}
        {historyTimePreset === 'custom' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>Từ ngày:</label>
              <input
                type="date"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>Đến ngày:</label>
              <input
                type="date"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
              />
            </div>
            {(historyStartDate || historyEndDate) && (
              <button
                onClick={() => { setHistoryStartDate(''); setHistoryEndDate(''); }}
                style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-muted)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Xoá khoảng ngày
              </button>
            )}
          </div>
        )}

        {/* Row 2: Court, Status, Search input, and Reset */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Court Filter */}
          <select
            value={historyCourtFilter}
            onChange={(e) => setHistoryCourtFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-deep)'
            }}
          >
            <option value="all">🏟️ Tất cả các sân</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Status Filter */}
          <select
            value={historyStatusFilter}
            onChange={(e) => setHistoryStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-deep)'
            }}
          >
            <option value="all">⚡ Tất cả trạng thái</option>
            <option value="delivered">✅ Đơn hàng hoàn tất</option>
            <option value="cancelled">🛑 Đã hủy</option>
          </select>

          {/* Search query input */}
          <div style={{ flex: '1', minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="🔍 Tìm theo mã đơn (TL-01), tên món, tên sân..."
              style={{
                width: '100%',
                padding: '8px 30px 8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-deep)'
              }}
            />
            {historySearchQuery && (
              <button
                onClick={() => setHistorySearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Reset Filters button */}
          {(historyCourtFilter !== 'all' || historyStatusFilter !== 'all' || historyTimePreset !== 'today' || historySearchQuery || historyStartDate || historyEndDate) && (
            <button
              onClick={() => {
                setHistoryCourtFilter('all');
                setHistoryStatusFilter('all');
                setHistoryTimePreset('today');
                setHistoryStartDate('');
                setHistoryEndDate('');
                setHistorySearchQuery('');
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--color-border-strong)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔄 Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Mã đơn</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Sân</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Chi tiết món & ly đá</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tổng tiền</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Trạng thái</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Thời gian đặt</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Thời gian giao</th>
              </tr>
            </thead>
            <tbody>
              {historyOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-deep)' }}>Không có đơn hàng nào khớp với bộ lọc hiện tại</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>Vui lòng thay đổi thời gian, chọn sân khác hoặc xoá từ khoá tìm kiếm.</div>
                  </td>
                </tr>
              ) : (
                historyOrders.map(o => {
                  const createdD = new Date(o.createdAt);
                  const createdStr = `${createdD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${createdD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
                  let deliveredStr = '—';
                  if (o.deliveredAt) {
                    const delD = new Date(o.deliveredAt);
                    deliveredStr = `${delD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${delD.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
                  }

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--color-deep)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{o.displayCode}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{o.courtName}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--font-size-xs)' }}>
                          {o.items.map((i, idx) => (
                            <span key={idx}>
                              <strong>{i.quantity}x</strong> {i.name} {i.iceQuantity > 0 && <span style={{ color: '#0284C7', fontWeight: 600 }}>(+{i.iceQuantity} đá)</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--color-primary)' }}>{formatVnd(o.totalVnd)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: o.status === 'delivered' ? 'var(--color-status-delivered-bg)' : o.status === 'cancelled' ? '#FEE2E2' : '#FEF3C7',
                          color: o.status === 'delivered' ? 'var(--color-status-delivered)' : o.status === 'cancelled' ? '#DC2626' : '#D97706'
                        }}>
                          {o.status === 'delivered' ? 'ĐÃ HOÀN TẤT' : o.status === 'cancelled' ? 'ĐÃ HỦY' : o.status === 'preparing' ? 'ĐANG LÀM' : o.status === 'accepted' ? 'ĐÃ NHẬN' : 'ĐƠN MỚI'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {createdStr}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {deliveredStr}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang (Pagination Controls) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          backgroundColor: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border)',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            Trang <strong>{page}</strong> / <strong>{Math.max(1, totalPages)}</strong> • Khớp tổng cộng <strong>{historySummary.totalMatched}</strong> đơn hàng
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={page <= 1 || historyBusy}
              onClick={() => onPageChange && onPageChange(page - 1)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: page <= 1 ? 'var(--color-text-muted)' : 'var(--color-deep)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                cursor: page <= 1 || historyBusy ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1
              }}
            >
              ◀ Trước
            </button>

            {Array.from({ length: Math.min(5, Math.max(1, totalPages)) }, (_, i) => {
              let pageNum: number;
              const maxP = Math.max(1, totalPages);
              if (maxP <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= maxP - 2) {
                pageNum = maxP - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  disabled={historyBusy}
                  onClick={() => onPageChange && onPageChange(pageNum)}
                  style={{
                    minWidth: '32px',
                    height: '32px',
                    padding: '0 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: page === pageNum ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: page === pageNum ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: page === pageNum ? '#FFFFFF' : 'var(--color-deep)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    cursor: historyBusy ? 'wait' : 'pointer'
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={page >= totalPages || historyBusy}
              onClick={() => onPageChange && onPageChange(page + 1)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: page >= totalPages ? 'var(--color-text-muted)' : 'var(--color-deep)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                cursor: page >= totalPages || historyBusy ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1
              }}
            >
              Tiếp ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};