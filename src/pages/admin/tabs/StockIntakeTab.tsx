import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd, Product } from '../../../types/product';
import { apiFetch } from '../../../lib/api';

export interface StockIntakeItem {
  id: string;
  batchId?: string;
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
  responsiblePerson?: string;
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

export interface DrinkBatchGroup {
  batchId: string;
  displayCode: string;
  createdAt: string;
  responsiblePerson: string;
  note: string;
  itemsCount: number;
  totalQuantity: number;
  totalCostVnd: number;
  totalExpectedRevenueVnd: number;
  totalExpectedProfitVnd: number;
  itemsSummary: string;
  items: StockIntakeItem[];
}

export function groupDrinkItemsIntoBatches(rawItems: StockIntakeItem[]): DrinkBatchGroup[] {
  const map = new Map<string, DrinkBatchGroup>();

  for (const item of rawItems) {
    let key = item.batchId;
    if (key) {
      const match = key.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
      if (match) key = match[1];
    }
    if (!key && item.note) {
      const match = item.note.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i) || item.note.match(/\(Lô\s+([^)]+)\)/i);
      if (match) key = match[1].trim();
    }
    if (!key && item.operationId) {
      const match = item.operationId.match(/(batch-[0-9]+-[a-zA-Z0-9]{4,8})/i);
      if (match) key = match[1].trim();
    }
    if (!key && item.createdAt && item.responsiblePerson) {
      const timeMinute = new Date(item.createdAt).toISOString().slice(0, 16);
      key = `batch-drink-${item.responsiblePerson.trim()}-${timeMinute}`;
    }
    if (!key) {
      key = item.operationId || `single-${item.id}`;
    }

    let group = map.get(key);
    if (!group) {
      const parts = key.split('-');
      const shortCode = parts.length >= 3 ? parts[2].slice(0, 6).toUpperCase() : key.slice(-6).toUpperCase();
      const displayCode = `#PNN-${shortCode}`;
      const cleanNote = (item.note || '').replace(/\s*\((?:Lô\s+)?[a-zA-Z0-9_-]+\)/gi, '').trim();

      group = {
        batchId: key,
        displayCode,
        createdAt: item.createdAt,
        responsiblePerson: item.responsiblePerson || 'Quản trị viên',
        note: cleanNote,
        itemsCount: 0,
        totalQuantity: 0,
        totalCostVnd: 0,
        totalExpectedRevenueVnd: 0,
        totalExpectedProfitVnd: 0,
        itemsSummary: '',
        items: []
      };
      map.set(key, group);
    }

    const itemRevenue = item.expectedRevenueVnd ?? (item.sellingPriceVnd * item.quantity);
    const itemProfit = item.profitMarginVnd ?? (itemRevenue - item.totalCostVnd);

    group.items.push(item);
    group.itemsCount += 1;
    group.totalQuantity += item.quantity;
    group.totalCostVnd += item.totalCostVnd;
    group.totalExpectedRevenueVnd += itemRevenue;
    group.totalExpectedProfitVnd += itemProfit;
  }

  const result = Array.from(map.values());
  for (const g of result) {
    const names = g.items.map(i => `${i.productName}${i.volume ? ` (${i.volume})` : ''}`);
    if (names.length <= 2) {
      g.itemsSummary = names.join(', ');
    } else {
      g.itemsSummary = `${names.slice(0, 2).join(', ')} và ${names.length - 2} món khác`;
    }
  }

  return result;
}

