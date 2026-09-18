import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd } from '../../../types/product';
import { SportsIntakeItem, SportsIntakeSummary } from '../../../types/sports';
import { apiFetch } from '../../../lib/api';

const exportSportsStockIntakeToExcel = async (
  ...args: Parameters<typeof import('../../../lib/excelExport').exportSportsStockIntakeToExcel>
) => (await import('../../../lib/excelExport')).exportSportsStockIntakeToExcel(...args);

export interface SportsBatchGroup {
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
  items: SportsIntakeItem[];
}

export function groupSportsItemsIntoBatches(rawItems: SportsIntakeItem[]): SportsBatchGroup[] {
  const map = new Map<string, SportsBatchGroup>();

  for (const item of rawItems) {
    let key = item.batchId;
    if (key) {
      const match = key.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
      if (match) key = match[1];
    }
    if (!key && item.note) {
      const match = item.note.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i) || item.note.match(/\(Lô\s+([^)]+)\)/i);
      if (match) key = match[1].trim();
    }
    if (!key && item.operationId) {
      const match = item.operationId.match(/((?:spbatch|batch)-[0-9]+-[a-f0-9]{6})/i);
      if (match) key = match[1].trim();
    }
    if (!key && item.createdAt && item.responsiblePerson) {
      const timeMinute = new Date(item.createdAt).toISOString().slice(0, 16);
      key = `batch-${item.responsiblePerson.trim()}-${timeMinute}`;
    }
    if (!key) {
      key = item.operationId || `single-${item.id}`;
    }

    let group = map.get(key);
    if (!group) {
      const parts = key.split('-');
      const shortCode = parts.length >= 3 ? parts[2].slice(0, 6).toUpperCase() : key.slice(-6).toUpperCase();
      const displayCode = `#PN-${shortCode}`;
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
    const names = g.items.map(i => i.itemName);
    if (names.length <= 2) {
      g.itemsSummary = names.join(', ');
    } else {
      g.itemsSummary = `${names.slice(0, 2).join(', ')} và ${names.length - 2} món khác`;
    }
  }

  return result;
}

export const SportsIntakeHistoryTab: React.FC = () => {
  const [items, setItems] = useState<SportsIntakeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selectedDetailItem, setSelectedDetailItem] = useState<SportsIntakeItem | null>(null);
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<SportsBatchGroup | null>(null);

  const batchGroups = React.useMemo(() => groupSportsItemsIntoBatches(items), [items]);

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

      {/* KPI CARDS: 3 Thẻ Chuẩn Mực */}
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
            {`${batchGroups.length} đợt nhập`}
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
            Tổng tiền vốn nhập {selectedItemId !== 'all' && availableItems.find(i => i.itemId === selectedItemId) ? `• ${availableItems.find(i => i.itemId === selectedItemId)?.name}` : '(Tổng vốn đầu tư)'}
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
                <th style={{ padding: '10px 16px', fontWeight: 800, width: '50px', textAlign: 'center', color: '#FFFFFF' }}>STT</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, width: '120px', color: '#FFFFFF' }}>MÃ PHIẾU</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, color: '#FFFFFF' }}>THỜI GIAN NHẬP</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, color: '#FFFFFF' }}>NGƯỜI PHỤ TRÁCH</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'center', color: '#FFFFFF' }}>QUY MÔ ĐỢT NHẬP</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, color: '#FFFFFF' }}>CÁC MẶT HÀNG TRONG ĐỢT</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right', color: '#FFFFFF' }}>TỔNG TIỀN VỐN</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'right', color: '#FFFFFF' }}>LỢI NHUẬN DỰ TÍNH</th>
                <th style={{ padding: '10px 16px', fontWeight: 800, textAlign: 'center', color: '#FFFFFF' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                    Đang tải dữ liệu lịch sử nhập hàng...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
                    Chưa có đợt nhập hàng thể thao nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                batchGroups.map((batch, idx) => (
                  <tr
                    key={batch.batchId || idx}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF'
                    }}
                  >
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#64748B' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '14px 16px', color: '#0F172A', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatDate(batch.createdAt)}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#0F172A', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {batch.responsiblePerson}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '14px 16px', color: '#0F172A' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>{batch.itemsSummary}</div>
                      {batch.note && (
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                          {batch.note}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#D97706', fontSize: '14px' }}>
                      {formatVnd(batch.totalCostVnd)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#0A6B4A', fontSize: '14px' }}>
                      +{formatVnd(batch.totalExpectedProfitVnd || 0)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
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

      {/* MODAL XEM CHI TIẾT PHIẾU NHẬP HÀNG (THEO ĐỢT) */}
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
            maxWidth: '850px',
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
                  Chi Tiết Phiếu Nhập Hàng Thể Thao: {selectedBatchForDetail.displayCode}
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
                    {selectedBatchForDetail.note || 'Nhập kho thể thao'}
                  </div>
                </div>
              </div>

              {/* Danh sách các mặt hàng trong phiếu nhập */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>DANH SÁCH MẶT HÀNG TRONG PHIẾU ({selectedBatchForDetail.items.length})</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Toàn bộ sản phẩm được nhập cùng đợt</span>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '40px' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, width: '40px', color: '#FFFFFF' }}>STT</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#FFFFFF' }}>Tên mặt hàng thể thao</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>Đơn vị</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Số lượng</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá vốn</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá bán ra</th>
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
                              <div style={{ fontWeight: 900, color: '#0F172A' }}>{item.itemName}</div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>Mã: {item.itemId}</div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>
                              {item.unit || 'Cái'}
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
                  Chi Tiết Mặt Hàng Nhập Kho
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
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>GHI CHÚ</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                    {selectedDetailItem.note || 'Nhập kho thể thao'}
                  </div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0A6B4A', color: '#FFFFFF', height: '36px' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#FFFFFF' }}>Tên mặt hàng</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>Đơn vị</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Số lượng</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá vốn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Tổng tiền vốn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#FFFFFF' }}>Giá bán</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#FFFFFF' }}>Tồn sau</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 900, color: '#0F172A' }}>{selectedDetailItem.itemName}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Mã: {selectedDetailItem.itemId}</div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>
                      {selectedDetailItem.unit || 'Cái'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#1D4ED8' }}>
                      +{selectedDetailItem.quantity}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>
                      {formatVnd(selectedDetailItem.costPriceVnd)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, color: '#D97706' }}>
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
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#065F46' }}>TỔNG CỘNG MẶT HÀNG</div>
                  <div style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>
                    Số lượng: <strong>+{selectedDetailItem.quantity}</strong> {selectedDetailItem.unit || 'mặt hàng'}
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
