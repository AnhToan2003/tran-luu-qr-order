import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Product } from '../types/product';
import { OrderItem, Order } from '../types/order';
import { apiFetch, stableRequestId, completeRequest, ApiError } from '../lib/api';
import { sound } from '../lib/sound';
import { CustomerHeader } from '../components/CustomerHeader';
import { CourtContextBadge } from '../components/CourtContextBadge';
import { ProductCard } from '../components/ProductCard';
import { FloatingCartBar } from '../components/FloatingCartBar';
import { CartBottomSheet } from '../components/CartBottomSheet';
import { OrderTrackingModal } from '../components/OrderTrackingModal';
import { OrderHistoryModal } from '../components/OrderHistoryModal';

export const CustomerOrderPage: React.FC = () => {
  const submitLock = useRef(false);
  const [pageError, setPageError] = useState('');
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Đọc mã sân từ URL: ?court=05 hoặc mặc định '05'
  const courtCode = useMemo<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('court') || '05';
  }, []);

  // Khóa lưu trữ đơn hàng cho phiên quét hiện tại (sessionStorage scoped theo sân)
  const scanStorageKey = useMemo(() => 'tl_scan_orders_' + courtCode, [courtCode]);

  // Token phiên quét định danh thiết bị & lần quét hiện tại (mỗi thiết bị / mỗi lần quét mới là 1 session riêng biệt)
  const scanSessionToken = useMemo(() => {
    const key = 'tl_scan_token_' + courtCode;
    try {
      let token = sessionStorage.getItem(key);
      if (!token || !/^[a-f0-9]{32,64}$/i.test(token)) {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        token = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(key, token);
      }
      return token;
    } catch {
      return '';
    }
  }, [courtCode]);

  const getSessionOrderIds = useCallback((): string[] => {
    try {
      const raw = sessionStorage.getItem(scanStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [scanStorageKey]);

  const saveSessionOrderId = useCallback((id: string) => {
    try {
      const current = getSessionOrderIds();
      if (!current.includes(id)) {
        sessionStorage.setItem(scanStorageKey, JSON.stringify([...current, id]));
      }
    } catch {}
  }, [getSessionOrderIds, scanStorageKey]);

  const [products, setProducts] = useState<Product[]>([]);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean>(false);
  const [courtDisabledMessage, setCourtDisabledMessage] = useState<string | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [courtInfo, setCourtInfo] = useState<{ courtId: string; code: string; name: string } | null>(null);

  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);

  const selectedCourt = useMemo(() => {
    if (courtInfo) return courtInfo;
    return { courtId: '', code: courtCode, name: 'Đang xác nhận sân…' };
  }, [courtCode, courtInfo]);

  // Tải danh mục nước từ MongoDB
  const fetchCatalog = useCallback(async () => {
    try {
      const data = await (await apiFetch('/api/catalog?court_code=' + encodeURIComponent(courtCode))).json();
      setProducts(data.products);
      setIsAcceptingOrders(data.isAcceptingOrders);
      setCourtInfo(data.court);
      setCourtDisabledMessage(data.courtDisabledMessage || null);
      setPageError('');
    } catch (e) {
      setPageError((e as Error).message);
      setIsAcceptingOrders(false);
      if (e instanceof ApiError && e.status === 404) {
        setProducts([]);
        setCourtInfo(null);
      }
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [courtCode]);

  // Chỉ lấy và hiển thị các đơn hàng ĐANG PHỤC VỤ (chưa hoàn tất và chưa hủy) trong lần quét hiện tại
  const checkMyActiveOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders/my?court_code=' + encodeURIComponent(courtCode), {
        headers: scanSessionToken ? { 'x-customer-session': scanSessionToken } : undefined
      });
      const list: Order[] = await res.json();
      const sessionIds = getSessionOrderIds();

      // Các đơn đã giao (delivered) hoặc đã hủy (cancelled) đã hoàn tất chu trình phục vụ
      // -> Tự động dọn dẹp khỏi bộ nhớ phiên, KHÔNG lưu lại bắt khách bấm nút thủ công
      const activeOrders = list.filter(o => sessionIds.includes(o.id) && !['delivered', 'cancelled'].includes(o.status));

      // Tự động đồng bộ sessionStorage chỉ lưu các đơn còn đang cần phục vụ
      const activeIds = activeOrders.map(o => o.id);
      if (activeIds.length !== sessionIds.length) {
        try {
          sessionStorage.setItem(scanStorageKey, JSON.stringify(activeIds));
        } catch {}
      }

      setMyOrders(activeOrders);

      setActiveTrackingOrder(previous => {
        if (previous) {
          const match = activeOrders.find(o => o.id === previous.id);
          // Nếu đơn trước đó vừa chuyển sang delivered/cancelled, giữ lại để modal hiển thị nốt bước hoàn tất
          if (!match) {
            const terminalMatch = list.find(o => o.id === previous.id);
            return terminalMatch || null;
          }
          return match;
        }
        return activeOrders[0] || null;
      });
    } catch (e) {
      setPageError((e as Error).message);
    }
  }, [courtCode, getSessionOrderIds, scanSessionToken, scanStorageKey]);
  useEffect(() => {
    void fetchCatalog();
    const timer = setInterval(fetchCatalog, 4000);
    const onFocus = () => void fetchCatalog();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchCatalog]);
  useEffect(()=>{void checkMyActiveOrders();const timer=setInterval(checkMyActiveOrders,5000);return()=>clearInterval(timer);},[checkMyActiveOrders]);
  const totalCartVnd = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cartItems]);

  const totalCartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  // Cart operations
  const handleAddToCart = useCallback((product: Product) => {
    if(!isAcceptingOrders || !courtInfo || product.stock<1 || submitLock.current)return;
    sound.playActionClick();
    setCartItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if(existing.quantity>=product.stock)return prev;
        return prev.map(item =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                iceQuantity: item.iceQuantity + 1,
                lineTotal: (item.quantity + 1) * item.unitPrice
              }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          imageSvg: product.imageSvg,
          name: product.name,
          volume: product.volume,
          unitPrice: product.priceVnd,
          quantity: 1,
          iceQuantity: 1,
          lineTotal: product.priceVnd
        }
      ];
    });
  }, [isAcceptingOrders,courtInfo]);

  const handleUpdateQuantity = useCallback((productId: string, newQty: number) => {
    sound.playActionClick();
    if(submitLock.current)return;
    const available=products.find(p=>p.id===productId)?.stock||0;
    if(newQty>available){setPageError('Số lượng vượt tồn kho hiện tại');return;}
    if (newQty <= 0) {
      setCartItems(prev => prev.filter(i => i.productId !== productId));
    } else {
      setCartItems(prev =>
        prev.map(item => {
          if (item.productId === productId) {
            const clampedIce = Math.min(item.iceQuantity, newQty);
            return {
              ...item,
              quantity: newQty,
              iceQuantity: clampedIce,
              lineTotal: newQty * item.unitPrice
            };
          }
          return item;
        })
      );
    }
  }, [products]);

  const handleUpdateIce = useCallback((productId: string, newIce: number) => {
    if(submitLock.current)return;
    sound.playActionClick();
    setCartItems(prev =>
      prev.map(item => {
        if (item.productId === productId) {
          const clamped = Math.max(0, Math.min(item.quantity, newIce));
          return { ...item, iceQuantity: clamped };
        }
        return item;
      })
    );
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    if(submitLock.current)return;
    sound.playActionClick();
    setCartItems(prev => prev.filter(i => i.productId !== productId));
  }, []);

  // Submit Order
  const handleSubmitOrder = useCallback(async()=>{
    if(submitLock.current || !cartItems.length || !courtInfo || !isAcceptingOrders)return;
    submitLock.current=true;setIsSubmittingOrder(true);setPageError('');
    const payload={courtCode:courtInfo.code,items:cartItems.map(i=>({productId:i.productId,quantity:i.quantity,iceQuantity:i.iceQuantity}))};
    const key='customer:'+courtInfo.code;
    const clientRequestId=stableRequestId(key,payload);
    try {
      const order: Order = await (await apiFetch('/api/orders', {
        method: 'POST',
        headers: scanSessionToken ? { 'x-customer-session': scanSessionToken } : undefined,
        body: JSON.stringify({ ...payload, clientRequestId })
      })).json();
      completeRequest(key);
      saveSessionOrderId(order.id);
      setCartItems([]);
      setIsCartOpen(false);
      setActiveTrackingOrder(order);
      setIsTrackingModalOpen(true);
      await checkMyActiveOrders();
      await fetchCatalog();
    } catch(e) {
      setPageError((e as Error).message);
      if(e instanceof ApiError && e.status === 409) await fetchCatalog();
    } finally {
      submitLock.current = false;
      setIsSubmittingOrder(false);
    }
  }, [cartItems, courtInfo, isAcceptingOrders, checkMyActiveOrders, fetchCatalog, saveSessionOrderId, scanSessionToken]);

  const hasActiveOrder = useMemo(() => {
    return myOrders.some(o => !['delivered', 'cancelled'].includes(o.status));
  }, [myOrders]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      backgroundColor: '#E5EDE7' // Khung nền nhẹ bên ngoài trên desktop
    }}>
      {/* Khung ứng dụng di động chuẩn 480px */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        boxShadow: '0 0 35px rgba(18, 67, 46, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* Header thương hiệu */}
        <CustomerHeader
          onOpenMyOrders={() => { setIsHistoryOpen(true); void checkMyActiveOrders(); }}
          hasActiveOrder={hasActiveOrder}
          isAcceptingOrders={isAcceptingOrders}
          courtDisabledMessage={courtDisabledMessage}
        />

        {pageError && (
          <div role="alert" style={{ padding: 12, background: '#fee2e2', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{pageError}</span>
            <button onClick={() => void fetchCatalog()} style={{ cursor: 'pointer', padding: '4px 8px' }}>Thử lại</button>
          </div>
        )}

        {/* Modal Danh sách đơn hàng trong lần quét hiện tại */}
        <OrderHistoryModal
          isOpen={isHistoryOpen}
          courtCode={courtCode}
          courtName={selectedCourt.name}
          orders={myOrders}
          onClose={() => setIsHistoryOpen(false)}
          onSelectOrder={(order) => {
            setActiveTrackingOrder(order);
            setIsHistoryOpen(false);
            setIsTrackingModalOpen(true);
          }}
        />
        {/* Ngữ cảnh vị trí Sân */}
        <CourtContextBadge courtName={selectedCourt.name} />

        {/* Cảnh báo khi sân bị khóa nhận đơn hoặc quầy đóng */}
        {courtDisabledMessage ? (
          <div style={{
            margin: '12px 16px 0',
            padding: '12px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #F87171',
            borderRadius: 'var(--radius-md)',
            color: '#B91C1C',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '16px' }}>🚫</span>
            <span>{courtDisabledMessage}</span>
          </div>
        ) : !isAcceptingOrders ? (
          <div style={{
            margin: '12px 16px 0',
            padding: '10px 14px',
            backgroundColor: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: 'var(--radius-md)',
            color: '#991B1B',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span>
            <span>Quầy nước hiện đang tạm dừng nhận đơn mới. Quý khách vui lòng quay lại sau ít phút.</span>
          </div>
        ) : null}

        {/* Thực đơn nước giải khát (Hiển thị ngay màn hình đầu tiên) */}
        <main style={{
          padding: '16px',
          paddingBottom: totalCartCount > 0 ? '110px' : '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px'
        }}>
          {isLoadingCatalog ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted)' }}>
              Đang tải danh mục nước giải khát...
            </div>
          ) : products.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted)' }}>
              Hiện chưa có sản phẩm nào sẵn sàng phục vụ.
            </div>
          ) : (
            products.map(product => {
              const inCart = cartItems.find(i => i.productId === product.id)?.quantity || 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantityInCart={inCart}
                  onAddToCart={() => handleAddToCart(product)}
                  onIncrease={() => handleUpdateQuantity(product.id, inCart + 1)}
                  onDecrease={() => handleUpdateQuantity(product.id, inCart - 1)}
                />
              );
            })
          )}
        </main>

        {/* Thanh giỏ hàng nổi đáy */}
        <FloatingCartBar
          totalItems={totalCartCount}
          totalVnd={totalCartVnd}
          courtName={selectedCourt.name}
          onOpenCart={() => setIsCartOpen(true)}
        />

        {/* Bottom Sheet giỏ hàng & Ly đá miễn phí */}
        <CartBottomSheet
          isOpen={isCartOpen}
          courtName={selectedCourt.name}
          items={cartItems}
          totalVnd={totalCartVnd}
          onClose={() => setIsCartOpen(false)}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateIce={handleUpdateIce}
          onRemoveItem={handleRemoveItem}
          onSubmitOrder={handleSubmitOrder}
          isSubmitting={isSubmittingOrder}
          canSubmit={isAcceptingOrders && !!courtInfo}
          error={pageError}
        />

        {/* Modal theo dõi đơn hàng */}
        {activeTrackingOrder && (
          <OrderTrackingModal
            order={activeTrackingOrder}
            isOpen={isTrackingModalOpen}
            onClose={() => {
              setIsTrackingModalOpen(false);
              if (['delivered', 'cancelled'].includes(activeTrackingOrder.status)) {
                setActiveTrackingOrder(null);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};
