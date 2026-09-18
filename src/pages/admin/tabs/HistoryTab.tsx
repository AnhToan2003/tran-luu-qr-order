import React from 'react';
import { Order, Court } from '../../../types/order';
import { formatVnd } from '../../../types/product';

interface HistoryTabProps {
  historyOrders: Order[];
  historySummary: {
    totalMatched: number;
    totalRevenueVnd: number;
    totalCostVnd: number;
    totalProfitVnd: number;
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
  const [selectedOrderForDetail, setSelectedOrderForDetail] = React.useState<Order | null>(null);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header with Title and Export button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
            Lịch sử bán nước & thực phẩm
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
          <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tổng đơn khớp bộ lọc</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '4px' }}>
            {historySummary.totalMatched} <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>đơn</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Doanh thu thực thu</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '4px' }}>
            {formatVnd(historySummary.totalRevenueVnd)}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Số chai nước đã phục vụ</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0284C7', marginTop: '4px' }}>
            {historySummary.totalBottles} <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>chai</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tổng lợi nhuận thực thu</div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0A6B4A', marginTop: '4px' }}>
            +{formatVnd(historySummary.totalProfitVnd !== undefined ? historySummary.totalProfitVnd : Math.max(0, historySummary.totalRevenueVnd - (historySummary.totalCostVnd || 0)))}
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
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginRight: '4px' }}>
            Mốc thời gian:
          </span>
          {[
            { id: 'yesterday', label: 'Hôm qua' },
            { id: 'today', label: 'Hôm nay' },
            { id: '7days', label: '1 tuần' },
            { id: 'month', label: '1 tháng' },
            { id: 'all', label: 'Tất cả' },
            { id: 'custom', label: 'Chọn khoảng ngày' }
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
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid',
                borderColor: historyTimePreset === preset.id ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: historyTimePreset === preset.id ? 'var(--color-primary)' : 'var(--color-bg)',
                color: historyTimePreset === preset.id ? '#FFFFFF' : '#0F172A',
                fontSize: '13px',
                fontWeight: historyTimePreset === preset.id ? 800 : 700,
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
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--color-border)',
              fontSize: '13px',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-deep)'
            }}
          >
            <option value="all">Tất cả các sân</option>
            {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Status Filter */}
          <select
            value={historyStatusFilter}
            onChange={(e) => setHistoryStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--color-border)',
              fontSize: '13px',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-deep)'
            }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="cancelled">Đơn đã huỷ</option>
            <option value="paid_cash">Đơn hàng đã thu bằng tiền mặt</option>
            <option value="paid_transfer">Đơn hàng đã thu bằng chuyển khoản</option>
          </select>

          {/* Search query input */}
          <div style={{ flex: '1', minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Tìm theo mã đơn (TL-01), tên món, tên sân..."
              style={{
                width: '100%',
                padding: '9px 34px 9px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--color-surface)',
                color: '#0F172A',
                outline: 'none'
              }}
            />
            {historySearchQuery && (
              <button
                onClick={() => setHistorySearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  fontWeight: 800,
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
                padding: '9px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #CBD5E1',
                backgroundColor: '#F1F5F9',
                color: '#1E293B',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              ✕ Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '44px' }}>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Mã đơn</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sân</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Chi tiết món</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tổng tiền</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Lợi nhuận</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Thời gian đặt</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Thời gian giao</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {historyOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 20px', textAlign: 'center', color: '#475569' }}>
                    <div style={{ fontWeight: 900, fontSize: '16px', color: '#0F172A' }}>Không có đơn hàng nào khớp với bộ lọc hiện tại</div>
                    <div style={{ fontSize: '13px', marginTop: '6px', color: '#475569', fontWeight: 600 }}>Vui lòng thay đổi thời gian, chọn sân khác hoặc xoá từ khoá tìm kiếm.</div>
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

                  const isCancelled = o.status === 'cancelled';
                  const isDelivered = o.status === 'delivered';
                  const isTransfer = o.paymentMethod === 'transfer';
                  const badgeBg = isCancelled ? '#FEE2E2' : isDelivered ? (isTransfer ? '#E0F2FE' : '#DCFCE7') : '#FEF3C7';
                  const badgeColor = isCancelled ? '#DC2626' : isDelivered ? (isTransfer ? '#0369A1' : '#15803D') : '#B45309';
                  const badgeBorder = isCancelled ? '#FCA5A5' : isDelivered ? (isTransfer ? '#BAE6FD' : '#86EFAC') : '#FCD34D';
                  const badgeText = isCancelled
                    ? 'ĐÃ HỦY'
                    : isDelivered
                    ? (isTransfer ? 'ĐÃ THU CHUYỂN KHOẢN' : 'ĐÃ THU TIỀN MẶT')
                    : 'CHƯA THU TIỀN';

                  const orderProfit = isCancelled ? 0 : ((o as any).totalProfitVnd ?? Math.max(0, o.totalVnd - ((o as any).totalCostVnd || 0)));

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#0F172A' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '14px', backgroundColor: '#F8FAFC', padding: '3px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', letterSpacing: '0.4px' }}>{o.displayCode}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>{o.courtName}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '13px', color: '#0F172A' }}>
                          {o.items.map((i, idx) => (
                            <span key={idx} style={{ fontWeight: 600 }}>
                              <strong style={{ fontWeight: 900, color: 'var(--color-deep)' }}>{i.quantity}x</strong> {i.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 900, fontSize: '15px', color: 'var(--color-primary)' }}>{formatVnd(o.totalVnd)}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 900, fontSize: '14px', color: '#0A6B4A' }}>
                        {isCancelled ? '0 ₫' : `+${formatVnd(orderProfit)}`}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          padding: '5px 10px',
                          borderRadius: '6px',
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          border: `1.5px solid ${badgeBorder}`,
                          letterSpacing: '0.3px',
                          display: 'inline-block'
                        }}>
                          {badgeText}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {createdStr}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {deliveredStr}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setSelectedOrderForDetail(o)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#0F172A',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E2E8F0'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                        >
                          Xem chi tiết
                        </button>
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

      {/* MODAL XEM CHI TIẾT ĐƠN BÁN NƯỚC */}
      {selectedOrderForDetail && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '650px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                  Chi Tiết Đơn Hàng Bán Nước & Thực Phẩm
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                  Mã đơn: <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#0F172A' }}>{selectedOrderForDetail.displayCode}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Info grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                backgroundColor: '#F8FAFC',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>VỊ TRÍ SÂN</div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>
                    {selectedOrderForDetail.courtName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>NGƯỜI PHỤ TRÁCH / THU NGÂN</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    {(selectedOrderForDetail as any).createdBy || (selectedOrderForDetail as any).staffName || 'Nhân viên quầy'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>THANH TOÁN</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: selectedOrderForDetail.paymentMethod === 'transfer' ? '#0369A1' : '#15803D', marginTop: '2px' }}>
                    {selectedOrderForDetail.paymentMethod === 'transfer' ? 'Chuyển khoản QR' : 'Tiền mặt'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>THỜI GIAN ĐẶT</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {new Date(selectedOrderForDetail.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedOrderForDetail.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>
                  DANH SÁCH MÓN ĐÃ BÁN
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '40px' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#FFFFFF' }}>Tên món</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>Số lượng</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Đơn giá</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Thành tiền</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Tiền lời</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderForDetail.items.map((it, idx) => {
                        const lineTotal = it.lineTotal || (it.quantity * it.unitPrice);
                        const itemProfit = (it as any).profitVnd ?? Math.max(0, lineTotal - (((it as any).costPrice || 0) * it.quantity));
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '12px', fontWeight: 800, color: '#0F172A' }}>
                              {it.name}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: 900, color: 'var(--color-primary)' }}>
                              {it.quantity}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                              {formatVnd(it.unitPrice)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#0F172A' }}>
                              {formatVnd(lineTotal)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#0A6B4A' }}>
                              +{formatVnd(itemProfit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '12px',
                padding: '14px 18px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>TỔNG SỐ LƯỢNG MÓN</div>
                  <div style={{ fontSize: '14px', color: '#15803D', fontWeight: 800 }}>
                    {selectedOrderForDetail.items.reduce((s, i) => s + i.quantity, 0)} đồ uống / thực phẩm
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG TIỀN ĐƠN HÀNG</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803D' }}>
                    {formatVnd(selectedOrderForDetail.totalVnd)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG LỢI NHUẬN</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0A6B4A' }}>
                    +{formatVnd((selectedOrderForDetail as any).totalProfitVnd || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};