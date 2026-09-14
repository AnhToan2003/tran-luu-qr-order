import React from 'react';
import { formatVnd } from '../../../types/product';

interface ReportsTabProps {
  reportData: any;
  reportTimeFilter: string;
  onSelectTimeFilter: (filterKey: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  reportData,
  reportTimeFilter,
  onSelectTimeFilter,
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
            Báo Cáo Doanh Thu & Hiệu Quả Bán Hàng
          </h2>
        </div>

        {/* Time Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-surface)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          {[
            { key: 'yesterday', label: 'Hôm qua' },
            { key: 'today', label: 'Hôm nay' },
            { key: '7days', label: '1 tuần' },
            { key: 'month', label: '1 tháng' },
            { key: 'all', label: 'Tất cả' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => onSelectTimeFilter(f.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: reportTimeFilter === f.key ? 'var(--color-primary)' : 'transparent',
                color: reportTimeFilter === f.key ? '#FFFFFF' : 'var(--color-text-main)',
                fontWeight: reportTimeFilter === f.key ? 700 : 500,
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards: Doanh thu, Tiền vốn, Lợi nhuận gộp, Công nợ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Revenue */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Doanh thu bán hàng
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-primary)', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalRevenueVnd) : '0đ'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {reportData?.totalOrdersDelivered || 0} đơn hàng đã giao
          </div>
        </div>

        {/* Cost of Goods */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Tiền vốn (Giá nhập)
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-deep)', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalCostVnd || 0) : '0đ'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Chi phí nhập hàng nước giải khát
          </div>
        </div>

        {/* Gross Profit */}
        <div style={{
          backgroundColor: '#f0fdf4',
          padding: '18px',
          borderRadius: 'var(--radius-lg)',
          border: '1.5px solid #86efac',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
              Lợi nhuận
            </div>
            {reportData && (
              <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px' }}>
                Biên lãi: {reportData.profitMarginPercent || 0}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: '#15803d', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalProfitVnd || 0) : '0đ'}
          </div>
          <div style={{ fontSize: '11px', color: '#166534', marginTop: '4px' }}>
            Giá bán trừ giá vốn
          </div>
        </div>

        {/* Unpaid Debt */}
        <div style={{
          backgroundColor: (reportData?.unpaidRevenueVnd || 0) > 0 ? '#fff7ed' : 'var(--color-surface)',
          padding: '18px',
          borderRadius: 'var(--radius-lg)',
          border: `1.5px solid ${(reportData?.unpaidRevenueVnd || 0) > 0 ? '#fed7aa' : 'var(--color-border)'}`,
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: (reportData?.unpaidRevenueVnd || 0) > 0 ? '#c2410c' : 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Chưa thu tiền
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: (reportData?.unpaidRevenueVnd || 0) > 0 ? '#ea580c' : 'var(--color-text-muted)', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.unpaidRevenueVnd || 0) : '0đ'}
          </div>
          <div style={{ fontSize: '11px', color: (reportData?.unpaidRevenueVnd || 0) > 0 ? '#c2410c' : 'var(--color-text-muted)', marginTop: '4px' }}>
            {reportData?.unpaidOrdersCount || 0} đơn chưa thu tiền từ khách
          </div>
        </div>
      </div>

      {/* Secondary Quick Stats */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px', backgroundColor: 'var(--color-surface)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 }}>Tổng chai đã giao:</span>
          <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>{reportData?.totalBottlesDelivered || 0} chai</span>
        </div>
      </div>

      {/* 2 Tables: By Court & Best Sellers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* By Court */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '12px' }}>
            Doanh thu theo từng Sân thi đấu
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reportData?.byCourt?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                Chưa có đơn đã giao trong khoảng thời gian này
              </div>
            ) : (
              reportData?.byCourt?.map((c: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-deep)' }}>{c.name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>{formatVnd(c.revenue)}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>({c.ordersCount} đơn)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Best Sellers with Cost & Profit */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '12px' }}>
            🏆 Xếp hạng Bán chạy & Tiền lời từng loại nước
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reportData?.bestSellers?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                Chưa có dữ liệu bán hàng
              </div>
            ) : (
              reportData?.bestSellers?.map((p: any, idx: number) => {
                const profit = p.profit || (p.revenue - (p.cost || 0));
                return (
                  <div key={idx} style={{ padding: '10px 12px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div>
                        <span style={{ fontWeight: 800, color: 'var(--color-primary)', marginRight: '8px' }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 700 }}>{p.name}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>{p.bottles} chai</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      <span>Doanh thu: <strong style={{ color: 'var(--color-text-main)' }}>{formatVnd(p.revenue)}</strong></span>
                      <span>Vốn: {formatVnd(p.cost || 0)}</span>
                      <span>
                        Lời: <strong style={{ color: '#16a34a' }}>+{formatVnd(profit)}</strong>
                        {p.profitMargin !== undefined && (
                          <span style={{ marginLeft: '4px', fontSize: '10px', color: '#15803d' }}>
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