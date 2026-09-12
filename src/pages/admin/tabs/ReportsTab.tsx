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

      {/* KPI Cards (3 cards: Doanh thu, Số chai, Ly đá) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Doanh thu thực thu
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-primary)', marginTop: '6px' }}>
            {reportData ? formatVnd(reportData.totalRevenueVnd) : '0đ'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {reportData?.totalOrdersDelivered || 0} đơn hàng đã giao
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Tổng chai nước đã giao
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-deep)', marginTop: '6px' }}>
            {reportData?.totalBottlesDelivered || 0} chai
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Nước giải khát tiêu thụ
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Tổng ly đá phục vụ
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: '#3B82F6', marginTop: '6px' }}>
            {reportData?.totalIceServed || 0} ly
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Phục vụ miễn phí theo chai
          </div>
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

        {/* Best Sellers */}
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '12px' }}>
            Xếp hạng Nước giải khát Bán chạy nhất
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reportData?.bestSellers?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                Chưa có dữ liệu bán hàng
              </div>
            ) : (
              reportData?.bestSellers?.map((p: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <span style={{ fontWeight: 800, color: 'var(--color-primary)', marginRight: '8px' }}>#{idx + 1}</span>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800 }}>{p.bottles} chai</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>({formatVnd(p.revenue)})</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};