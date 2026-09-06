import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Product } from '../data/mockProducts';
import { COURTS, OrderItem, Order } from '../types/order';
import { sound } from '../lib/sound';
import { CustomerHeader } from '../components/CustomerHeader';
import { CourtContextBadge } from '../components/CourtContextBadge';
import { ProductCard } from '../components/ProductCard';
import { FloatingCartBar } from '../components/FloatingCartBar';
import { CartBottomSheet } from '../components/CartBottomSheet';
import { OrderTrackingModal } from '../components/OrderTrackingModal';

export const CustomerOrderPage: React.FC = () => {
  // Đọc mã sân từ URL: ?court=05 hoặc mặc định '05'
  const courtCode = useMemo<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('court') || '05';
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean>(true);
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
    return COURTS.find(c => c.code === courtCode) || { courtId: `court-uuid-${courtCode}`, code: courtCode, name: `Sân ${courtCode}` };
  }, [courtCode, courtInfo]);

  // Tải danh mục nước từ MongoDB
  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(`/api/catalog?court_code=${courtCode}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setIsAcceptingOrders(data.isAcceptingOrders ?? true);
        if (data.court) {
          setCourtInfo(data.court);
        }
        setCourtDisabledMessage(data.courtDisabledMessage || null);
      } else if (res.status === 404) {
        const err = await res.json();
        setCourtDisabledMessage(err.message || `Không tìm thấy thông tin sân ${courtCode}`);
      }
    } catch (err) {
      console.warn('[CustomerPage] Error loading catalog:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [courtCode]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Kiểm tra đơn hàng đang mở của khách
  const checkMyActiveOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/my');
      if (res.ok) {
        const myOrders: Order[] = await res.json();
        const active = myOrders.find(o => o.status !== 'delivered' && o.status !== 'cancelled');
        if (active) {
          setActiveTrackingOrder(active);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkMyActiveOrders();
    const interval = setInterval(checkMyActiveOrders, 5000);
    return () => clearInterval(interval);
  }, [checkMyActiveOrders]);

  const totalCartVnd = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cartItems]);

  const totalCartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  // Cart operations
  const handleAddToCart = useCallback((product: Product) => {
    sound.playActionClick();
    setCartItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
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
          name: product.name,
          volume: product.volume,
          unitPrice: product.priceVnd,
          quantity: 1,
          iceQuantity: 1,
          lineTotal: product.priceVnd
        }
      ];
    });
  }, []);

  const handleUpdateQuantity = useCallback((productId: string, newQty: number) => {
    sound.playActionClick();
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
  }, []);

  const handleUpdateIce = useCallback((productId: string, newIce: number) => {
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
    sound.playActionClick();
    setCartItems(prev => prev.filter(i => i.productId !== productId));
  }, []);

  // Submit Order
  const handleSubmitOrder = useCallback(async () => {
    if (cartItems.length === 0) return;
    setIsSubmittingOrder(true);
    sound.playActionClick();

    try {
      const clientRequestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          courtCode: selectedCourt.code,
          items: cartItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            iceQuantity: i.iceQuantity
          }))
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.message || 'Lỗi đặt hàng');
        return;
      }

      const newOrder = await res.json();
      setCartItems([]);
      setIsCartOpen(false);
      setActiveTrackingOrder(newOrder);
      setIsTrackingModalOpen(true);
      fetchCatalog();
    } catch (err: any) {
      alert('Không thể kết nối đến máy chủ: ' + err.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }, [cartItems, fetchCatalog, selectedCourt.code]);



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
          onOpenMyOrders={() => {
            if (activeTrackingOrder) {
              setIsTrackingModalOpen(true);
            }
          }}
          hasActiveOrder={!!activeTrackingOrder}
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
        />

        {/* Modal theo dõi đơn hàng */}
        {activeTrackingOrder && (
          <OrderTrackingModal
            order={activeTrackingOrder}
            isOpen={isTrackingModalOpen}
            onClose={() => setIsTrackingModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