export const StockIntakeTab: React.FC<StockIntakeTabProps> = ({
  products
}) => {
  const [items, setItems] = useState<StockIntakeItem[]>([]);
  const viewMode = 'batch';
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selectedDetailItem, setSelectedDetailItem] = useState<StockIntakeItem | null>(null);
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<DrinkBatchGroup | null>(null);

  const batchGroups = React.useMemo(() => groupDrinkItemsIntoBatches(items), [items]);

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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

      {/* KPI CARDS: Clean POS/Dashboard Style - 3 Thẻ theo chuẩn hệ thống */}
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
            {`${batchGroups.length} đợt nhập`}
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
            Tổng tiền vốn nhập {selectedProductId !== 'all' && products.find(p => p.id === selectedProductId) ? `• ${products.find(p => p.id === selectedProductId)?.name}` : ''}
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

        {/* Card 3: Lợi nhuận dự tính */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          padding: '18px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tổng lợi nhuận dự tính
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0A6B4A', marginTop: '6px' }}>
            +{formatVnd(activeSummary.totalExpectedProfitVnd || (activeSummary.totalExpectedRevenueVnd ? activeSummary.totalExpectedRevenueVnd - activeSummary.totalCostValueVnd : 0))}
          </div>
          <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px', fontWeight: 700 }}>
            Tỷ suất dự kiến: {activeSummary.overallMarginPct || 0}%
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
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '44px' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', width: '50px', textAlign: 'center', fontSize: '12px', textTransform: 'uppercase' }}>STT</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', width: '120px', fontSize: '12px', textTransform: 'uppercase' }}>MÃ PHIẾU</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', fontSize: '12px', textTransform: 'uppercase' }}>THỜI GIAN NHẬP</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', fontSize: '12px', textTransform: 'uppercase' }}>NGƯỜI PHỤ TRÁCH</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', textAlign: 'center', fontSize: '12px', textTransform: 'uppercase' }}>QUY MÔ ĐỢT NHẬP</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', fontSize: '12px', textTransform: 'uppercase' }}>CÁC MẶT HÀNG TRONG ĐỢT</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', textAlign: 'right', fontSize: '12px', textTransform: 'uppercase' }}>TỔNG TIỀN VỐN</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', textAlign: 'right', fontSize: '12px', textTransform: 'uppercase' }}>LỢI NHUẬN DỰ TÍNH</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, color: '#FFFFFF', textAlign: 'center', fontSize: '12px', textTransform: 'uppercase' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {batchGroups.map((batch, idx) => (
                  <tr
                    key={batch.batchId || idx}
                    style={{
                      borderBottom: '1px solid #E2E8F0',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : '#F8FAFC'
                    }}
                  >
                    <td style={{ padding: '14px 14px', textAlign: 'center', fontWeight: 700, color: '#64748B' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: 800,
                        fontSize: '12px',
                        border: '1px solid #BFDBFE'
                      }}>
                        {batch.displayCode}
                      </span>
                    </td>
                    <td style={{ padding: '14px 14px', color: '#334155', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '13px' }}>
                      {formatDate(batch.createdAt)}
                    </td>
                    <td style={{ padding: '14px 14px', color: '#0F172A', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '13px' }}>
                      {batch.responsiblePerson}
                    </td>
                    <td style={{ padding: '14px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: '#ECFDF5',
                        color: '#047857',
                        fontWeight: 800,
                        fontSize: '12px',
                        border: '1px solid #A7F3D0'
                      }}>
                        {batch.itemsCount} mặt hàng ({batch.totalQuantity} sp)
                      </span>
                    </td>
                    <td style={{ padding: '14px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{batch.itemsSummary}</div>
                      {batch.note && (
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                          {batch.note}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 14px', textAlign: 'right', fontWeight: 900, color: '#D97706', fontSize: '14px' }}>
                      {formatVnd(batch.totalCostVnd)}
                    </td>
                    <td style={{ padding: '14px 14px', textAlign: 'right', fontWeight: 900, color: '#0A6B4A', fontSize: '14px' }}>
                      +{formatVnd(batch.totalExpectedProfitVnd || 0)}
                    </td>
                    <td style={{ padding: '14px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setSelectedBatchForDetail(batch)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '6px',
                          backgroundColor: '#0A6B4A',
                          border: 'none',
                          color: '#FFFFFF',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
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
          Hiển thị <strong style={{ fontWeight: 900, color: '#0F172A' }}>{viewMode === 'batch' ? batchGroups.length : filteredItems.length}</strong> / <strong style={{ fontWeight: 900, color: '#0F172A' }}>{viewMode === 'batch' ? `${batchGroups.length} đợt` : `${totalItems} lượt`}</strong> • Tổng lượng: <strong style={{ fontWeight: 900, color: '#1D4ED8' }}>{activeSummary.totalQuantity.toLocaleString()}</strong> sản phẩm
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

      {/* MODAL XEM CHI TIẾT PHIẾU NHẬP HÀNG THEO ĐỢT (GOM NHÓM) */}
      {selectedBatchForDetail && (
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
            maxWidth: '880px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0F172A' }}>
                  Chi Tiết Phiếu Nhập Hàng Quầy Nước: {selectedBatchForDetail.displayCode}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', fontWeight: 600 }}>
                  Mã đợt nhập: <span style={{ fontFamily: 'monospace', color: '#0F172A' }}>{selectedBatchForDetail.batchId}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBatchForDetail(null)}
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

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Meta info cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                backgroundColor: '#F8FAFC',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>NGƯỜI PHỤ TRÁCH</div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>
                    {selectedBatchForDetail.responsiblePerson}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>THỜI GIAN NHẬP</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {formatDate(selectedBatchForDetail.createdAt)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>QUY MÔ ĐỢT NHẬP</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8', marginTop: '2px' }}>
                    {selectedBatchForDetail.itemsCount} mặt hàng ({selectedBatchForDetail.totalQuantity} sp)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>GHI CHÚ PHIẾU</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {selectedBatchForDetail.note || 'Nhập hàng vào kho quầy'}
                  </div>
                </div>
              </div>

              {/* Danh sách các mặt hàng trong phiếu nhập nước */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>DANH SÁCH MẶT HÀNG TRONG PHIẾU ({selectedBatchForDetail.items.length})</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Toàn bộ sản phẩm được nhập cùng đợt</span>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '40px' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF', width: '40px' }}>STT</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#FFFFFF' }}>Tên món & Quy cách</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Số lượng</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá vốn</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá bán</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Lãi / đơn vị</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Tổng tiền vốn</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Tiền lời dự kiến</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>Tồn sau</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatchForDetail.items.map((item, iIdx) => {
                        const perUnitProfit = item.sellingPriceVnd - item.costPriceVnd;
                        const lineProfit = item.profitMarginVnd ?? (perUnitProfit * item.quantity);
                        return (
                          <tr key={item.id || iIdx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: iIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF' }}>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#64748B' }}>
                              {iIdx + 1}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 900, color: '#0F172A' }}>{item.productName}</div>
                              {item.volume && <div style={{ fontSize: '11px', color: '#64748B' }}>{item.volume}</div>}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#1D4ED8' }}>
                              +{item.quantity.toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                              {formatVnd(item.costPriceVnd)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                              {formatVnd(item.sellingPriceVnd)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: perUnitProfit >= 0 ? '#15803D' : '#DC2626' }}>
                              +{formatVnd(perUnitProfit)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#D97706' }}>
                              {formatVnd(item.totalCostVnd)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#0A6B4A' }}>
                              +{formatVnd(lineProfit)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E2E8F0', fontWeight: 800, fontSize: '11px' }}>
                                {item.stockAfter}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hộp tóm tắt tổng giá trị đợt nhập */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                backgroundColor: '#ECFDF5',
                border: '1.5px solid #A7F3D0',
                borderRadius: '12px',
                padding: '14px 20px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#065F46' }}>TỔNG CỘNG ĐỢT NHẬP HÀNG</div>
                  <div style={{ fontSize: '13px', color: '#047857', fontWeight: 700, marginTop: '2px' }}>
                    Quy mô: <strong>+{selectedBatchForDetail.totalQuantity}</strong> sản phẩm ({selectedBatchForDetail.itemsCount} mặt hàng)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG TIỀN VỐN ĐẦU TƯ</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#D97706', marginTop: '2px' }}>
                    {formatVnd(selectedBatchForDetail.totalCostVnd)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG LỢI NHUẬN DỰ TÍNH</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#047857', marginTop: '2px' }}>
                    +{formatVnd(selectedBatchForDetail.totalExpectedProfitVnd || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                onClick={() => setSelectedBatchForDetail(null)}
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

      {/* MODAL XEM CHI TIẾT ĐƠN LẺ KHI Ở CHẾ ĐỘ PHẲNG */}
      {selectedDetailItem && (
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
            maxWidth: '680px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* Modal Header */}
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
                  Chi Tiết Mặt Hàng Nhập Kho (Nước)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                  Mã phiếu: <span style={{ fontFamily: 'monospace', color: '#0F172A' }}>{selectedDetailItem.operationId}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetailItem(null)}
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

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Meta info cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                backgroundColor: '#F8FAFC',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>NGƯỜI PHỤ TRÁCH</div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>
                    {selectedDetailItem.responsiblePerson || 'Quản trị viên'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>THỜI GIAN NHẬP</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {formatDate(selectedDetailItem.createdAt)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>GHI CHÚ PHIẾU</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {selectedDetailItem.note || 'Nhập hàng vào kho quầy'}
                  </div>
                </div>
              </div>

              {/* Danh sách mặt hàng trong phiếu */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>
                  DANH SÁCH MÓN ĐÃ NHẬP
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800 }}>Tên món & Quy cách</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Số lượng</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Giá vốn</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Tổng tiền vốn</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Giá bán ra</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>Tồn sau nhập</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 900, color: '#0F172A' }}>{selectedDetailItem.productName}</div>
                        {selectedDetailItem.volume && <div style={{ fontSize: '11px', color: '#64748B' }}>{selectedDetailItem.volume}</div>}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#1D4ED8' }}>
                        +{selectedDetailItem.quantity}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>
                        {formatVnd(selectedDetailItem.costPriceVnd)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#0F172A' }}>
                        {formatVnd(selectedDetailItem.totalCostVnd)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        {formatVnd(selectedDetailItem.sellingPriceVnd)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E2E8F0', fontWeight: 800, fontSize: '11px' }}>
                          {selectedDetailItem.stockAfter}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Hộp tóm tắt tổng giá trị */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#ECFDF5',
                border: '1.5px solid #A7F3D0',
                borderRadius: '12px',
                padding: '14px 18px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#065F46' }}>TỔNG CỘNG ĐỢT NHẬP HÀNG</div>
                  <div style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>
                    Số lượng: <strong>+{selectedDetailItem.quantity}</strong> sản phẩm
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>TỔNG GIÁ TRỊ VỐN</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#047857' }}>
                    {formatVnd(selectedDetailItem.totalCostVnd)}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                onClick={() => setSelectedDetailItem(null)}
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
