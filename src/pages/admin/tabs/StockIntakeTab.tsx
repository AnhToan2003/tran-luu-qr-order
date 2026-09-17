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
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
            Lịch sử nhập hàng
          </h2>
          <p style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
            Theo dõi chi tiết các đợt nhập hàng, số lượng, giá vốn đầu vào và tồn kho sau nhập
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchIntakeHistory}
            disabled={isLoading || isExporting}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              fontSize: '13px',
              fontWeight: 800,
              color: '#0F172A',
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
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isExporting ? '#94A3B8' : '#059669',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13px',
              fontWeight: 800,
              cursor: isExporting || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-sm)',
              transition: 'background-color 0.15s ease'
            }}
            title="Xuất bảng thống kê nhập hàng và giá vốn ra file Excel"
          >
            <span>{isExporting ? 'Đang xuất Excel...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI CARDS: Clean POS/Dashboard Style - 2 Thẻ theo đúng yêu cầu */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1: Tổng số Nhập hàng */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '18px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tổng số Nhập hàng
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {(activeSummary.totalBatches ?? (activeSummary as any).totalIntakes)?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '13px', color: '#1D4ED8', marginTop: '4px', fontWeight: 700 }}>
            {activeSummary.totalQuantity.toLocaleString()} {selectedProductId !== 'all' ? (products.find(p => p.id === selectedProductId)?.volume || 'sản phẩm') : 'sản phẩm'} đã nhập
          </div>
        </div>

        {/* Card 2: Giá Nhập */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '18px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Giá Nhập {selectedProductId !== 'all' && products.find(p => p.id === selectedProductId) ? `• ${products.find(p => p.id === selectedProductId)?.name}` : ''}
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#D97706', marginTop: '6px' }}>
            {formatVnd(activeSummary.totalCostValueVnd)}
          </div>
          <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 700 }}>
            {selectedProductId !== 'all' && products.find(p => p.id === selectedProductId)
              ? `Tổng vốn nhập của riêng "${products.find(p => p.id === selectedProductId)?.name}"`
              : 'Chi phí nhập kho đã chi'}
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        padding: '14px 18px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search input + product select */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '240px', maxWidth: '380px', flex: 1 }}>
            <span style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '11px',
              fontWeight: 800,
              color: '#334155'
            }}>
              TÌM:
            </span>
            <input
              type="text"
              placeholder="Tên sản phẩm, quy cách..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 48px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0F172A',
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
                  color: '#334155',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Product Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>SẢN PHẨM:</span>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: 'var(--color-bg)',
                color: '#0F172A'
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
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-bg)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
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
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: timeFilter === f.key ? '#0F172A' : 'transparent',
                color: timeFilter === f.key ? '#FFFFFF' : '#0F172A',
                fontWeight: 800,
                fontSize: '13px',
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
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
            Đang tải dữ liệu lịch sử đặt hàng...
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#DC2626' }}>
            <p style={{ fontWeight: 800, fontSize: '14px' }}>{error}</p>
            <button
              onClick={fetchIntakeHistory}
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Thử lại
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
            Không có dữ liệu đặt hàng nào phù hợp với bộ lọc hiện tại
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', whiteSpace: 'nowrap', fontSize: '13px', textTransform: 'uppercase' }}>Thời gian nhập</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', fontSize: '13px', textTransform: 'uppercase' }}>Sản phẩm</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'right', fontSize: '13px', textTransform: 'uppercase' }}>Số lượng</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'right', fontSize: '13px', textTransform: 'uppercase' }}>Giá vào (Vốn)</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'right', fontSize: '13px', textTransform: 'uppercase' }}>Giá bán ra</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'right', fontSize: '13px', textTransform: 'uppercase' }}>Lãi / chai</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'right', fontSize: '13px', textTransform: 'uppercase' }}>Tổng tiền vốn</th>
                  <th style={{ padding: '12px 14px', fontWeight: 900, color: '#0F172A', textAlign: 'center', fontSize: '13px', textTransform: 'uppercase' }}>Tồn sau nhập</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const perUnitProfit = item.sellingPriceVnd - item.costPriceVnd;
                  return (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: '1px solid #E2E8F0',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : '#F8FAFC'
                      }}
                    >
                      {/* Thời gian */}
                      <td style={{ padding: '12px 14px', color: '#334155', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '13px' }}>
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Tên sản phẩm & Quy cách */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 900, color: '#0F172A', fontSize: '14px' }}>{item.productName}</div>
                        {item.volume && (
                          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{item.volume}</div>
                        )}
                      </td>

                      {/* Số lượng */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#1D4ED8', fontSize: '14px' }}>
                        +{item.quantity}
                      </td>

                      {/* Giá vào (Vốn) */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0F172A', fontSize: '14px' }}>
                        {formatVnd(item.costPriceVnd)}
                      </td>

                      {/* Giá bán ra */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                        {formatVnd(item.sellingPriceVnd)}
                      </td>

                      {/* Lãi / chai */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: perUnitProfit >= 0 ? '#15803D' : '#DC2626', fontSize: '14px' }}>
                        +{formatVnd(perUnitProfit)}
                      </td>

                      {/* Tổng tiền vốn lô */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#0F172A', fontSize: '14px' }}>
                        {formatVnd(item.totalCostVnd)}
                      </td>

                      {/* Tồn sau nhập */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: '#E2E8F0',
                          color: '#0F172A',
                          fontWeight: 800,
                          fontSize: '12px'
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
        padding: '14px 18px',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        fontSize: '13px',
        color: '#0F172A',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          Hiển thị <strong style={{ fontWeight: 900, color: '#0F172A' }}>{filteredItems.length}</strong> / <strong style={{ fontWeight: 900, color: '#0F172A' }}>{totalItems}</strong> lượt nhập kho • Tổng lượng: <strong style={{ fontWeight: 900, color: '#1D4ED8' }}>{activeSummary.totalQuantity.toLocaleString()}</strong> sản phẩm
        </div>

        {/* Nút phân trang */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: page <= 1 ? '#F1F5F9' : 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              color: page <= 1 ? '#94A3B8' : '#0F172A',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: '12px'
            }}
          >
            ← Trước
          </button>
          <span style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>
            Trang {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: page >= totalPages ? '#F1F5F9' : 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              color: page >= totalPages ? '#94A3B8' : '#0F172A',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: '12px'
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
