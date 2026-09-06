import React, { useState, useEffect, useCallback } from 'react';
import { Order, Court } from '../../types/order';
import { sound } from '../../lib/sound';
import { formatVnd, Product } from '../../data/mockProducts';
import { downloadCourtQrPng, downloadAllCourtsPdf, generateCourtQrPng } from '../../lib/qrCode';
import { exportOrdersToExcel } from '../../lib/excelExport';
import { AdminOrdersView } from '../../components/AdminOrdersView';

type AdminTab = 'orders' | 'products' | 'courts' | 'reports' | 'history' | 'settings';

export const AdminPortal: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('orders');

  // Orders State (Polling 3.5s)
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean>(true);
  const [isSoundActive, setIsSoundActive] = useState<boolean>(false);

  // Products State
  const [products, setProducts] = useState<Product[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(10);
  const [stockAdjustmentType, setStockAdjustmentType] = useState<'intake' | 'set'>('intake');
  const [productFormData, setProductFormData] = useState({
    name: '',
    volume: '500ml',
    category: 'water' as any,
    priceVnd: 15000,
    stock: 20,
    tag: '',
    imageSvg: ''
  });

  // Courts State
  const [courts, setCourts] = useState<Court[]>([]);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState<boolean>(false);
  const [courtFormCode, setCourtFormCode] = useState<string>('');
  const [courtFormName, setCourtFormName] = useState<string>('');
  const [previewQrCourt, setPreviewQrCourt] = useState<Court | null>(null);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string>('');

  // Reports State
  const [reportTimeFilter, setReportTimeFilter] = useState<string>('today');
  const [reportData, setReportData] = useState<any>(null);

  // History State
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyCourtFilter, setHistoryCourtFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');

  // POS Order for Court State (Set Order cho Sân tại quầy)
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState<boolean>(false);
  const [posCourtCode, setPosCourtCode] = useState<string>('01');
  const [posCart, setPosCart] = useState<{ [productId: string]: { quantity: number; iceQuantity: number } }>({});
  const [isSubmittingPosOrder, setIsSubmittingPosOrder] = useState<boolean>(false);

  // Edit Court Modal State (Sửa tên sân)
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editCourtName, setEditCourtName] = useState<string>('');

  // ================= FETCH DATA =================

  // 1. Fetch Active Orders
  const fetchActiveOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orders/active');
      if (res.ok) {
        const data: Order[] = await res.json();
        setOrders(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchActiveOrders();
    const interval = setInterval(fetchActiveOrders, 3500);
    return () => clearInterval(interval);
  }, [fetchActiveOrders]);

  // 2. Fetch Products
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 3. Fetch Courts
  const fetchCourts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/courts');
      if (res.ok) {
        const data = await res.json();
        setCourts(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 4. Fetch Reports
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/summary?timeFilter=${reportTimeFilter}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [reportTimeFilter]);

  // 5. Fetch History
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/history?courtId=${historyCourtFilter}&status=${historyStatusFilter}`);
      if (res.ok) {
        const data: Order[] = await res.json();
        setHistoryOrders(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [historyCourtFilter, historyStatusFilter]);

  // Load products & courts on mount (needed for POS modal from orders tab)
  useEffect(() => {
    fetchProducts();
    fetchCourts();
  }, [fetchProducts, fetchCourts]);

  // Load appropriate data when tab changes
  useEffect(() => {
    if (currentTab === 'products') fetchProducts();
    if (currentTab === 'courts') fetchCourts();
    if (currentTab === 'reports') fetchReports();
    if (currentTab === 'history') fetchHistory();
  }, [currentTab, fetchCourts, fetchHistory, fetchProducts, fetchReports]);

  // Chuông báo quầy khi có đơn chờ phục vụ
  useEffect(() => {
    if (!isSoundActive || currentTab !== 'orders') return;

    const checkAndChime = () => {
      const pendingCount = orders.filter(o => o.status === 'new' || o.status === 'accepted').length;
      if (pendingCount > 0) {
        sound.playOrderChime();
      }
    };

    checkAndChime();
    const interval = setInterval(checkAndChime, 5000);
    return () => clearInterval(interval);
  }, [isSoundActive, orders, currentTab]);

  // ================= ORDER ACTIONS =================
  const handleAcceptOrder = useCallback(async (orderId: string) => {
    sound.playActionClick();
    await fetch(`/api/admin/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'accepted' })
    });
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  const handlePrepareOrder = useCallback(async (orderId: string) => {
    sound.playActionClick();
    await fetch(`/api/admin/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'preparing' })
    });
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  const handleDeliverOrder = useCallback(async (orderId: string) => {
    sound.playActionClick();
    await fetch(`/api/admin/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStatus: 'delivered' })
    });
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  const handleToggleAcceptingOrders = useCallback(async () => {
    const nextState = !isAcceptingOrders;
    await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAcceptingOrders: nextState })
    });
    setIsAcceptingOrders(nextState);
  }, [isAcceptingOrders]);

  // ================= PRODUCT ACTIONS =================
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormData.name || productFormData.priceVnd <= 0) {
      alert('Vui lòng điền tên và giá bán hợp lệ!');
      return;
    }

    try {
      if (editingProduct) {
        await fetch(`/api/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productFormData)
        });
      } else {
        await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productFormData)
        });
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa mềm sản phẩm này khỏi thực đơn? (Lịch sử đơn cũ vẫn được bảo toàn)')) return;
    await fetch(`/api/admin/products/${productId}`, { method: 'DELETE' });
    fetchProducts();
  };

  const handleStockUpdate = async () => {
    if (!stockModalProduct) return;
    try {
      if (stockAdjustmentType === 'intake') {
        await fetch(`/api/admin/products/${stockModalProduct.id}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delta: stockDelta, reason: 'stock_intake' })
        });
      } else {
        await fetch(`/api/admin/products/${stockModalProduct.id}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setAbsoluteStock: stockDelta })
        });
      }
      setStockModalProduct(null);
      fetchProducts();
    } catch (e: any) {
      alert('Lỗi cập nhật kho: ' + e.message);
    }
  };


  // ================= COURT ACTIONS =================
  const handleToggleCourt = async (court: Court) => {
    try {
      sound.playActionClick();
      const res = await fetch(`/api/admin/courts/${court.id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        fetchCourts();
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  const handleSaveRenameCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourt || !editCourtName.trim()) return;
    try {
      sound.playActionClick();
      const res = await fetch(`/api/admin/courts/${editingCourt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCourtName.trim() })
      });
      if (res.ok) {
        setEditingCourt(null);
        fetchCourts();
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  const handleSaveCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courtFormCode || !courtFormName) {
      alert('Vui lòng nhập mã và tên sân!');
      return;
    }

    try {
      const res = await fetch('/api/admin/courts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: courtFormCode, name: courtFormName })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Lỗi thêm sân');
        return;
      }
      setIsCourtModalOpen(false);
      setCourtFormCode('');
      setCourtFormName('');
      fetchCourts();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDeleteCourt = async (courtId: string, courtName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ${courtName}?`)) return;
    try {
      const res = await fetch(`/api/admin/courts/${courtId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        // BR-21: Báo lỗi nếu sân có đơn mở
        alert(`CHẶN XÓA: ${err.message}`);
        return;
      }
      fetchCourts();
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  const handleOpenQrPreview = async (court: Court) => {
    const dataUrl = await generateCourtQrPng(court.code);
    setPreviewQrDataUrl(dataUrl);
    setPreviewQrCourt(court);
  };

  // ================= POS ORDER ACTION =================
  const handleSubmitPosOrder = async () => {
    const items = Object.entries(posCart)
      .filter(([_, data]) => data.quantity > 0)
      .map(([productId, data]) => ({
        productId,
        quantity: data.quantity,
        iceQuantity: data.iceQuantity
      }));

    if (items.length === 0) {
      alert('Vui lòng chọn ít nhất 1 món nước với số lượng > 0!');
      return;
    }

    setIsSubmittingPosOrder(true);
    try {
      sound.playActionClick();
      const res = await fetch('/api/admin/orders/create-for-court', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtCode: posCourtCode,
          items
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Lỗi tạo đơn');
        return;
      }

      setPosCart({});
      setIsCreateOrderModalOpen(false);
      fetchActiveOrders();
      fetchProducts();
      sound.playOrderChime();
    } catch (err: any) {
      alert('Lỗi tạo đơn: ' + err.message);
    } finally {
      setIsSubmittingPosOrder(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)' }}>
      {/* HEADER QUẢN TRỊ CHÍNH */}
      <header style={{
        backgroundColor: 'var(--color-deep)',
        color: '#FFFFFF',
        borderBottom: '2px solid var(--color-primary)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '18px'
          }}>
            TL
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>
              Quản Trị Quầy Nước — Sân Cầu Lông Trần Lựu
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: '#B6D1BF', marginTop: '2px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isAcceptingOrders ? '#22C55E' : '#EF4444'
              }} />
              <span>{isAcceptingOrders ? 'Đang mở nhận đơn' : 'Đang tạm dừng nhận đơn'}</span>
              <span>•</span>
              <span>16 Sân thi đấu</span>
              <span>•</span>
              <a href="/order?court=05" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
                Mở màn hình khách ↗
              </a>
            </div>
          </div>
        </div>

        {/* Action controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
              if (!isSoundActive) {
                sound.enableSound();
                setIsSoundActive(true);
              } else {
                setIsSoundActive(false);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isSoundActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            <span>{isSoundActive ? '🔔 Đã bật chuông' : '🔕 Bật âm chuông'}</span>
          </button>

          <button
            onClick={() => {
              sound.enableSound();
              sound.playOrderChime();
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'var(--color-accent)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              border: '1px solid var(--color-accent)'
            }}
          >
            🎵 Thử chuông
          </button>

          <button
            onClick={handleToggleAcceptingOrders}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isAcceptingOrders ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              color: isAcceptingOrders ? '#FCA5A5' : '#86EFAC',
              border: `1px solid ${isAcceptingOrders ? '#EF4444' : '#22C55E'}`,
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700
            }}
          >
            {isAcceptingOrders ? 'Tắt nhận đơn' : 'Bật nhận đơn'}
          </button>
        </div>
      </header>

      {/* THANH ĐIỀU HƯỚNG TAB CHUYÊN NGHIỆP */}
      <nav style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 24px',
        display: 'flex',
        gap: '8px',
        overflowX: 'auto'
      }}>
        {[
          { key: 'orders', label: '📋 Quầy điều hành', count: orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length },
          { key: 'products', label: '🥤 Sản phẩm & Kho', count: products.length },
          { key: 'courts', label: '🏸 Sân đấu & Mã QR', count: courts.length || 16 },
          { key: 'reports', label: '📊 Báo cáo doanh thu' },
          { key: 'history', label: '📑 Lịch sử & Xuất Excel' },
          { key: 'settings', label: '⚙️ Cài đặt hệ thống' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setCurrentTab(tab.key as AdminTab)}
            style={{
              padding: '14px 18px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: currentTab === tab.key ? 800 : 600,
              color: currentTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: `3px solid ${currentTab === tab.key ? 'var(--color-primary)' : 'transparent'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              transition: 'var(--transition-fast)'
            }}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span style={{
                backgroundColor: currentTab === tab.key ? 'var(--color-primary-light)' : 'var(--color-bg)',
                color: currentTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)'
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* BODY CONTENT NỘI DUNG TỪNG TAB */}
      <div style={{ flex: 1 }}>

        {/* TAB 1: QUẦY ĐIỀU HÀNH */}
        {currentTab === 'orders' && (
          <AdminOrdersView
            orders={orders}
            onAcceptOrder={handleAcceptOrder}
            onPrepareOrder={handlePrepareOrder}
            onDeliverOrder={handleDeliverOrder}
            onFastForwardOrder={(orderId) => {
              setOrders(prev => prev.map(o => o.id === orderId ? { ...o, editableUntil: Date.now() - 1000 } : o));
            }}
            onOpenCreateOrderModal={() => {
              setPosCart({});
              // Refresh products & courts in case they changed
              if (products.length === 0) fetchProducts();
              if (courts.length === 0) fetchCourts();
              setPosCourtCode(courts[0]?.code || '01');
              setIsCreateOrderModalOpen(true);
            }}
          />
        )}

        {/* TAB 2: SẢN PHẨM & TỒN KHO */}
        {currentTab === 'products' && (
          <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
                  Quản Lý Danh Mục Nước & Tồn Kho
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Thêm bớt món nước, tải ảnh sản phẩm, sửa giá bán và điều chỉnh số lượng tồn kho.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductFormData({ name: '', volume: '500ml', category: 'water', priceVnd: 15000, stock: 20, tag: '', imageSvg: '' });
                  setIsProductModalOpen(true);
                }}
                style={{
                  padding: '10px 18px',
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>➕ Thêm sản phẩm mới</span>
              </button>
            </div>

            {/* Product Table */}
            <div style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Ảnh</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tên sản phẩm</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Dung tích</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giá bán</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tồn kho</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Trạng thái</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 16px', width: '60px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          backgroundColor: 'var(--color-bg)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px'
                        }}>
                          {p.imageSvg && <img src={p.imageSvg} alt={p.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                        {p.name}
                        {p.tag && (
                          <span style={{
                            marginLeft: '8px',
                            backgroundColor: 'var(--color-accent)',
                            color: 'var(--color-accent-text)',
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {p.tag}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)' }}>{p.volume}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--color-deep)' }}>{formatVnd(p.priceVnd)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontWeight: 800,
                          color: p.stock > 0 ? 'var(--color-primary)' : 'var(--color-status-urgent)',
                          backgroundColor: p.stock > 0 ? 'var(--color-primary-light)' : '#FEE2E2',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {p.stock} chai
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: p.isAvailable ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                          {p.isAvailable ? '🟢 Đang bán' : '⚪ Đã ẩn'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setStockModalProduct(p);
                              setStockDelta(10);
                              setStockAdjustmentType('intake');
                            }}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              borderRadius: 'var(--radius-sm)',
                              fontWeight: 700,
                              fontSize: 'var(--font-size-xs)'
                            }}
                            title="Lịch sử & Điều chỉnh tồn kho"
                          >
                            📦 Kho
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setProductFormData({
                                name: p.name,
                                volume: p.volume,
                                category: p.category,
                                priceVnd: p.priceVnd,
                                stock: p.stock,
                                tag: p.tag || '',
                                imageSvg: p.imageSvg || ''
                              });
                              setIsProductModalOpen(true);
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-sm)',
                              fontWeight: 700,
                              fontSize: 'var(--font-size-xs)'
                            }}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            style={{
                              padding: '6px 8px',
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              borderRadius: 'var(--radius-sm)',
                              fontWeight: 700,
                              fontSize: 'var(--font-size-xs)'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SÂN ĐẤU & BỘ TẠO MÃ QR */}
        {currentTab === 'courts' && (
          <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
                  Quản Lý Sân & Bộ Tạo Mã QR In Ấn
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Quản lý danh sách sân, tải ảnh QR PNG từng sân hoặc xuất trọn bộ PDF khổ A4 sẵn sàng in ấn dán tại cột lưới.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => downloadAllCourtsPdf(courts)}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: 'var(--color-deep)',
                    color: 'var(--color-accent)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 800,
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <span>📄 TẢI PDF IN ẤN 16 SÂN (A4)</span>
                </button>

                <button
                  onClick={() => {
                    const nextNum = (courts.length + 1).toString().padStart(2, '0');
                    setCourtFormCode(nextNum);
                    setCourtFormName(`Sân ${nextNum}`);
                    setIsCourtModalOpen(true);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  <span>➕ Thêm sân mới</span>
                </button>
              </div>
            </div>

            {/* Grid 16 Courts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {courts.map(court => (
                <div key={court.id} style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      backgroundColor: 'var(--color-deep)',
                      color: 'var(--color-accent)',
                      fontWeight: 900,
                      fontSize: '18px',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      {court.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Mã: {court.code}
                    </span>
                  </div>

                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    Mã QR liên kết: <code>/order?court={court.code}</code>
                  </p>

                  {/* Toggle On/Off nhận đơn cho Sân (Set On/Off cho Sân) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: court.isActive !== false ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${court.isActive !== false ? '#86EFAC' : '#FCA5A5'}`
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: court.isActive !== false ? '#15803D' : '#991B1B' }}>
                      {court.isActive !== false ? '🟢 ĐANG NHẬN ĐƠN' : '🔴 TẠM TẮT ĐƠN'}
                    </span>
                    <button
                      onClick={() => handleToggleCourt(court)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: court.isActive !== false ? '#EF4444' : '#15803D',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '11px',
                        cursor: 'pointer',
                        border: 'none'
                      }}
                      title="Bấm để Bật hoặc Tắt nhận đơn cho sân này (Set On/Off cho Sân)"
                    >
                      {court.isActive !== false ? 'Tắt nhận' : 'Bật nhận'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleOpenQrPreview(court)}
                      style={{
                        flex: 1,
                        padding: '8px 6px',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>🔍 QR</span>
                    </button>

                    <button
                      onClick={() => downloadCourtQrPng(court)}
                      style={{
                        padding: '8px 8px',
                        backgroundColor: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-deep)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                      title="Tải ảnh PNG"
                    >
                      💾 PNG
                    </button>

                    <button
                      onClick={() => {
                        setEditingCourt(court);
                        setEditCourtName(court.name);
                      }}
                      style={{
                        padding: '8px 8px',
                        backgroundColor: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-deep)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                      title="Đổi tên sân hiển thị"
                    >
                      ✏️ Sửa
                    </button>

                    <button
                      onClick={() => handleDeleteCourt(court.id, court.name)}
                      style={{
                        padding: '8px 8px',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                      title="Xóa sân (sẽ bị chặn nếu có đơn mở)"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: BÁO CÁO DOANH THU & THỐNG KÊ */}
        {currentTab === 'reports' && (
          <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header & Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
                  Báo Cáo Doanh Thu & Hiệu Quả Bán Hàng
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Doanh thu ghi nhận khi đơn đã giao tận sân và thanh toán thành công. Giờ chuẩn Việt Nam (UTC+7).
                </p>
              </div>

              {/* Time Filter Tabs */}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-surface)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                {[
                  { key: 'today', label: 'Hôm nay' },
                  { key: 'yesterday', label: 'Hôm qua' },
                  { key: '7days', label: '7 ngày qua' },
                  { key: 'month', label: 'Tháng này' },
                  { key: 'all', label: 'Tất cả' }
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setReportTimeFilter(f.key)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: reportTimeFilter === f.key ? 'var(--color-primary)' : 'transparent',
                      color: reportTimeFilter === f.key ? '#FFFFFF' : 'var(--color-text-main)',
                      fontWeight: reportTimeFilter === f.key ? 700 : 500,
                      fontSize: 'var(--font-size-xs)'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
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
                  Chờ thu (Đơn đang xử lý)
                </div>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-status-urgent)', marginTop: '6px' }}>
                  {reportData ? formatVnd(reportData.uncollectedRevenueVnd) : '0đ'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  {reportData?.totalOrdersUncollected || 0} đơn chưa giao
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
                  Tổng ly đá miễn phí
                </div>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: '#3B82F6', marginTop: '6px' }}>
                  {reportData?.totalIceServed || 0} ly
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  0đ / Miễn phí phục vụ theo chai
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
        )}

        {/* TAB 5: LỊCH SỬ ĐƠN & XUẤT EXCEL */}
        {currentTab === 'history' && (
          <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
                  Lịch Sử Đơn Hàng & Xuất File Excel
                </h2>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Tra cứu toàn bộ lịch sử đơn hàng và xuất bảng tính Excel 5 sheet chi tiết chuẩn kế toán.
                </p>
              </div>

              {/* Excel Export Button */}
              <button
                onClick={() => exportOrdersToExcel(historyOrders)}
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
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <span>📊 XUẤT FILE EXCEL (.XLSX)</span>
              </button>
            </div>

            {/* Filter Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <select
                value={historyCourtFilter}
                onChange={(e) => setHistoryCourtFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
              >
                <option value="all">Tất cả các sân</option>
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="delivered">Đã giao tận sân</option>
                <option value="preparing">Đang chuẩn bị</option>
                <option value="accepted">Đã nhận đơn</option>
                <option value="new">Đơn mới</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>

            {/* History Table */}
            <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Mã đơn</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Sân</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Chi tiết món & ly đá</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tổng tiền</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Trạng thái</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giờ đặt</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giờ giao</th>
                  </tr>
                </thead>
                <tbody>
                  {historyOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        Không có đơn hàng nào khớp với bộ lọc
                      </td>
                    </tr>
                  ) : (
                    historyOrders.map(o => (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--color-deep)' }}>{o.displayCode}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{o.courtName}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--font-size-xs)' }}>
                            {o.items.map((i, idx) => (
                              <span key={idx}>
                                {i.quantity}x {i.name} {i.iceQuantity > 0 && `(+${i.iceQuantity} đá)`}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--color-primary)' }}>{formatVnd(o.totalVnd)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: o.status === 'delivered' ? 'var(--color-status-delivered-bg)' : o.status === 'cancelled' ? '#FEE2E2' : '#FEF3C7',
                            color: o.status === 'delivered' ? 'var(--color-status-delivered)' : o.status === 'cancelled' ? '#DC2626' : '#D97706'
                          }}>
                            {o.status === 'delivered' ? 'ĐÃ GIAO' : o.status === 'cancelled' ? 'ĐÃ HỦY' : 'ĐANG XỬ LÝ'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          {o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: CÀI ĐẶT HỆ THỐNG */}
        {currentTab === 'settings' && (
          <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '16px' }}>
              Cài Đặt Hệ Thống Vận Hành
            </h2>

            <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Accepting orders */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--color-deep)' }}>Công tắc nhận đơn toàn sân</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Khi tắt, khách không thể tạo đơn mới; các đơn cũ vẫn theo dõi và giao bình thường.
                  </div>
                </div>
                <button
                  onClick={handleToggleAcceptingOrders}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isAcceptingOrders ? 'var(--color-primary)' : '#EF4444',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  {isAcceptingOrders ? 'ĐANG MỞ' : 'TẠM TẮT'}
                </button>
              </div>

              {/* Sound test */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--color-deep)' }}>Âm thanh chuông báo quầy</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Chuông báo tự động ngân vang mỗi khi có đơn hàng chờ quầy tiếp nhận.
                  </div>
                </div>
                <button
                  onClick={() => {
                    sound.enableSound();
                    sound.playOrderChime();
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    fontWeight: 700,
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  🎵 Thử chuông
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL: THÊM / SỬA SẢN PHẨM */}
      {isProductModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--color-surface)',
            width: '100%',
            maxWidth: '480px',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '16px' }}>
              {editingProduct ? 'Chỉnh Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới'}
            </h3>
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Tên nước giải khát *</label>
                <input
                  type="text"
                  required
                  value={productFormData.name}
                  onChange={e => setProductFormData({ ...productFormData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                  placeholder="VD: Nước tăng lực Monster Energy"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Dung tích</label>
                  <input
                    type="text"
                    value={productFormData.volume}
                    onChange={e => setProductFormData({ ...productFormData, volume: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                    placeholder="500ml / Lon 330ml"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Giá bán (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    value={productFormData.priceVnd}
                    onChange={e => setProductFormData({ ...productFormData, priceVnd: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Số lượng tồn kho (chai) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productFormData.stock}
                    onChange={e => setProductFormData({ ...productFormData, stock: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                    placeholder="20"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Nhãn nổi bật</label>
                  <input
                    type="text"
                    value={productFormData.tag}
                    onChange={e => setProductFormData({ ...productFormData, tag: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                    placeholder="VD: Bán chạy / Mát lạnh"
                  />
                </div>
              </div>

              {/* Upload hoặc Kéo thả ảnh sản phẩm */}
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Hình ảnh sản phẩm (PNG, JPG, WebP, SVG)
                </label>
                
                {productFormData.imageSvg ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '10px 14px',
                    backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)'
                  }}>
                    <div style={{
                      width: '56px',
                      height: '56px',
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--color-border-strong)',
                      flexShrink: 0
                    }}>
                      <img
                        src={productFormData.imageSvg}
                        alt="Xem trước"
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>
                        Đã có hình ảnh sản phẩm
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Hiển thị trực tiếp trên thực đơn gọi nước
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProductFormData({ ...productFormData, imageSvg: '' })}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 700,
                        border: '1px solid #FCA5A5',
                        cursor: 'pointer'
                      }}
                    >
                      ✕ Gỡ ảnh
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.backgroundColor = 'var(--color-primary-light)';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                      e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                      e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (loadEvt) => {
                          setProductFormData(prev => ({ ...prev, imageSvg: loadEvt.target?.result as string }));
                        };
                        reader.readAsDataURL(file);
                      } else {
                        alert('Vui lòng kéo thả tệp hình ảnh hợp lệ (PNG, JPG, WebP, SVG)!');
                      }
                    }}
                    style={{
                      border: '2px dashed var(--color-border-strong)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-bg)',
                      padding: '16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onClick={() => {
                      const input = document.getElementById('product-image-upload-input');
                      input?.click();
                    }}
                  >
                    <input
                      id="product-image-upload-input"
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (loadEvt) => {
                            setProductFormData(prev => ({ ...prev, imageSvg: loadEvt.target?.result as string }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>📷</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>
                      Kéo thả ảnh vào đây hoặc bấm để chọn ảnh
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Hỗ trợ định dạng PNG, JPG, WebP, SVG
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    fontWeight: 600,
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 'var(--font-size-sm)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Lưu sản phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NHẬP KHO / ĐIỀU CHỈNH TỒN */}
      {stockModalProduct && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '400px', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)' }}>
              Cập Nhật Tồn Kho: {stockModalProduct.name}
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Hiện còn trong kho: <strong>{stockModalProduct.stock} chai</strong>
            </p>

            <div style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
              <button
                onClick={() => setStockAdjustmentType('intake')}
                style={{
                  flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: stockAdjustmentType === 'intake' ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: stockAdjustmentType === 'intake' ? '#FFFFFF' : 'var(--color-text-main)',
                  fontWeight: 700, fontSize: 'var(--font-size-xs)'
                }}
              >
                Nhập thêm (+)
              </button>
              <button
                onClick={() => {
                  setStockAdjustmentType('set');
                  setStockDelta(stockModalProduct.stock);
                }}
                style={{
                  flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
                  backgroundColor: stockAdjustmentType === 'set' ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: stockAdjustmentType === 'set' ? '#FFFFFF' : 'var(--color-text-main)',
                  fontWeight: 700, fontSize: 'var(--font-size-xs)'
                }}
              >
                Đặt số lượng thực tế
              </button>
            </div>

            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              {stockAdjustmentType === 'intake' ? 'Số chai nhập thêm:' : 'Số chai thực tế trong kho:'}
            </label>
            <input
              type="number"
              value={stockDelta}
              onChange={e => setStockDelta(parseInt(e.target.value, 10) || 0)}
              style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-base)', fontWeight: 800 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setStockModalProduct(null)}
                style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg)' }}
              >
                Hủy
              </button>
              <button
                onClick={handleStockUpdate}
                style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 700 }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THÊM SÂN MỚI */}
      {isCourtModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '380px', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '14px' }}>
              Thêm Sân Thi Đấu Mới
            </h3>
            <form onSubmit={handleSaveCourt} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Mã số sân</label>
                <input
                  type="text"
                  required
                  value={courtFormCode}
                  onChange={e => setCourtFormCode(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                  placeholder="VD: 17"
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Tên hiển thị</label>
                <input
                  type="text"
                  required
                  value={courtFormName}
                  onChange={e => setCourtFormName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                  placeholder="VD: Sân 17"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsCourtModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg)' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 700 }}
                >
                  Tạo sân
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: XEM TRƯỚC MÃ QR */}
      {previewQrCourt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '360px', borderRadius: 'var(--radius-xl)', padding: '24px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <span style={{ backgroundColor: 'var(--color-deep)', color: 'var(--color-accent)', fontWeight: 900, fontSize: '18px', padding: '4px 16px', borderRadius: 'var(--radius-sm)' }}>
              {previewQrCourt.name}
            </span>
            <div style={{ margin: '20px auto', width: '220px', height: '220px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px', backgroundColor: '#FFFFFF' }}>
              {previewQrDataUrl && <img src={previewQrDataUrl} alt={previewQrCourt.name} style={{ width: '100%', height: '100%' }} />}
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Quét mã bằng camera điện thoại để đặt nước giao tận {previewQrCourt.name}.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPreviewQrCourt(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                Đóng
              </button>
              <button
                onClick={() => downloadCourtQrPng(previewQrCourt)}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 700 }}
              >
                💾 Tải ảnh PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TẠO ORDER CHO SÂN (QUẦY POS) */}
      {isCreateOrderModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '580px', maxHeight: '90vh', borderRadius: 'var(--radius-xl)', padding: '24px', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                  ➕ Tạo Đơn Cho Sân Tại Quầy (POS Order)
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                  Ghi nhận đơn trực tiếp khi khách ra quầy gọi nước. Đơn tự động vào bước "Đã nhận".
                </p>
              </div>
              <button
                onClick={() => setIsCreateOrderModalOpen(false)}
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-bg)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Select Court */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '6px', color: 'var(--color-deep)' }}>
                VỊ TRÍ SÂN THI ĐẤU:
              </label>
              <select
                value={posCourtCode}
                onChange={e => setPosCourtCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid var(--color-primary)',
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 800,
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-deep)'
                }}
              >
                {courts.map(c => (
                  <option key={c.id} value={c.code}>
                    {c.name} (Mã {c.code}) {c.isActive === false ? '— [Tạm tắt nhận]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Product selection list with counters */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', marginBottom: '16px' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                CHỌN NƯỚC GIẢI KHÁT & LY ĐÁ:
              </div>

              {products.map(p => {
                const itemData = posCart[p.id] || { quantity: 0, iceQuantity: 0 };
                return (
                  <div key={p.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: itemData.quantity > 0 ? 'var(--color-primary-light)' : 'var(--color-bg)',
                    border: `1px solid ${itemData.quantity > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {formatVnd(p.priceVnd)} • Tồn: {p.stock} chai
                      </div>
                    </div>

                    {/* Quantity & Ice Stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Bottles Stepper */}
                      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = Math.max(0, itemData.quantity - 1);
                            const newIce = Math.min(newQty, itemData.iceQuantity);
                            setPosCart(prev => ({ ...prev, [p.id]: { quantity: newQty, iceQuantity: newIce } }));
                          }}
                          style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', fontWeight: 800, cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <span style={{ width: '24px', textAlign: 'center', fontWeight: 800, fontSize: 'var(--font-size-sm)' }}>
                          {itemData.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = itemData.quantity + 1;
                            const newIce = itemData.iceQuantity + 1;
                            setPosCart(prev => ({ ...prev, [p.id]: { quantity: newQty, iceQuantity: newIce } }));
                          }}
                          style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', fontWeight: 800, cursor: 'pointer', color: 'var(--color-primary)' }}
                        >
                          +
                        </button>
                      </div>

                      {/* Ice Stepper (Only visible if quantity > 0) */}
                      {itemData.quantity > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#1E40AF', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                          <span>🧊 Đá:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newIce = Math.max(0, itemData.iceQuantity - 1);
                              setPosCart(prev => ({ ...prev, [p.id]: { ...itemData, iceQuantity: newIce } }));
                            }}
                            style={{ border: 'none', background: 'transparent', fontWeight: 800, cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 800 }}>{itemData.iceQuantity}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newIce = Math.min(itemData.quantity, itemData.iceQuantity + 1);
                              setPosCart(prev => ({ ...prev, [p.id]: { ...itemData, iceQuantity: newIce } }));
                            }}
                            style={{ border: 'none', background: 'transparent', fontWeight: 800, cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total and Submit */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>TỔNG TIỀN:</div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 900, color: 'var(--color-primary)' }}>
                  {formatVnd(
                    Object.entries(posCart).reduce((sum, [pid, data]) => {
                      const pr = products.find(p => p.id === pid);
                      return sum + (pr ? pr.priceVnd * data.quantity : 0);
                    }, 0)
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setIsCreateOrderModalOpen(false)}
                  style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', fontWeight: 600 }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmitPosOrder}
                  disabled={isSubmittingPosOrder}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: 'var(--font-size-sm)',
                    border: 'none',
                    cursor: isSubmittingPosOrder ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmittingPosOrder ? 'Đang tạo...' : '🚀 XÁC NHẬN TẠO ĐƠN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SỬA TÊN SÂN */}
      {editingCourt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '380px', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '14px' }}>
              Đổi Tên Sân Hiển Thị ({editingCourt.code})
            </h3>
            <form onSubmit={handleSaveRenameCourt} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Tên sân mới</label>
                <input
                  type="text"
                  required
                  value={editCourtName}
                  onChange={e => setEditCourtName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                  placeholder="VD: Sân 01 (VIP)"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingCourt(null)}
                  style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg)' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', color: '#FFFFFF', fontWeight: 700 }}
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
