import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd } from '../../../types/product';
import { apiFetch } from '../../../lib/api';

const exportSportsSalesToExcel = async (
  ...args: Parameters<typeof import('../../../lib/excelExport').exportSportsSalesToExcel>
) => (await import('../../../lib/excelExport')).exportSportsSalesToExcel(...args);

interface SportsOrderHistoryItem {
  id: string;
  orderId: string;
  displayCode: string;
  courtId: string;
  courtName: string;
  courtNameSnapshot?: string;
  customerName: string;
  customerPhone?: string;
  paymentMethod: 'cash' | 'transfer';
  paymentStatus: string;
  status: string;
  totalVnd: number;
  totalCostVnd?: number;
  totalProfitVnd?: number;
  items: Array<{
    productId: string;
    name: string;
    nameSnapshot?: string;
    volume?: string;
    volumeSnapshot?: string;
    quantity: number;
    unitPrice: number;
    unitPriceVnd?: number;
    costPrice?: number;
    lineTotal: number;
    lineTotalVnd?: number;
    costTotalVnd?: number;
    profitVnd?: number;
  }>;
  createdAt: string;
  deliveredAt?: string;
  createdBy?: string;
  staffName?: string;
}

export const SportsOrderHistoryTab: React.FC = () => {
  const [orders, setOrders] = useState<SportsOrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Filters
  const [timePreset, setTimePreset] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Summary
  const [summary, setSummary] = useState({
    totalMatched: 0,
    totalRevenueVnd: 0,
    totalItems: 0,
    totalProfitVnd: 0
  });

  // Modal in lại hóa đơn
  const [selectedOrderForBill, setSelectedOrderForBill] = useState<SportsOrderHistoryItem | null>(null);

  const fetchSportsOrders = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        orderType: 'sports_pos',
        timePreset,
        page: String(page),
        limit: '15'
      });
      if (timePreset === 'custom') {
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
      }
      if (paymentMethod !== 'all') {
        q.append('paymentMethod', paymentMethod);
      }
      if (searchQuery.trim()) {
        q.append('search', searchQuery.trim());
      }

      const res = await apiFetch(`/api/admin/reports/history?${q.toString()}`);
      if (!res.ok) throw new Error('Không thể tải lịch sử bán hàng thể thao');
      const data = await res.json();

      const rawOrders: any[] = data.orders || [];
      const normalizedOrders: SportsOrderHistoryItem[] = rawOrders.map(o => {
        const totalVnd = o.totalVnd || 0;
        const totalCostVnd = o.totalCostVnd || 0;
        const totalProfitVnd = o.totalProfitVnd !== undefined
          ? o.totalProfitVnd
          : Math.max(0, totalVnd - totalCostVnd);

        return {
          id: o.id || o.orderId,
          orderId: o.orderId,
          displayCode: o.displayCode,
          courtId: o.courtId,
          courtName: o.courtName || o.courtNameSnapshot || 'Quầy lễ tân',
          customerName: o.customerName || 'Khách tại quầy',
          customerPhone: o.customerPhone || '',
          paymentMethod: o.paymentMethod || 'cash',
          paymentStatus: o.paymentStatus || 'paid',
          status: o.status || 'delivered',
          totalVnd,
          totalCostVnd,
          totalProfitVnd,
          items: (o.items || []).map((i: any) => {
            const qty = i.quantity || 0;
            const unitPrice = i.unitPrice || i.unitPriceVnd || 0;
            const lineTotal = i.lineTotal || i.lineTotalVnd || (qty * unitPrice);
            const costPrice = i.costPrice || 0;
            const costTotalVnd = i.costTotalVnd || (costPrice * qty);
            const profitVnd = i.profitVnd !== undefined
              ? i.profitVnd
              : Math.max(0, lineTotal - costTotalVnd);

            return {
              productId: i.productId,
              name: i.name || i.nameSnapshot,
              volume: i.volume || i.volumeSnapshot || 'Cái',
              quantity: qty,
              unitPrice,
              costPrice,
              lineTotal,
              costTotalVnd,
              profitVnd
            };
          }),
          createdAt: o.createdAt,
          deliveredAt: o.deliveredAt,
          createdBy: o.createdBy || o.staffName || '',
          staffName: o.staffName || o.createdBy || ''
        };
      });

      setOrders(normalizedOrders);
      setTotalPages(data.totalPages || 1);

      const itemsTotal = normalizedOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
      setSummary({
        totalMatched: data.summary?.totalOrders || data.totalMatched || normalizedOrders.length,
        totalRevenueVnd: data.summary?.totalRevenueVnd || normalizedOrders.reduce((s, o) => s + o.totalVnd, 0),
        totalItems: data.summary?.totalBottles || itemsTotal,
        totalProfitVnd: data.summary?.totalProfitVnd !== undefined
          ? data.summary.totalProfitVnd
          : normalizedOrders.reduce((s, o) => s + (o.totalProfitVnd || 0), 0)
      });
    } catch (err: any) {
      setError(err.message || 'Lỗi tải lịch sử');
    } finally {
      setIsLoading(false);
    }
  }, [timePreset, startDate, endDate, paymentMethod, searchQuery, page]);

  useEffect(() => {
    fetchSportsOrders();
  }, [fetchSportsOrders]);

  const handleExportExcel = async () => {
    try {
      const q = new URLSearchParams({
        orderType: 'sports_pos',
        timePreset,
        limit: '200'
      });
      if (timePreset === 'custom') {
        if (startDate) q.append('startDate', startDate);
        if (endDate) q.append('endDate', endDate);
      }
      if (paymentMethod !== 'all') q.append('paymentMethod', paymentMethod);
      if (searchQuery.trim()) q.append('search', searchQuery.trim());

      const res = await apiFetch(`/api/admin/reports/history?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const exportList = data.orders || orders;
        await exportSportsSalesToExcel(exportList, summary);
      } else {
        await exportSportsSalesToExcel(orders, summary);
      }
    } catch {
      await exportSportsSalesToExcel(orders, summary);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-deep)', margin: 0 }}>
            Lịch Sử Bán Hàng Thể Thao & Dịch Vụ
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Theo dõi tất cả các hóa đơn bán dụng cụ, phụ kiện và dịch vụ sân tại quầy POS
          </p>
        </div>

        <button
          onClick={handleExportExcel}
          style={{
            padding: '10px 18px',
            backgroundColor: '#15803D',
            color: '#FFFFFF',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(21, 128, 61, 0.25)',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <span>XUẤT FILE EXCEL ({summary.totalMatched} ĐƠN)</span>
        </button>
      </div>

      {/* KPI SUMMARY BANNER */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        <div style={{ backgroundColor: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>
            Tổng đơn thể thao
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
            {summary.totalMatched} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>đơn</span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>
            Doanh thu bán thể thao
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '4px' }}>
            {formatVnd(summary.totalRevenueVnd)}
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>
            Tổng lợi nhuận thực thu
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0A6B4A', marginTop: '4px' }}>
            +{formatVnd(summary.totalProfitVnd)}
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>
            Sản phẩm / Dịch vụ bán ra
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
            {summary.totalItems} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>món</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR BỘ LỌC */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Preset thời gian */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginRight: '4px' }}>Thời gian:</span>
          {[
            { id: 'today', label: 'Hôm nay' },
            { id: 'yesterday', label: 'Hôm qua' },
            { id: '7days', label: '7 ngày qua' },
            { id: 'month', label: 'Tháng này' },
            { id: 'custom', label: 'Tùy chọn ngày' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => {
                setTimePreset(p.id);
                setPage(1);
                if (p.id !== 'custom') {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                border: 'none',
                backgroundColor: timePreset === p.id ? 'var(--color-primary)' : '#F1F5F9',
                color: timePreset === p.id ? '#FFFFFF' : '#475569',
                cursor: 'pointer'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Tùy chọn ngày custom & Tìm kiếm */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {timePreset === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              />
              <span style={{ fontSize: '12px', color: '#64748B' }}>đến</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              />
            </div>
          )}

          <select
            value={paymentMethod}
            onChange={e => { setPaymentMethod(e.target.value); setPage(1); }}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: '#FFFFFF'
            }}
          >
            <option value="all">Tất cả hình thức TT</option>
            <option value="cash">Tiền mặt</option>
            <option value="transfer">Chuyển khoản QR</option>
          </select>

          <input
            type="text"
            placeholder="Tìm theo mã đơn (#TT-...), tên khách, mặt hàng..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              flex: 1,
              minWidth: '240px'
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', border: '1px solid #F87171', borderRadius: '8px', color: '#DC2626', fontSize: '13px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {/* TABLE DANH SÁCH ĐƠN BÁN THỂ THAO */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
            <thead>
              <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '44px' }}>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Mã đơn</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Thời gian</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Khu vực / Khách hàng</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Chi tiết dụng cụ & dịch vụ</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right' }}>Tổng thanh toán</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right' }}>Lợi nhuận</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Hình thức</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, fontSize: '12px', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: '#64748B' }}>
                    Đang tải dữ liệu bán hàng thể thao...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A' }}>Chưa có đơn bán thể thao nào trong khoảng thời gian này</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>Hãy thử chọn mốc thời gian khác hoặc kiểm tra tại Quầy Thể Thao POS.</div>
                  </td>
                </tr>
              ) : (
                orders.map(o => {
                  const d = new Date(o.createdAt);
                  const timeStr = `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: 900,
                          fontSize: '13px',
                          backgroundColor: '#F1F5F9',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          color: '#0F172A'
                        }}>
                          {o.displayCode}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {timeStr}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{o.courtName}</div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>{o.customerName} {o.customerPhone ? `• ${o.customerPhone}` : ''}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {o.items.map((it, idx) => (
                            <div key={idx} style={{ fontSize: '13px', color: '#0F172A' }}>
                              <strong style={{ color: 'var(--color-primary)' }}>{it.quantity}x</strong> {it.name}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: 'var(--color-primary)' }}>
                        {formatVnd(o.totalVnd)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: '#0A6B4A' }}>
                        +{formatVnd(o.totalProfitVnd || 0)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: o.paymentMethod === 'transfer' ? '#EFF6FF' : '#F0FDF4',
                          color: o.paymentMethod === 'transfer' ? '#1E40AF' : '#15803D',
                          border: `1px solid ${o.paymentMethod === 'transfer' ? '#BFDBFE' : '#BBF7D0'}`
                        }}>
                          {o.paymentMethod === 'transfer' ? 'Chuyển khoản QR' : 'Tiền mặt'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedOrderForBill(o)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#0F172A',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
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

        {/* PHÂN TRANG */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.6 : 1
              }}
            >
              Trang trước
            </button>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.6 : 1
              }}
            >
              Trang sau
            </button>
          </div>
        )}
      </div>

      {/* MODAL CHI TIẾT & IN PHIẾU BÁN DỤNG CỤ / DỊCH VỤ */}
      {selectedOrderForBill && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div
            id="receipt-print-area"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '560px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
              border: '1px solid #CBD5E1',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            {/* Tiêu đề phiếu */}
            <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '1px dashed #CBD5E1' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                SÂN CẦU LÔNG TRẦN LỰU
              </div>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px', fontWeight: 700 }}>
                CHI TIẾT ĐƠN HÀNG BÁN THỂ THAO & DỊCH VỤ
              </div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '6px' }}>
                MÃ ĐƠN: {selectedOrderForBill.displayCode}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                {new Date(selectedOrderForBill.createdAt).toLocaleString('vi-VN')}
              </div>
            </div>

            {/* Thông tin người mua & Người phụ trách */}
            <div style={{ margin: '14px 0', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Đối tượng:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>{selectedOrderForBill.courtName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Khách hàng:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                  {selectedOrderForBill.customerName} {selectedOrderForBill.customerPhone ? `(${selectedOrderForBill.customerPhone})` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Người phụ trách / Thu ngân:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                  {selectedOrderForBill.createdBy || selectedOrderForBill.staffName || 'Nhân viên quầy'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Phương thức thanh toán:</span>
                <span style={{ fontWeight: 800, color: selectedOrderForBill.paymentMethod === 'transfer' ? '#0369A1' : '#15803D' }}>
                  {selectedOrderForBill.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản QR'}
                </span>
              </div>
            </div>

            {/* Danh sách món chi tiết có cột Lợi nhuận */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', margin: '14px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '36px' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800, color: '#FFFFFF' }}>Mặt hàng / Dịch vụ</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>SL</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Đơn giá</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Thành tiền</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Tiền lời</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderForBill.items.map((it, idx) => {
                    const lineTotal = it.lineTotal || (it.quantity * it.unitPrice);
                    const itemProfit = it.profitVnd !== undefined
                      ? it.profitVnd
                      : Math.max(0, lineTotal - ((it.costPrice || 0) * it.quantity));

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A' }}>{it.name}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#0F172A' }}>{it.quantity}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{formatVnd(it.unitPrice)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>{formatVnd(lineTotal)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0A6B4A' }}>+{formatVnd(itemProfit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tổng cộng & Tổng tiền lời */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: '#F8FAFC',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '18px',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>TỔNG THANH TOÁN:</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary)' }}>
                  {formatVnd(selectedOrderForBill.totalVnd)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>TỔNG LỢI NHUẬN:</span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#0A6B4A' }}>
                  +{formatVnd(selectedOrderForBill.totalProfitVnd || 0)}
                </span>
              </div>
            </div>

            {/* Cụm nút thao tác (bị ẩn khi in bằng class no-print) */}
            <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                In Phiếu
              </button>
              <button
                onClick={() => setSelectedOrderForBill(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 800,
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
