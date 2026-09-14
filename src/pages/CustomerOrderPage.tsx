import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Product } from '../types/product';
import { OrderItem, Order } from '../types/order';
import { apiFetch, stableRequestId, completeRequest, ApiError } from '../lib/api';
import { sound } from '../lib/sound';
import { parseCourtUrlParams } from '../lib/qrUrl';
import { CustomerHeader } from '../components/CustomerHeader';
import { CourtContextBadge } from '../components/CourtContextBadge';
import { ProductCard } from '../components/ProductCard';
import { FloatingCartBar } from '../components/FloatingCartBar';
import { CartBottomSheet } from '../components/CartBottomSheet';
import { OrderTrackingModal } from '../components/OrderTrackingModal';
import { OrderHistoryModal } from '../components/OrderHistoryModal';

const SESSION_TOKEN_KEY = 'tl_customer_session_token';
const SESSION_COURT_KEY = 'tl_customer_session_court';

export const CustomerOrderPage: React.FC = () => {
  const submitLock = useRef(false);
  const initInFlightRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const initialUrlParams = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.search) {
      return parseCourtUrlParams(window.location.search);
    }
    return { court: '', sig: '' };
  }, []);

  // Trạng thái phiên khách hàng độc lập
  const [sessionToken, setSessionToken] = useState<string>(() => {
    if (initialUrlParams.court) return ''; // Đang quét mới, không render token cũ
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });

  const [courtInfo, setCourtInfo] = useState<{ courtId: string; code: string; name: string } | null>(() => {
    if (initialUrlParams.court) return null; // Đang quét mới, không render sân cũ
    try {
      const raw = sessionStorage.getItem(SESSION_COURT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [courtCode, setCourtCode] = useState<string>(() => initialUrlParams.court || courtInfo?.code || '');
  const [qrError, setQrError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [cartToast, setCartToast] = useState<string>('');
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean>(false);
  const [courtDisabledMessage, setCourtDisabledMessage] = useState<string | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);

  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);

  // Xóa key cũ tl_customer_profile khỏi localStorage để tránh rò rỉ dữ liệu giữa các khách
  useEffect(() => {
    try {
      localStorage.removeItem('tl_customer_profile');
    } catch {}
  }, []);

  // ================= 1. KHỞI TẠO VÀ ĐỒNG BỘ PHIÊN KHÁCH HÀNG =================
  useEffect(() => {
    const { court: urlCourt, sig: urlSig } = parseCourtUrlParams(window.location.search);

    // Tình huống A: Quét mã QR mới (URL có tham số court và sig)
    if (urlCourt) {
      if (initInFlightRef.current) return;
      initInFlightRef.current = true;

      const initNewSession = async () => {
        try {
          setIsLoadingCatalog(true);
          setQrError('');

          // Nếu trước đó đang có phiên của sân khác, dọn dẹp phiên cũ
          let currentToken = sessionToken;
          try {
            currentToken = currentToken || sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
          } catch {}

          if (currentToken) {
            try {
              await apiFetch('/api/sessions/terminate', {
                method: 'POST',
                headers: { 'x-customer-session': currentToken }
              });
            } catch {}
          }

          // Gọi backend để xác thực chữ ký số và sinh session token 256-bit an toàn
          const res = await apiFetch('/api/sessions/init', {
            method: 'POST',
            body: JSON.stringify({ courtCode: urlCourt, sig: urlSig })
          });

          const data: { sessionToken: string; court: { courtId: string; code: string; name: string }; expiresAt: string } = await res.json();

          const tabOwnerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
          if (typeof window !== 'undefined') {
            window.name = tabOwnerId;
          }

          // Lưu token phiên và thông tin sân vào sessionStorage (tách biệt theo từng tab/lượt khách)
          try {
            sessionStorage.setItem(SESSION_TOKEN_KEY, data.sessionToken);
            sessionStorage.setItem(SESSION_COURT_KEY, JSON.stringify(data.court));
            sessionStorage.setItem('tl_tab_owner', tabOwnerId);
            sessionStorage.removeItem('tl_session_customer_info');
          } catch {}

          setSessionToken(data.sessionToken);
          setCourtInfo(data.court);
          setCourtCode(data.court.code);
          setCartItems([]);
          setMyOrders([]);

          // Loại bỏ query params khỏi thanh địa chỉ (replaceState) để khi khách F5/reload sẽ là Luồng B (Reload)
          window.history.replaceState({}, '', window.location.pathname);
        } catch (e: any) {
          setQrError(e.message || 'Không thể khởi tạo phiên gọi nước. Vui lòng quét lại mã QR tại sân.');
          try {
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            sessionStorage.removeItem(SESSION_COURT_KEY);
            sessionStorage.removeItem('tl_tab_owner');
          } catch {}
          setSessionToken('');
          setCourtInfo(null);
          setCourtCode('');
        } finally {
          initInFlightRef.current = false;
          setIsLoadingCatalog(false);
        }
      };

      void initNewSession();
      return;
    }

    // Tình huống B: Reload / Reconnect trong phiên hiện tại (không có query params trên URL)
    const currentTabId = typeof window !== 'undefined' ? window.name : '';
    let storedTabOwner = '';
    let existingToken = sessionToken;
    try {
      storedTabOwner = sessionStorage.getItem('tl_tab_owner') || '';
      existingToken = existingToken || sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
    } catch {}

    // BẢO VỆ DUPLICATE TAB: Nếu tab bị nhân bản (cloned context), window.name sẽ rỗng hoặc không khớp với tl_tab_owner
    if (existingToken && (!currentTabId || currentTabId !== storedTabOwner)) {
      console.warn('[SessionGuard] Phát hiện duplicate/cloned tab. Hủy token sao chép để đảm bảo phiên độc lập.');
      sessionGenerationRef.current += 1;
      try {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_COURT_KEY);
        sessionStorage.removeItem('tl_tab_owner');
      } catch {}
      setSessionToken('');
      setCourtInfo(null);
      setCourtCode('');
      setCartItems([]);
      setMyOrders([]);
      setQrError('Thẻ này được nhân bản từ một tab khác. Quý khách vui lòng quét lại mã QR tại sân để bắt đầu gọi nước.');
      setIsLoadingCatalog(false);
      return;
    }

    if (existingToken) {
      const validateCurrentSession = async () => {
        try {
          const res = await apiFetch('/api/sessions/current', {
            headers: { 'x-customer-session': existingToken }
          });
          const data = await res.json();
          setSessionToken(existingToken);
          setCourtInfo(data.court);
          setCourtCode(data.court.code);
          try {
            sessionStorage.setItem(SESSION_COURT_KEY, JSON.stringify(data.court));
          } catch {}
        } catch (err: any) {
          if (err?.status === 401 || err?.code === 'SESSION_EXPIRED' || err?.code === 'SESSION_REQUIRED' || err?.code === 'INVALID_SESSION') {
            // Phiên hết hạn hoặc không hợp lệ -> xóa sạch phiên cũ
            try {
              sessionStorage.removeItem(SESSION_TOKEN_KEY);
              sessionStorage.removeItem(SESSION_COURT_KEY);
            } catch {}
            setSessionToken('');
            setCourtInfo(null);
            setCourtCode('');
            setCartItems([]);
            setMyOrders([]);
            setQrError('Phiên sử dụng đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại sân.');
          }
          // Lỗi mạng tạm thời, giữ nguyên phiên từ sessionStorage
        } finally {
          setIsLoadingCatalog(false);
        }
      };

      void validateCurrentSession();
    } else {
      setIsLoadingCatalog(false);
    }
  }, []);

  // ================= 2. THAO TÁC KẾT THÚC PHIÊN & HẾT HẠN =================
  const handleSessionExpired = useCallback((msg?: string) => {
    sessionGenerationRef.current += 1;
    activeAbortControllerRef.current?.abort('session_changed');
    activeAbortControllerRef.current = new AbortController();

    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_COURT_KEY);
      sessionStorage.removeItem('tl_session_customer_info');
    } catch {}

    setSessionToken('');
    setCourtInfo(null);
    setCourtCode('');
    setCartItems([]);
    setMyOrders([]);
    setActiveTrackingOrder(null);
    setIsTrackingModalOpen(false);
    setIsCartOpen(false);
    setIsHistoryOpen(false);
    setQrError(msg || 'Phiên sử dụng đã hết hạn hoặc không hợp lệ. Vui lòng quét lại mã QR tại sân.');
  }, []);

  // ================= 3. TẢI VÀ ĐỐI SOÁT CATALOG =================
  const fetchCatalog = useCallback(async () => {
    if (!sessionToken && !courtCode) return;
    const gen = sessionGenerationRef.current;
    try {
      const url = '/api/catalog' + (courtCode ? '?court_code=' + encodeURIComponent(courtCode) : '');
      const res = await apiFetch(url, {
        headers: sessionToken ? { 'x-customer-session': sessionToken } : undefined,
        signal: activeAbortControllerRef.current?.signal
      });

      if (gen !== sessionGenerationRef.current) return;
      if (res.status === 304) {
        setIsLoadingCatalog(false);
        return;
      }

      const data = await res.json();
      if (gen !== sessionGenerationRef.current) return;

      const newProducts: Product[] = data.products || [];
      setProducts(newProducts);
      setIsAcceptingOrders(data.isAcceptingOrders);
      if (data.court) {
        setCourtInfo(data.court);
      }
      setCourtDisabledMessage(data.courtDisabledMessage || null);
      setQrError('');

      // Đối soát giỏ hàng: nếu sản phẩm còn hàng thì GIỮ NGUYÊN giỏ, chỉ cập nhật khi thay đổi giá/tồn
      setCartItems(prev => {
        if (!prev.length) return prev;
        let modified = false;
        const reconciled = prev.flatMap(item => {
          const match = newProducts.find(p => p.id === item.productId);
          if (!match || match.isAvailable === false || match.stock <= 0) {
            modified = true;
            return [];
          }
          const clampedQty = Math.min(item.quantity, match.stock);
          const clampedIce = Math.min(item.iceQuantity, clampedQty);
          if (clampedQty !== item.quantity || match.priceVnd !== item.unitPrice || clampedIce !== item.iceQuantity) {
            modified = true;
            return [{
              ...item,
              quantity: clampedQty,
              iceQuantity: clampedIce,
              unitPrice: match.priceVnd,
              lineTotal: clampedQty * match.priceVnd
            }];
          }
          return [item];
        });

        if (modified && typeof setCartToast === 'function') {
          setCartToast('Giỏ hàng vừa được cập nhật theo số lượng tồn kho mới nhất');
          if (typeof setTimeout === 'function') setTimeout(() => setCartToast(''), 4000);
        }
        return reconciled;
      });
    } catch (err: any) {
      if (gen !== sessionGenerationRef.current) return;
      if (err?.name === 'AbortError') return;
      if (err?.status === 401 || err?.code === 'SESSION_EXPIRED' || err?.code === 'SESSION_REQUIRED' || err?.code === 'INVALID_SESSION') {
        handleSessionExpired(err.message);
        return;
      }
      // Lỗi mạng nền -> giữ nguyên catalog hiện có
    } finally {
      if (gen === sessionGenerationRef.current) {
        setIsLoadingCatalog(false);
      }
    }
  }, [courtCode, sessionToken, handleSessionExpired]);

  // ================= 4. TẢI ĐƠN HÀNG CỦA PHIÊN HIỆN TẠI =================
  const checkMyActiveOrders = useCallback(async () => {
    if (!sessionToken) return;
    const gen = sessionGenerationRef.current;
    try {
      const res = await apiFetch('/api/orders/my', {
        headers: { 'x-customer-session': sessionToken },
        signal: activeAbortControllerRef.current?.signal
      });
      if (gen !== sessionGenerationRef.current) return;
      const list: Order[] = await res.json();
      if (gen !== sessionGenerationRef.current) return;
      setMyOrders(list);

      // Cập nhật đơn đang theo dõi
      setActiveTrackingOrder(prev => {
        if (prev) {
          const match = list.find(o => o.id === prev.id);
          return match || prev;
        }
        const active = list.find(o => !['delivered', 'cancelled'].includes(o.status));
        return active || null;
      });
    } catch (err: any) {
      if (gen !== sessionGenerationRef.current) return;
      if (err?.name === 'AbortError') return;
      if (err?.status === 401 || err?.code === 'SESSION_EXPIRED' || err?.code === 'SESSION_REQUIRED') {
        handleSessionExpired(err.message);
      }
    }
  }, [sessionToken, handleSessionExpired]);

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void fetchCatalog();
      void checkMyActiveOrders();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchCatalog, checkMyActiveOrders]);

  // ================= 5. POLLING CATALOG & ĐƠN HÀNG VỚI IN-FLIGHT LOCK =================
  useEffect(() => {
    if (!courtCode || !sessionToken) return;
    let isMounted = true;
    let timerId: any = null;
    let inFlight = false;
    let delay = 4000;

    const clearScheduledTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const poll = async () => {
      clearScheduledTimer();
      if (inFlight || !isMounted) return;
      inFlight = true;
      try {
        await Promise.all([fetchCatalog(), checkMyActiveOrders()]);
        delay = 4000;
      } catch {
        delay = Math.min(delay * 1.5, 25000);
      } finally {
        inFlight = false;
        if (isMounted) {
          const nextDelay = document.hidden ? Math.max(delay, 15000) : delay;
          clearScheduledTimer();
          timerId = setTimeout(poll, nextDelay);
        }
      }
    };

    void poll();

    const onWake = () => {
      if (!isMounted) return;
      if (!document.hidden && !inFlight) {
        clearScheduledTimer();
        delay = 4000;
        void poll();
      }
    };

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      isMounted = false;
      clearScheduledTimer();
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [courtCode, sessionToken, fetchCatalog, checkMyActiveOrders]);

  // ================= 5.1. WEBSOCKET REAL-TIME (TỨC THÌ < 50ms) =================
  useEffect(() => {
    if (!sessionToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          // Gửi sessionToken để BE hash và so khớp với event.sessionHash khi broadcast
          ws?.send(JSON.stringify({ type: 'subscribe', role: 'customer', sessionHash: sessionToken }));
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'order_updated' && msg.data) {
              const updated = msg.data;
              const targetId = updated.id || updated.orderId;
              const normalizedOrder: Order = { ...updated, id: targetId };
              setActiveTrackingOrder(prev => {
                const currentId = prev?.id || (prev as any)?.orderId;
                return currentId === targetId ? normalizedOrder : prev;
              });
              setMyOrders(prev => prev.map(o => {
                const currentId = o.id || (o as any).orderId;
                return currentId === targetId ? normalizedOrder : o;
              }));
            } else if (msg.type === 'stock_updated') {
              void fetchCatalog();
            }
          } catch {}
        };
        ws.onclose = () => {
          if (isMounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {}
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [sessionToken, fetchCatalog]);

  // ================= 6. GIỎ HÀNG VÀ ĐẶT HÀNG =================
  const totalCartVnd = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cartItems]);

  const totalCartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  const handleAddToCart = useCallback((product: Product) => {
    if (!isAcceptingOrders || !courtInfo || product.stock < 1 || submitLock.current) return;
    sound.playActionClick();
    setCartItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
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
  }, [isAcceptingOrders, courtInfo]);

  const handleUpdateQuantity = useCallback((productId: string, newQty: number) => {
    sound.playActionClick();
    if (submitLock.current) return;
    const available = products.find(p => p.id === productId)?.stock || 0;
    if (newQty > available) {
      setSubmitError('Số lượng vượt tồn kho hiện tại');
      setTimeout(() => setSubmitError(''), 3000);
      return;
    }
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
    if (submitLock.current) return;
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
    if (submitLock.current) return;
    sound.playActionClick();
    setCartItems(prev => prev.filter(i => i.productId !== productId));
  }, []);

  // Đặt hàng (Đảm bảo submitLock luôn được mở trong finally)
  const handleSubmitOrder = useCallback(async (customerInfo: { name: string; phone: string }) => {
    if (submitLock.current || !cartItems.length || !courtInfo || !isAcceptingOrders || !sessionToken) return;
    submitLock.current = true;
    setIsSubmittingOrder(true);
    setSubmitError('');

    const payload = {
      courtCode: courtInfo.code,
      customerName: customerInfo.name,
      customerPhone: customerInfo.phone,
      items: cartItems.map(i => ({ productId: i.productId, quantity: i.quantity, iceQuantity: i.iceQuantity }))
    };
    const key = 'customer:' + courtInfo.code;
    const clientRequestId = stableRequestId(key, payload);

    const submissionGeneration = sessionGenerationRef.current;
    const submissionToken = sessionToken;

    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'x-customer-session': sessionToken },
        body: JSON.stringify({ ...payload, clientRequestId })
      });
      const order: Order = await res.json();

      // BẢO VỆ PHẢN HỒI VỀ MUỘN (Late Response Race Condition Guard):
      // Nếu trong lúc POST đang chờ, phiên bị vô hiệu hóa hoặc chuyển sang phiên khác:
      if (sessionGenerationRef.current !== submissionGeneration || sessionToken !== submissionToken) {
        console.warn('[OrderGuard] Đã chặn phản hồi đặt đơn muộn vì phiên đã thay đổi/hết hạn trong lúc gửi request.');
        return;
      }

      completeRequest(key);
      setCartItems([]);
      setIsCartOpen(false);
      setActiveTrackingOrder(order);
      setIsTrackingModalOpen(true);
      await checkMyActiveOrders();
      await fetchCatalog();
    } catch (e: any) {
      if (e instanceof ApiError && (e.status === 401 || e.code === 'SESSION_EXPIRED' || e.code === 'SESSION_REQUIRED')) {
        handleSessionExpired(e.message);
        return;
      }
      setSubmitError(e.message || 'Đã có lỗi xảy ra khi đặt nước');
      if (e instanceof ApiError && e.status === 409) {
        await fetchCatalog();
      }
    } finally {
      submitLock.current = false;
      setIsSubmittingOrder(false);
    }
  }, [cartItems, courtInfo, isAcceptingOrders, sessionToken, checkMyActiveOrders, fetchCatalog, handleSessionExpired]);

  const hasActiveOrder = useMemo(() => {
    return myOrders.some(o => !['delivered', 'cancelled'].includes(o.status));
  }, [myOrders]);

  const selectedCourt = useMemo(() => {
    if (courtInfo) return courtInfo;
    return { courtId: '', code: courtCode, name: courtCode ? `Sân ${courtCode}` : 'Chưa chọn sân' };
  }, [courtCode, courtInfo]);

  // ================= 7. MÀN HÌNH HƯỚNG DẪN KHI CHƯA CÓ PHIÊN HOẶC CHƯA QUÉT QR =================
  if (!courtCode || !sessionToken) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: '#E5EDE7',
        padding: '16px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 10px 30px rgba(18, 67, 46, 0.12)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          <div style={{
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            backgroundColor: '#ECFDF5',
            border: '3px solid #10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '40px'
          }}>
            🏸
          </div>

          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-deep)', marginBottom: '8px' }}>
              Sân Cầu Lông Trần Lựu
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Hệ thống gọi nước giải khát & ly đá miễn phí phục vụ tận sân
            </p>
          </div>



          {qrError && (
            <div style={{
              width: '100%',
              padding: '12px 14px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #F87171',
              borderRadius: '12px',
              color: '#991B1B',
              fontSize: '13px',
              fontWeight: 600
            }}>
              {qrError}
            </div>
          )}

          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1.5px dashed #CBD5E1',
            borderRadius: '16px',
            padding: '20px 16px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <span style={{ fontSize: '28px' }}>📱</span>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#1E293B' }}>
              Vui lòng quét mã QR tại sân thi đấu
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
              Mỗi sân thi đấu đều có dán một mã QR riêng biệt trên cột lưới hoặc bàn nghỉ. Hãy dùng Camera điện thoại hoặc Zalo để quét mã và bắt đầu lượt gọi nước mới!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================= 8. GIAO DIỆN CHÍNH CỦA KHÁCH HÀNG (TRONG PHIÊN) =================
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      backgroundColor: '#E5EDE7'
    }}>
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
        {!isOnline && (
          <div role="status" style={{
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 700,
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            ⚠️ Mất kết nối internet. Đang chờ kết nối lại mạng Wi-Fi / 4G sân cầu lông...
          </div>
        )}
        {/* Header */}
        <CustomerHeader
          onOpenMyOrders={() => { setIsHistoryOpen(true); void checkMyActiveOrders(); }}
          hasActiveOrder={hasActiveOrder}
          isAcceptingOrders={isAcceptingOrders}
          courtDisabledMessage={courtDisabledMessage}
        />



        {/* Thông báo cập nhật giỏ hàng tự động */}
        {cartToast && (
          <div role="status" style={{
            margin: '8px 16px 0',
            padding: '10px 14px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #93C5FD',
            borderRadius: 'var(--radius-md)',
            color: '#1D4ED8',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>ℹ️</span>
            <span>{cartToast}</span>
          </div>
        )}

        {/* Cảnh báo mã QR không hợp lệ */}
        {qrError && (
          <div role="alert" style={{
            margin: '12px 16px',
            padding: '16px',
            background: '#FEF2F2',
            border: '1.5px solid #F87171',
            borderRadius: 'var(--radius-md)',
            color: '#991B1B'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', marginBottom: '4px' }}>
                  Lưu ý về mã QR sân thi đấu:
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: '10px' }}>
                  {qrError}
                </div>
                <button
                  onClick={() => void fetchCatalog()}
                  style={{
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #DC2626',
                    color: '#DC2626',
                    fontWeight: 700,
                    fontSize: '11px'
                  }}
                >
                  Thử lại
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Danh sách đơn hàng trong phiên hiện tại */}
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
        <CourtContextBadge
          courtName={selectedCourt.name}
        />

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

        {/* Thực đơn nước giải khát */}
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
          key={sessionToken || 'no-session'}
          sessionToken={sessionToken}
          isOpen={isCartOpen}
          courtName={selectedCourt.name}
          items={cartItems}
          totalVnd={totalCartVnd}
          onClose={() => {
            setIsCartOpen(false);
            setSubmitError('');
          }}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateIce={handleUpdateIce}
          onRemoveItem={handleRemoveItem}
          onSubmitOrder={handleSubmitOrder}
          isSubmitting={isSubmittingOrder}
          canSubmit={isAcceptingOrders && !!courtInfo}
          error={submitError}
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
