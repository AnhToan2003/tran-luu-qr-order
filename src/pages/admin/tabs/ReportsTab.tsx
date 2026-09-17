import React from 'react';
import { formatVnd } from '../../../types/product';

interface ReportsTabProps {
  reportData: any;
  reportTimeFilter: string;
  onSelectTimeFilter: (filterKey: string) => void;
  reportCategoryFilter?: string;
  onSelectCategoryFilter?: (catKey: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  reportData,
  reportTimeFilter,
  onSelectTimeFilter,
  reportCategoryFilter = 'all',
  onSelectCategoryFilter
}) => {
  const breakdown = reportData?.breakdown || {};
  const drinks = breakdown.drinks || { revenue: 0, cost: 0, profit: 0, quantity: 0 };
  const sports = breakdown.sports || { revenue: 0, cost: 0, profit: 0, quantity: 0 };
  const service = breakdown.service || { revenue: 0, cost: 0, profit: 0, quantity: 0 };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
            Báo Cáo Doanh Thu & Lợi Nhuận
          </h2>
          <p style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
            Tổng hợp doanh thu từ đơn gọi nước tại sân, bán đồ thể thao và dịch vụ tại quầy
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-surface)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          {[
            { key: 'today', label: 'Hôm nay' },
            { key: 'yesterday', label: 'Hôm qua' },
            { key: '7days', label: '7 ngày' },
            { key: 'month', label: '1 tháng' },
            { key: 'all', label: 'Tất cả' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => onSelectTimeFilter(f.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: reportTimeFilter === f.key ? '#0A6B4A' : 'transparent',
                color: reportTimeFilter === f.key ? '#FFFFFF' : '#334155',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Segment Filter Toolbar */}
      {onSelectCategoryFilter && (
        <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--color-surface)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginRight: '6px' }}>
            Xem theo mảng:
          </span>
          {[
            { key: 'all', label: 'TẤT CẢ KINH DOANH' },
            { key: 'drinks', label: 'NƯỚC UỐNG (ORDER SÂN)' },
            { key: 'sports', label: 'ĐỒ THỂ THAO TẠI QUẦY' },
            { key: 'service', label: 'DỊCH VỤ SÂN' }
          ].map(c => (
            <button
              key={c.key}
              onClick={() => onSelectCategoryFilter(c.key)}
              style={{
                padding: '7px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: reportCategoryFilter === c.key ? '#0F172A' : '#F1F5F9',
                color: reportCategoryFilter === c.key ? '#FFFFFF' : '#334155',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Primary 3 KPI Cards: Revenue, Cost, Profit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {/* Total Revenue */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Doanh thu thực thu
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0A6B4A', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalRevenueVnd) : '0đ'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', fontWeight: 700, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#0F172A' }}>Tiền mặt: <strong>{formatVnd(reportData?.cashRevenue || 0)}</strong></span>
            <span>•</span>
            <span style={{ color: '#1D4ED8' }}>Chuyển khoản: <strong>{formatVnd(reportData?.transferRevenue || 0)}</strong></span>
            {reportData?.unpaidDebtVnd > 0 && (
              <>
                <span>•</span>
                <span style={{ color: '#DC2626' }}>Công nợ chưa thu: <strong>{formatVnd(reportData.unpaidDebtVnd)}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Cost of Goods */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tiền vốn (Giá nhập)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#D97706', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalCostVnd || 0) : '0đ'}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', fontWeight: 700 }}>
            Tổng chi phí giá vốn hàng đã bán
          </div>
        </div>

        {/* Gross Profit */}
        <div style={{
          backgroundColor: '#F0FDF4',
          padding: '18px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1.5px solid #86EFAC',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Lợi nhuận gộp
            </div>
            {reportData && (
              <span style={{ fontSize: '12px', fontWeight: 900, backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '4px', border: '1px solid #86EFAC' }}>
                Biên lãi: {reportData.profitMarginPercent || 0}%
              </span>
            )}
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#15803D', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalProfitVnd || 0) : '0đ'}
          </div>
          <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px', fontWeight: 700 }}>
            Doanh thu trừ tổng chi phí vốn
          </div>
        </div>
      </div>

      {/* 3 Domain Breakdown Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        {/* Drink Segment */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Nước Uống (Order Sân)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {formatVnd(drinks.revenue)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Đã phục vụ: <strong>{drinks.quantity} chai/lon</strong></span>
            <span>Lời: <strong style={{ color: '#15803D' }}>+{formatVnd(drinks.profit)}</strong></span>
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
            <span>Tiền mặt: <strong>{formatVnd(drinks.cashRevenue || 0)}</strong></span>
            <span>Chuyển khoản: <strong>{formatVnd(drinks.transferRevenue || 0)}</strong></span>
          </div>
        </div>

        {/* Sports Segment */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Đồ Thể Thao Tại Quầy
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {formatVnd(sports.revenue)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Đã bán: <strong>{sports.quantity} sản phẩm</strong></span>
            <span>Lời: <strong style={{ color: '#15803D' }}>+{formatVnd(sports.profit)}</strong></span>
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
            <span>Tiền mặt: <strong>{formatVnd(sports.cashRevenue || 0)}</strong></span>
            <span>Chuyển khoản: <strong>{formatVnd(sports.transferRevenue || 0)}</strong></span>
          </div>
        </div>

        {/* Service Segment */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dịch Vụ Sân (Đan Cước / Thuê Đồ)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {formatVnd(service.revenue)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Số lượt: <strong>{service.quantity} lượt</strong></span>
            <span>Lời: <strong style={{ color: '#15803D' }}>+{formatVnd(service.profit)}</strong></span>
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
            <span>Tiền mặt: <strong>{formatVnd(service.cashRevenue || 0)}</strong></span>
            <span>Chuyển khoản: <strong>{formatVnd(service.transferRevenue || 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* 2 Detailed Tables: By Court & Best Sellers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        
        {/* By Court / Counter */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0' }}>
            DOANH THU THEO TỪNG SÂN & QUẦY
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {reportData?.byCourt?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>
                Chưa có đơn đã hoàn tất trong khoảng thời gian này
              </div>
            ) : (
              reportData?.byCourt?.map((c: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{c.name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 900, color: '#0A6B4A', fontSize: '14px' }}>{formatVnd(c.revenue)}</span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginLeft: '8px' }}>({c.ordersCount} đơn)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Best Sellers */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0' }}>
            XẾP HẠNG BÁN CHẠY & TIỀN LỜI TỪNG MẶT HÀNG
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
            {reportData?.bestSellers?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>
                Chưa có dữ liệu bán hàng
              </div>
            ) : (
              reportData?.bestSellers?.map((p: any, idx: number) => {
                const profit = p.profit || (p.revenue - (p.cost || 0));
                const itemTypeLabel = p.itemType === 'service'
                  ? 'Dịch vụ sân'
                  : p.itemType === 'sports'
                  ? 'Đồ thể thao'
                  : 'Nước uống';

                return (
                  <div key={idx} style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 900, color: '#0A6B4A', fontSize: '13px' }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>{p.name}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', backgroundColor: '#E2E8F0', color: '#334155' }}>
                          {itemTypeLabel}
                        </span>
                      </div>
                      <span style={{ fontWeight: 900, color: '#0F172A', fontSize: '13px' }}>
                        {p.quantity || p.bottles} {p.unit || 'món'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B', fontWeight: 700, flexWrap: 'wrap', gap: '8px' }}>
                      <span>Doanh thu: <strong style={{ color: '#0F172A', fontWeight: 800 }}>{formatVnd(p.revenue)}</strong></span>
                      <span>Vốn: <strong style={{ color: '#0F172A', fontWeight: 800 }}>{formatVnd(p.cost || 0)}</strong></span>
                      <span>
                        Tiền lời: <strong style={{ color: '#15803D', fontWeight: 900 }}>+{formatVnd(profit)}</strong>
                        {p.profitMargin !== undefined && (
                          <span style={{ marginLeft: '4px', fontSize: '11px', color: '#15803D', fontWeight: 800 }}>
                            ({p.profitMargin}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
};