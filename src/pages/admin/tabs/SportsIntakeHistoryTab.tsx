import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd } from '../../../types/product';
import { SportsIntakeItem, SportsIntakeSummary } from '../../../types/sports';
import { apiFetch } from '../../../lib/api';

const exportSportsStockIntakeToExcel = async (
  ...args: Parameters<typeof import('../../../lib/excelExport').exportSportsStockIntakeToExcel>
) => (await import('../../../lib/excelExport')).exportSportsStockIntakeToExcel(...args);

export const SportsIntakeHistoryTab: React.FC = () => {
  const [items, setItems] = useState<SportsIntakeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [selectedItemId, setSelectedItemId] = useState<string>('all');
  const [availableItems, setAvailableItems] = useState<Array<{ itemId: string; name: string; unit: string }>>([]);

  // Pagination & Server Summary
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [activeSummary, setActiveSummary] = useState<SportsIntakeSummary>({
    totalBatches: 0,
    totalQuantity: 0,
    totalCostValueVnd: 0
  });

  // Fetch list of items for the dropdown filter
  useEffect(() => {
    apiFetch('/api/admin/sports/items')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (Array.isArray(data.items)) {
          setAvailableItems(data.items.filter((i: any) => !i.isService).map((i: any) => ({ itemId: i.itemId, name: i.name, unit: i.unit })));
        }
      })
      .catch(() => {});
  }, []);

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
      if (selectedItemId !== 'all') {
        q.append('itemId', selectedItemId);
      }
      if (debouncedSearch.trim()) {
        q.append('search', debouncedSearch.trim());
      }
      const res = await apiFetch(`/api/admin/sports/intake-history?${q.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải lịch sử nhập hàng thể thao');
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotalPages(data.totalPages || 1);
      if (data.summary) {
        setActiveSummary(data.summary);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, timeFilter, selectedItemId, debouncedSearch]);

  useEffect(() => {
    fetchIntakeHistory();
  }, [fetchIntakeHistory]);

  const handleExportExcel = async () => {
    if (isExporting || items.length === 0) return;
    setIsExporting(true);
    try {
      let allItems: SportsIntakeItem[] = [...items];
      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          const nextQ = new URLSearchParams({
            page: String(p),
            limit: String(limit),
            timePreset: timeFilter
          });
          if (debouncedSearch.trim()) nextQ.append('search', debouncedSearch.trim());
          pagePromises.push(
            apiFetch(`/api/admin/sports/intake-history?${nextQ.toString()}`)
              .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lỗi tải trang ${p}`))))
              .then(d => d.items || [])
          );
        }
        const remaining = await Promise.all(pagePromises);
        for (const pg of remaining) {
          allItems = allItems.concat(pg);
        }
      }

      await exportSportsStockIntakeToExcel(allItems, activeSummary);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

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
            Lịch sử nhập hàng thể thao
          </h2>
          <p style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
            Theo dõi chi tiết các đợt nhập vợt, vớ, cầu, quấn cán, giá vốn đầu vào và tồn kho thực tế
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
            disabled={isExporting || isLoading || items.length === 0}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isExporting || items.length === 0 ? '#94A3B8' : '#059669',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13px',
              fontWeight: 800,
              cursor: isExporting || isLoading || items.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-sm)',
              transition: 'background-color 0.15s ease'
            }}
            title="Xuất bảng thống kê nhập hàng thể thao ra file Excel"
          >
            <span>{isExporting ? 'Đang xuất Excel...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* KPI CARDS: 2 Thẻ Chuẩn Mực */}
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
            Tổng số Nhập hàng thể thao
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>
            {activeSummary.totalBatches.toLocaleString()}
          </div>
          <div style={{ fontSize: '13px', color: '#1D4ED8', marginTop: '4px', fontWeight: 700 }}>
            {activeSummary.totalQuantity.toLocaleString()} {availableItems.find(i => i.itemId === selectedItemId)?.unit || 'sản phẩm'} đã nhập
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
            Giá Nhập {selectedItemId !== 'all' && availableItems.find(i => i.itemId === selectedItemId) ? `• ${availableItems.find(i => i.itemId === selectedItemId)?.name}` : '(Tổng vốn đầu tư)'}
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#D97706', marginTop: '6px' }}>
            {formatVnd(activeSummary.totalCostValueVnd)}
          </div>
          <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 700 }}>
            {selectedItemId !== 'all' && availableItems.find(i => i.itemId === selectedItemId)
              ? `Tổng vốn nhập của riêng mặt hàng này`
              : 'Tổng chi phí mua sắm thiết bị thể thao'}
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--color-surface)',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)'
      }}>
        {/* Search & Product Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '320px', flex: 1, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Tên sản phẩm thể thao..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                color: '#0F172A',
                outline: 'none',
                width: '100%'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Mặt hàng:</span>
            <select
              value={selectedItemId}
              onChange={e => { setSelectedItemId(e.target.value); setPage(1); }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: 'var(--color-surface)',
                color: '#0F172A',
                outline: 'none',
                minWidth: '220px'
              }}
            >
              <option value="all">Tất cả mặt hàng thể thao ({availableItems.length})</option>
              {availableItems.map(i => (
                <option key={i.itemId} value={i.itemId}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Preset Buttons */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-bg)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'today', label: 'Hôm nay' },
            { key: '7days', label: '7 ngày' },
            { key: '30days', label: '30 ngày' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setTimeFilter(f.key as any); setPage(1); }}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: timeFilter === f.key ? 'var(--color-primary)' : 'transparent',
                color: timeFilter === f.key ? '#FFFFFF' : '#334155',
                fontSize: '12px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', border: '1px solid #F87171', borderRadius: 'var(--radius-sm)', color: '#DC2626', fontSize: '13px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {/* TABLE DATA */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '44px' }}>
                <th style={{ padding: '10px 16px', fontWeight: 800, width: '60px', textAlign: 'center' }}>STT</th>
                <th style={{ padding: '10px 16px', fontWeight: 800 }}>THỜI GIAN NHẬP</th>
                <th style={{ padding: '10px 16px', fontWeight: 800 }}>SẢN PHẨM THỂ THAO</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'center' }}>ĐƠN VỊ</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right' }}>SỐ LƯỢNG</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right' }}>GIÁ VÀO (VỐN)</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right' }}>GIÁ BÁN RA</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right' }}>TỔNG TIỀN VỐN</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'center' }}>TỒN SAU NHẬP</th>
                <th style={{ padding: '10px 16px', fontWeight: 800 }}>GHI CHÚ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                    Đang tải dữ liệu lịch sử nhập hàng...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                    Chưa có đợt nhập hàng thể thao nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF'
                    }}
                  >
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#64748B' }}>
                      {(page - 1) * limit + idx + 1}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0F172A' }}>
                      {item.itemName}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#334155', fontWeight: 700 }}>
                      {item.unit || 'Cái'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: '#1D4ED8' }}>
                      +{item.quantity.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                      {formatVnd(item.costPriceVnd)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                      {formatVnd(item.sellingPriceVnd)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: '#D97706' }}>
                      {formatVnd(item.totalCostVnd)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#0F172A' }}>
                      {item.stockAfter.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569', fontSize: '12px', fontWeight: 600 }}>
                      {item.note || '⎯'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)'
          }}>
            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 700 }}>
              Trang {page} / {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                  color: page <= 1 ? '#94A3B8' : '#0F172A',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                Trang trước
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: page >= totalPages ? '#F1F5F9' : '#FFFFFF',
                  color: page >= totalPages ? '#94A3B8' : '#0F172A',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
