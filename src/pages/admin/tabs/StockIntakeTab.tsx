import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd, Product } from '../../../types/product';
import { apiFetch } from '../../../lib/api';

export interface StockIntakeItem {
  id: string;
  operationId: string;
  productId: string;
  productName: string;
  volume: string;
  reason: string;
  quantity: number;
  costPriceVnd: number;
  sellingPriceVnd: number;
  totalCostVnd: number;
  expectedRevenueVnd: number;
  profitMarginVnd: number;
  profitMarginPct: number;
  stockAfter: number;
  note: string;
  createdAt: string;
}

export interface StockIntakeSummary {
  totalBatches: number;
  totalQuantity: number;
  totalCostValueVnd: number;
  totalExpectedRevenueVnd: number;
  totalExpectedProfitVnd: number;
  overallMarginPct: number;
}

interface StockIntakeTabProps {
  products: Product[];
}

const exportStockIntakeToExcel = async (
  ...args: Parameters<typeof import('../../../lib/excelExport').exportStockIntakeToExcel>
) => (await import('../../../lib/excelExport')).exportStockIntakeToExcel(...args);

export const StockIntakeTab: React.FC<StockIntakeTabProps> = ({
  products
}) => {
  const [items, setItems] = useState<StockIntakeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // Pagination & Server Summary
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [activeSummary, setActiveSummary] = useState<StockIntakeSummary>({
    totalBatches: 0,
    totalQuantity: 0,
    totalCostValueVnd: 0,
    totalExpectedRevenueVnd: 0,
    totalExpectedProfitVnd: 0,
    overallMarginPct: 0
  });

  // Debounce search input by 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchIntakeHistory = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        timePreset: timeFilter
      });
      if (selectedProductId !== 'all') {
        q.append('productId', selectedProductId);
      }
      if (debouncedSearch.trim()) {
        q.append('search', debouncedSearch.trim());
      }
      const res = await apiFetch(`/api/admin/inventory/intake-history?${q.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải lịch sử nhập hàng');
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotalItems(data.totalItems || 0);
      setTotalPages(data.totalPages || 1);
      if (data.summary) {
        setActiveSummary(data.summary);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, timeFilter, selectedProductId, debouncedSearch]);

  useEffect(() => {
    fetchIntakeHistory();
  }, [fetchIntakeHistory]);

  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // 1. Tải trang đầu với limit tối đa của server (500)
      const q = new URLSearchParams({
        page: '1',
        limit: '500',
        timePreset: timeFilter
      });
      if (selectedProductId !== 'all') {
        q.append('productId', selectedProductId);
      }
      if (debouncedSearch.trim()) {
        q.append('search', debouncedSearch.trim());
      }

      const res = await apiFetch(`/api/admin/inventory/intake-history?${q.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải lịch sử nhập hàng để xuất Excel');
      }
      const data = await res.json();

      let allItems: StockIntakeItem[] = [...(data.items || [])];
      const summaryToExport: StockIntakeSummary = data.summary || activeSummary;
      const totalP = data.totalPages || 1;

      // 2. Nếu có nhiều hơn 1 trang, fetch tiếp tất cả các trang còn lại
      if (totalP > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalP; p++) {
          const nextQ = new URLSearchParams({
            page: String(p),
            limit: '500',
            timePreset: timeFilter
          });
          if (selectedProductId !== 'all') nextQ.append('productId', selectedProductId);
          if (debouncedSearch.trim()) nextQ.append('search', debouncedSearch.trim());
          pagePromises.push(
            apiFetch(`/api/admin/inventory/intake-history?${nextQ.toString()}`)
              .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi tải trang ${p}`))))
              .then(d => d.items || [])
          );
        }
        const remainingResults = await Promise.all(pagePromises);
        for (const pageItems of remainingResults) {
          allItems = allItems.concat(pageItems);
        }
      }

      if (allItems.length === 0) {
        alert('Không có dữ liệu nhập hàng nào phù hợp với bộ lọc hiện tại để xuất Excel!');
        return;
      }

      // Thông tin bộ lọc hiển thị trên sheet KPI
      const timeFilterMap: Record<string, string> = {
        all: 'Tất cả thời gian',
        today: 'Hôm nay',
        '7days': '7 ngày gần nhất',
        '30days': '30 ngày gần nhất'
      };
      const selectedProduct = products.find(p => p.id === selectedProductId);
      const productFilterLabel =
        selectedProductId === 'all'
          ? `Tất cả (${products.length} sản phẩm)`
          : selectedProduct
          ? `${selectedProduct.name} (${selectedProduct.volume || ''})`
          : selectedProductId;

      await exportStockIntakeToExcel(allItems, summaryToExport, {
        timeFilterLabel: timeFilterMap[timeFilter] || timeFilter,
        productFilterLabel,
        searchQuery: debouncedSearch.trim() || undefined
      });
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredItems = items;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
            Lịch Sử Nhập Hàng & Thống Kê Giá Vốn
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Theo dõi chi tiết giá vốn đầu vào, giá bán niêm yết, lợi nhuận dự tính và lịch sử nhập kho từng đợt
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchIntakeHistory}
            disabled={isLoading || isExporting}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              cursor: isLoading || isExporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Tải lại</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || isLoading}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isExporting ? '#9CA3AF' : '#10B981',
              color: '#FFFFFF',
              border: 'none',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              cursor: isExporting || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-sm)',
              transition: 'background-color 0.15s ease'
            }}
            title="Xuất bảng thống kê nhập hàng và giá vốn ra file Excel"
          >
            <span>📊</span>
            <span>{isExporting ? 'Đang xuất Excel...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI CARDS: Clean POS/Dashboard Style */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* Card 1: Số đợt nhập */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            SỐ ĐỢT NHẬP
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '4px' }}>
            {activeSummary.totalBatches} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>đợt</span>
          </div>
        </div>

        {/* Card 2: Tổng số lượng nhập */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            TỔNG SỐ LƯỢNG NHẬP
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>
            {activeSummary.totalQuantity.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>chai/lon</span>
          </div>
        </div>

        {/* Card 3: Tổng vốn nhập hàng */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            TỔNG TIỀN VỐN ĐÃ NHẬP
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '4px' }}>
            {formatVnd(activeSummary.totalCostValueVnd)}
          </div>
        </div>

        {/* Card 4: Lợi nhuận dự tính */}
        <div style={{
          backgroundColor: '#F0FDF4',
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid #BBF7D0',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 800, letterSpacing: '0.5px' }}>
              LỢI NHUẬN DỰ TÍNH
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: '#DCFCE7',
              color: '#166534'
            }}>
              Biên lãi: {activeSummary.overallMarginPct}%
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803D', marginTop: '4px' }}>
            {formatVnd(activeSummary.totalExpectedProfitVnd)}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px', flexWrap: 'wrap' }}>
          {/* Search box */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Tìm:
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nhập tên sản phẩm hoặc ghi chú..."
              style={{
                width: '100%',
                padding: '7px 12px 7px 42px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                backgroundColor: 'var(--color-bg)',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Product Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>SẢN PHẨM:</span>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-deep)'
              }}
            >
              <option value="all">Tất cả sản phẩm ({products.length})</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.volume})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time presets */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-bg)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'today', label: 'Hôm nay' },
            { key: '7days', label: '7 ngày' },
            { key: '30days', label: '30 ngày' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setTimeFilter(f.key as any)}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: timeFilter === f.key ? 'var(--color-deep)' : 'transparent',
                color: timeFilter === f.key ? '#FFFFFF' : 'var(--color-text-main)',
                fontWeight: timeFilter === f.key ? 700 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.1s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* DATA TABLE */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Đang tải dữ liệu lịch sử nhập hàng...
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#DC2626' }}>
            <p style={{ fontWeight: 700 }}>{error}</p>
            <button
              onClick={fetchIntakeHistory}
              style={{
                marginTop: '8px',
                padding: '6px 14px',
                backgroundColor: 'var(--color-deep)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Thử lại
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Không có dữ liệu nhập hàng nào phù hợp với bộ lọc hiện tại
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', whiteSpace: 'nowrap' }}>Thời gian nhập</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)' }}>Sản phẩm</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'right' }}>Số lượng</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'right' }}>Giá vào (Vốn)</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'right' }}>Giá bán ra</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'right' }}>Lãi / chai</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'right' }}>Tổng tiền vốn</th>
                  <th style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--color-deep)', textAlign: 'center' }}>Tồn sau nhập</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const perUnitProfit = item.sellingPriceVnd - item.costPriceVnd;
                  return (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                      }}
                    >
                      {/* Thời gian */}
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Tên sản phẩm & Quy cách */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--color-deep)' }}>{item.productName}</div>
                        {item.volume && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.volume}</div>
                        )}
                      </td>

                      {/* Số lượng */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#2563EB' }}>
                        +{item.quantity}
                      </td>

                      {/* Giá vào (Vốn) */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--color-deep)' }}>
                        {formatVnd(item.costPriceVnd)}
                      </td>

                      {/* Giá bán ra */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {formatVnd(item.sellingPriceVnd)}
                      </td>

                      {/* Lãi / chai */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: perUnitProfit >= 0 ? '#15803D' : '#DC2626' }}>
                        +{formatVnd(perUnitProfit)}
                      </td>

                      {/* Tổng tiền vốn lô */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--color-deep)' }}>
                        {formatVnd(item.totalCostVnd)}
                      </td>

                      {/* Tồn sau nhập */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: '#F3F4F6',
                          color: 'var(--color-deep)',
                          fontWeight: 700,
                          fontSize: '11px'
                        }}>
                          {item.stockAfter}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FOOTER SUMMARY & PAGINATION */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        fontSize: '12px',
        color: 'var(--color-text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          Hiển thị <strong>{filteredItems.length}</strong> / <strong>{totalItems}</strong> lượt nhập kho • Tổng lượng: <strong>{activeSummary.totalQuantity.toLocaleString()}</strong> sản phẩm
        </div>

        {/* Nút phân trang */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: page <= 1 ? '#F3F4F6' : 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: page <= 1 ? '#9CA3AF' : 'var(--color-deep)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '11px'
            }}
          >
            ← Trước
          </button>
          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-deep)' }}>
            Trang {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: page >= totalPages ? '#F3F4F6' : 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: page >= totalPages ? '#9CA3AF' : 'var(--color-deep)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '11px'
            }}
          >
            Sau →
          </button>
        </div>

        <div>
          Tổng vốn đầu tư: <strong>{formatVnd(activeSummary.totalCostValueVnd)}</strong> • Lợi nhuận dự tính: <strong>{formatVnd(activeSummary.totalExpectedProfitVnd)}</strong>
        </div>
      </div>
    </div>
  );
};
