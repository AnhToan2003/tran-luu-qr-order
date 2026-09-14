import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Order, Court } from '../../types/order';
import { sound, RingtoneStyle } from '../../lib/sound';
import { formatVnd, Product } from '../../types/product';
const downloadCourtQrPng = async (...args: Parameters<typeof import('../../lib/qrCode').downloadCourtQrPng>) => (await import('../../lib/qrCode')).downloadCourtQrPng(...args);
const downloadAllCourtsPdf = async (...args: Parameters<typeof import('../../lib/qrCode').downloadAllCourtsPdf>) => (await import('../../lib/qrCode')).downloadAllCourtsPdf(...args);
const generateCourtQrPng = async (...args: Parameters<typeof import('../../lib/qrCode').generateCourtQrPng>) => (await import('../../lib/qrCode')).generateCourtQrPng(...args);
import { apiFetch, stableRequestId, completeRequest } from '../../lib/api';
const exportOrdersToExcel = async (...args: Parameters<typeof import('../../lib/excelExport').exportOrdersToExcel>) => (await import('../../lib/excelExport')).exportOrdersToExcel(...args);
import { AdminOrdersView } from '../../components/AdminOrdersView';
import { compressImage } from '../../lib/imageUtils';

const ProductsTab = React.lazy(() => import('./tabs/ProductsTab').then(m => ({ default: m.ProductsTab })));
const CourtsTab = React.lazy(() => import('./tabs/CourtsTab').then(m => ({ default: m.CourtsTab })));
const ReportsTab = React.lazy(() => import('./tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const HistoryTab = React.lazy(() => import('./tabs/HistoryTab').then(m => ({ default: m.HistoryTab })));
const StockIntakeTab = React.lazy(() => import('./tabs/StockIntakeTab').then(m => ({ default: m.StockIntakeTab })));
const BackupTab = React.lazy(() => import('./tabs/BackupTab').then(m => ({ default: m.BackupTab })));
const SettingsTab = React.lazy(() => import('./tabs/SettingsTab').then(m => ({ default: m.SettingsTab })));

type AdminTab = 'orders' | 'products' | 'courts' | 'reports' | 'history' | 'stock-history' | 'backup' | 'settings';

export const AdminPortal: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('orders');

  const [apiError, setApiError] = useState('');
  const [historyCursor, setHistoryCursor] = useState<string|null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [stockMovements, setStockMovements] = useState<Array<{operationId:string;delta:number;stockAfter:number;createdAt:string;reason:string}>>([]);
  const pendingActions = useRef(new Set<string>());
  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (pendingActions.current.has(key)) return;
    pendingActions.current.add(key);
    setApiError('');
    let snapshot: Order[] = [];
    setOrders(current => { snapshot = current; return current; });
    try {
      await fn();
    } catch (e: any) {
      setApiError(e.message || 'Thao tác không thành công. Hệ thống đã khôi phục trạng thái.');
      setOrders(snapshot);
      const remainingPending = snapshot.filter(o => o.status === 'new' || o.status === 'accepted');
      if (remainingPending.length > 0) {
        sound.syncPendingAlert(remainingPending, { withVoice: isVoiceActive });
      }
    } finally {
      pendingActions.current.delete(key);
    }
  };
  useEffect(()=>{const onError=(e:Event)=>setApiError((e as CustomEvent<string>).detail);window.addEventListener('api-error',onError);return()=>window.removeEventListener('api-error',onError);},[]);
  // Orders State (Polling 3.5s)
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean>(false);
  const [isSoundActive, setIsSoundActive] = useState<boolean>(true);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(() => sound.isVoiceActive());
  const [soundVolume, setSoundVolume] = useState<number>(() => sound.getVolume());
  const [ringtoneStyle, setRingtoneStyle] = useState<RingtoneStyle>(() => sound.getRingtone());

  const handleToggleSound = () => {
    if (!isSoundActive) {
      sound.enableSound();
      setIsSoundActive(true);
      try { localStorage.setItem('admin_sound_active', 'true'); } catch {}
    } else {
      setIsSoundActive(false);
      sound.stopPendingAlert();
      try { localStorage.setItem('admin_sound_active', 'false'); } catch {}
    }
  };

  const handleToggleVoice = () => {
    const next = !isVoiceActive;
    setIsVoiceActive(next);
    sound.setVoiceEnabled(next);
  };

  const handleSetVolume = (vol: number) => {
    sound.setVolume(vol);
    setSoundVolume(vol);
  };

  const handleSetRingtone = (style: RingtoneStyle) => {
    sound.setRingtone(style);
    setRingtoneStyle(style);
  };

  // Quản lý chớp nháy tiêu đề tab khi có đơn mới mà tab đang chạy nền
  const titleFlashIntervalRef = useRef<any>(null);

  const startTitleFlash = useCallback((orderMsg: string) => {
    if (typeof document === 'undefined') return;
    clearInterval(titleFlashIntervalRef.current);
    let toggle = false;
    const original = 'Sân Cầu Lông Trần Lựu - Quản Trị';
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = toggle ? `🔔 ${orderMsg}` : original;
      toggle = !toggle;
    }, 1000);
  }, []);

  const stopTitleFlash = useCallback(() => {
    if (typeof document === 'undefined') return;
    clearInterval(titleFlashIntervalRef.current);
    document.title = 'Sân Cầu Lông Trần Lựu - Quản Trị';
  }, []);

  useEffect(() => {
    const handleFocus = () => stopTitleFlash();
    window.addEventListener('focus', handleFocus);
    const handleVis = () => {
      if (document.visibilityState === 'visible') stopTitleFlash();
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVis);
      clearInterval(titleFlashIntervalRef.current);
    };
  }, [stopTitleFlash]);

  // Tự động mở khóa Web Audio Context ngay khi nhân viên thao tác lần đầu (click/chạm/phím)
  useEffect(() => {
    const unlockAudio = () => {
      sound.enableSound();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Products State
  const [products, setProducts] = useState<Product[]>([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(10);
  const [stockAdjustmentType, setStockAdjustmentType] = useState<'intake' | 'set'>('intake');
  const [stockCostPrice, setStockCostPrice] = useState<number>(0);
  const [stockSellingPrice, setStockSellingPrice] = useState<number>(0);
  const [stockNote, setStockNote] = useState<string>('');
  const [productFormData, setProductFormData] = useState({
    name: '',
    volume: '500ml',
    category: 'water' as any,
    costPriceVnd: 8000,
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

  // History State (Enhanced)
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyCourtFilter, setHistoryCourtFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyTimePreset, setHistoryTimePreset] = useState<string>('today');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyTotalPages, setHistoryTotalPages] = useState<number>(1);
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historySummary, setHistorySummary] = useState<{ totalMatched: number; totalRevenueVnd: number; totalBottles: number }>({
    totalMatched: 0,
    totalRevenueVnd: 0,
    totalBottles: 0
  });

  // Quick Settings Header Popover & Navigation Dropdown State
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState<boolean>(false);
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const [activeNavDropdown, setActiveNavDropdown] = useState<'products' | 'reports' | 'system' | null>(null);
  const navDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickSettingsRef.current && !quickSettingsRef.current.contains(e.target as Node)) {
        setIsQuickSettingsOpen(false);
      }
      if (navDropdownRef.current && !navDropdownRef.current.contains(e.target as Node)) {
        setActiveNavDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // POS Order State (Tạo đơn tại quầy)
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState<boolean>(false);
  const [posCart, setPosCart] = useState<{ [productId: string]: { quantity: number; iceQuantity: number } }>({});
  const [isSubmittingPosOrder, setIsSubmittingPosOrder] = useState<boolean>(false);

  // Edit Court Modal State (Sửa tên sân)
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editCourtName, setEditCourtName] = useState<string>('');

  // Backup & Audit Logs State
  const [auditLogs, setAuditLogs] = useState<Array<{ auditId: string; adminUsername: string; action: string; targetId?: string; details: any; createdAt: string }>>([]);
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);
  const [auditLogsPage, setAuditLogsPage] = useState<number>(1);
  const [auditLogsTotalPages, setAuditLogsTotalPages] = useState<number>(1);
  const [auditLogsTotal, setAuditLogsTotal] = useState<number>(0);
  const [importStatusMessage, setImportStatusMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Safe Data Clean / Purge State (Ràng buộc tải sao lưu trước khi dọn)
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState<boolean>(() => {
    try { return sessionStorage.getItem('admin_backup_downloaded') === 'true'; } catch { return false; }
  });
  const [backupDownloadedTime, setBackupDownloadedTime] = useState<string>(() => {
    try { return sessionStorage.getItem('admin_backup_download_time') || ''; } catch { return ''; }
  });
  const [cleanDaysPreset, setCleanDaysPreset] = useState<string>('30');
  const [cleanStartDate, setCleanStartDate] = useState<string>('');
  const [cleanEndDate, setCleanEndDate] = useState<string>('');
  const [cleanIncludeOrders, setCleanIncludeOrders] = useState<boolean>(true);
  const [cleanIncludeInventory, setCleanIncludeInventory] = useState<boolean>(true);
  const [cleanIncludeAuditLogs, setCleanIncludeAuditLogs] = useState<boolean>(true);
  const [cleanPreview, setCleanPreview] = useState<{
    beforeDate?: string;
    rangeLabel?: string;
    ordersCount: number;
    inventoryCount: number;
    intakeCount?: number;
    auditLogsCount: number;
    activeOrdersPreserved: number;
  } | null>(null);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleanSuccessMessage, setCleanSuccessMessage] = useState<string>('');
  const [showCleanConfirmModal, setShowCleanConfirmModal] = useState<boolean>(false);

  // ================= FETCH DATA =================

  // 1. Fetch Active Orders
  const fetchActiveOrders = useCallback(async () => {
    const res = await apiFetch('/api/admin/orders/active');
    if (res.ok) {
      const data: Order[] = await res.json();
      setOrders(data);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timerId: any = null;
    let inFlight = false;
    let delay = 3500;

    const clearScheduledTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const poll = async () => {
      clearScheduledTimer();
      if (!isMounted) return;
      if (document.hidden) {
        void fetchActiveOrders();
        timerId = setTimeout(poll, 12000);
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        await fetchActiveOrders();
        delay = 3500;
      } catch {
        delay = Math.min(delay * 1.5, 20000);
      } finally {
        inFlight = false;
        if (isMounted && !document.hidden) {
          clearScheduledTimer();
          timerId = setTimeout(poll, delay);
        }
      }
    };

    void poll();

    const onWake = () => {
      if (!isMounted) return;
      if (!document.hidden && !inFlight) {
        clearScheduledTimer();
        delay = 3500;
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
  }, [fetchActiveOrders]);

  // 2. Fetch Products
  const fetchProducts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Yêu cầu quyền thông báo hệ điều hành (Web Notifications) khi tab quầy chạy nền
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ================= 1.1. WEBSOCKET REAL-TIME (< 50ms TỨC THÌ) =================
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'subscribe', role: 'admin' }));
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'order_created' && msg.data) {
              const newOrder: Order = msg.data;
              // Phát âm thanh chuông đôi và đọc tiếng Việt tức thì < 50ms
              sound.playOrderChime({ courtName: newOrder.courtName });
              startTitleFlash(`(MỚI) ĐƠN ${newOrder.courtName || 'SÂN'}!`);

              // Gửi Web Notification nếu tab đang chạy nền
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                  new Notification('🔔 ĐƠN GỌI NƯỚC MỚI!', {
                    body: `Có đơn gọi nước mới tại ${newOrder.courtName || 'sân'}!`,
                    icon: '/assets/icon.png',
                    tag: `order-${newOrder.id}`
                  });
                } catch {}
              }

              // Cập nhật ngay lập tức vào danh sách đơn
              setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
              void fetchActiveOrders();
            } else if (msg.type === 'order_updated' && msg.data) {
              const updatedOrder: Order = msg.data;
              setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
              void fetchActiveOrders();
            } else if (msg.type === 'stock_updated') {
              void fetchProducts();
            }
          } catch {}
        };
        ws.onclose = () => {
          if (isMounted) {
            reconnectTimer = setTimeout(connect, 3000);
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
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [fetchActiveOrders, fetchProducts]);

  // Tính số lượng mặt hàng sắp hết hoặc hết hàng
  const lowStockCount = useMemo(() => {
    return products.filter(p => p.isAvailable && p.stock <= (p.minStockThreshold ?? 5)).length;
  }, [products]);

  // 3. Fetch Courts
  const fetchCourts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/courts');
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
      const res = await apiFetch(`/api/admin/reports/summary?timeFilter=${reportTimeFilter}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [reportTimeFilter]);

  // 5. Fetch History (with page pagination)
  const fetchHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const q = new URLSearchParams({
        courtId: historyCourtFilter,
        status: historyStatusFilter,
        timePreset: historyTimePreset,
        page: String(historyPage),
        limit: '15'
      });
      if (historyTimePreset === 'custom') {
        if (historyStartDate) q.append('startDate', historyStartDate);
        if (historyEndDate) q.append('endDate', historyEndDate);
      }
      if (historySearchQuery.trim()) q.append('search', historySearchQuery.trim());
      const res = await apiFetch(`/api/admin/reports/history?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryOrders(data.orders || []);
        setHistoryCursor(data.nextCursor || null);
        setHistoryTotalPages(data.totalPages || 1);
        if (data.summary) {
          setHistorySummary({
            totalMatched: data.totalMatched || (data.orders ? data.orders.length : 0),
            totalRevenueVnd: data.summary.totalRevenueVnd || 0,
            totalBottles: data.summary.totalBottles || 0
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryBusy(false);
    }
  }, [historyCourtFilter, historyStatusFilter, historyTimePreset, historyStartDate, historyEndDate, historySearchQuery, historyPage]);

  const handleHistoryTimePresetChange = (preset: string) => {
    setHistoryTimePreset(preset);
    setHistoryPage(1);
    if (preset !== 'custom') {
      setHistoryStartDate('');
      setHistoryEndDate('');
    }
  };
  const handleHistoryCourtFilterChange = (courtId: string) => {
    setHistoryCourtFilter(courtId);
    setHistoryPage(1);
  };
  const handleHistoryStatusFilterChange = (status: string) => {
    setHistoryStatusFilter(status);
    setHistoryPage(1);
  };
  const handleHistorySearchQueryChange = (query: string) => {
    setHistorySearchQuery(query);
    setHistoryPage(1);
  };
  const handleHistoryStartDateChange = (date: string) => {
    setHistoryStartDate(date);
    setHistoryPage(1);
  };
  const handleHistoryEndDateChange = (date: string) => {
    setHistoryEndDate(date);
    setHistoryPage(1);
  };

  // 6. Fetch Audit Logs
  const fetchAuditLogs = useCallback(async (pageToFetch?: number) => {
    const p = typeof pageToFetch === 'number' ? pageToFetch : auditLogsPage;
    setIsAuditLogsLoading(true);
    try {
      const res = await apiFetch(`/api/admin/audit-logs?page=${p}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        setAuditLogsPage(data.page || p);
        setAuditLogsTotalPages(data.totalPages || 1);
        setAuditLogsTotal(data.total ?? (data.logs ? data.logs.length : 0));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditLogsLoading(false);
    }
  }, [auditLogsPage]);

  // 7. Fetch Clean Preview
  const fetchCleanPreview = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (cleanDaysPreset === 'custom') {
        if (cleanStartDate) q.append('startDate', cleanStartDate);
        if (cleanEndDate) q.append('endDate', cleanEndDate);
      } else {
        q.append('days', cleanDaysPreset);
      }
      const res = await apiFetch(`/api/admin/clean/preview?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCleanPreview(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [cleanDaysPreset, cleanStartDate, cleanEndDate]);



  const handleExportFullBackup = async () => {
    try {
      const res = await apiFetch('/api/admin/backup/full');
      if (!res.ok) throw new Error('Không thể xuất dữ liệu sao lưu toàn hệ thống');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tran_luu_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setHasDownloadedBackup(true);
      setBackupDownloadedTime(nowStr);
      try {
        sessionStorage.setItem('admin_backup_downloaded', 'true');
        sessionStorage.setItem('admin_backup_download_time', nowStr);
      } catch {}
    } catch (e) {
      alert('Lỗi xuất sao lưu toàn hệ thống: ' + (e as Error).message);
    }
  };

  const handleImportCatalog = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportStatusMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch('/api/admin/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi khôi phục');
      setImportStatusMessage(data.message ? `✅ ${data.message}` : `✅ Đã khôi phục thành công ${data.importedCount} sản phẩm!`);
      await fetchProducts();
      await fetchCourts();
      void fetchAuditLogs();
    } catch (err) {
      setImportStatusMessage(`❌ ${(err as Error).message}`);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

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
    if (currentTab === 'backup') {
      fetchAuditLogs();
      fetchCleanPreview();
    }
  }, [currentTab, fetchCourts, fetchHistory, fetchProducts, fetchReports, fetchAuditLogs, fetchCleanPreview]);

  // Chuông báo quầy & giọng đọc lặp lại liên tục khi có đơn chờ phục vụ
  // Hoạt động xuyên suốt mọi tab, lặp lại cho tới khi bấm "Đem ra sân" mới ngưng hoàn toàn
  useEffect(() => {
    if (!isSoundActive) {
      sound.stopPendingAlert();
      return;
    }

    const pendingOrders = orders.filter(o => o.status === 'new' || o.status === 'accepted');
    sound.syncPendingAlert(pendingOrders, { withVoice: isVoiceActive });
  }, [isSoundActive, isVoiceActive, orders]);

  // Ngắt chuông và giọng đọc khi đóng hoặc rời trang quản trị
  useEffect(() => {
    return () => {
      sound.stopPendingAlert();
    };
  }, []);

  // ================= ORDER ACTIONS =================
  const handlePrepareOrder = (orderId: string) => runAction(orderId, async () => {
    // Cập nhật lạc quan ngay lập tức để chuyển cột và ngắt chuông/giọng đọc nếu không còn đơn chờ
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, status: 'preparing' as const, preparingAt: Date.now() } : o);
      const remainingPending = updated.filter(o => o.status === 'new' || o.status === 'accepted');
      if (remainingPending.length === 0) {
        sound.stopPendingAlert();
      } else {
        sound.syncPendingAlert(remainingPending, { withVoice: isVoiceActive });
      }
      return updated;
    });
    await apiFetch('/api/admin/orders/' + orderId + '/transition', {
      method: 'POST',
      body: JSON.stringify({ targetStatus: 'preparing' })
    });
    await fetchActiveOrders();
  });

  const handleDeliverOrder = (orderId: string) => runAction(orderId, async () => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, status: 'delivered' as const, deliveredAt: Date.now() } : o);
      const remainingPending = updated.filter(o => o.status === 'new' || o.status === 'accepted');
      if (remainingPending.length === 0) {
        sound.stopPendingAlert();
      } else {
        sound.syncPendingAlert(remainingPending, { withVoice: isVoiceActive });
      }
      return updated;
    });
    await apiFetch('/api/admin/orders/' + orderId + '/transition', {
      method: 'POST',
      body: JSON.stringify({ targetStatus: 'delivered' })
    });
    await fetchActiveOrders();
  });

  const handleDeliverWithPayment = (orderId: string, paymentStatus: 'paid' | 'unpaid') => runAction(orderId, async () => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, status: 'delivered' as const, paymentStatus, deliveredAt: Date.now() } : o);
      const remainingPending = updated.filter(o => o.status === 'new' || o.status === 'accepted');
      if (remainingPending.length === 0) {
        sound.stopPendingAlert();
      } else {
        sound.syncPendingAlert(remainingPending, { withVoice: isVoiceActive });
      }
      return updated;
    });
    await apiFetch('/api/admin/orders/' + orderId + '/deliver-and-pay', {
      method: 'POST',
      body: JSON.stringify({ paymentStatus })
    });
    await fetchActiveOrders();
  });

  const handleCancelOrder = (orderId: string, reason: string) => runAction(orderId, async () => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' as const, cancelledAt: Date.now(), cancelReason: reason } : o);
      const remainingPending = updated.filter(o => o.status === 'new' || o.status === 'accepted');
      if (remainingPending.length === 0) {
        sound.stopPendingAlert();
      } else {
        sound.syncPendingAlert(remainingPending, { withVoice: isVoiceActive });
      }
      return updated;
    });
    await apiFetch('/api/admin/orders/' + orderId + '/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    await fetchActiveOrders();
    await fetchProducts();
  });

  const handleUpdatePayment = (orderId: string, paymentStatus: 'paid' | 'unpaid') => runAction(orderId, async () => {
    await apiFetch('/api/admin/orders/' + orderId + '/payment', {
      method: 'POST',
      body: JSON.stringify({ paymentStatus })
    });
    await fetchActiveOrders();
  });
  const refreshSettings=useCallback(async()=>{
    try {const data=await(await apiFetch('/api/admin/settings')).json();setIsAcceptingOrders(data.isAcceptingOrders);} catch { /* Error banner comes from apiFetch. */ }
  },[]);
  useEffect(()=>{void refreshSettings();const timer=setInterval(refreshSettings,10000);return()=>clearInterval(timer);},[refreshSettings]);
  useEffect(()=>{if(!stockModalProduct){setStockMovements([]);return;}let active=true;void apiFetch('/api/admin/products/'+stockModalProduct.id+'/movements').then(r=>r.json()).then(data=>{if(active)setStockMovements(data);}).catch(()=>{});return()=>{active=false;};},[stockModalProduct]);
  const handleToggleAcceptingOrders = () => runAction('settings',async()=>{
    const result=await(await apiFetch('/api/admin/settings',{method:'PATCH',body:JSON.stringify({isAcceptingOrders:!isAcceptingOrders})})).json();setIsAcceptingOrders(result.isAcceptingOrders);
  });
  const loadMoreHistory = async () => {
    if (!historyCursor || historyBusy) return;
    setHistoryBusy(true);
    try {
      const q = new URLSearchParams({
        courtId: historyCourtFilter,
        status: historyStatusFilter,
        timePreset: historyTimePreset,
        cursor: historyCursor
      });
      if (historyTimePreset === 'custom') {
        if (historyStartDate) q.append('startDate', historyStartDate);
        if (historyEndDate) q.append('endDate', historyEndDate);
      }
      if (historySearchQuery.trim()) q.append('search', historySearchQuery.trim());
      const res = await apiFetch(`/api/admin/reports/history?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryOrders(prev => [...prev, ...(data.orders || [])]);
        setHistoryCursor(data.nextCursor || null);
      }
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setHistoryBusy(false);
    }
  };

  const exportHistory = () => runAction('export', async () => {
    const all: Order[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({
        limit: '200',
        courtId: historyCourtFilter,
        status: historyStatusFilter,
        timePreset: historyTimePreset
      });
      if (historyTimePreset === 'custom') {
        if (historyStartDate) q.append('startDate', historyStartDate);
        if (historyEndDate) q.append('endDate', historyEndDate);
      }
      if (historySearchQuery.trim()) q.append('search', historySearchQuery.trim());
      if (cursor) q.append('cursor', cursor);

      const res = await apiFetch(`/api/admin/reports/history?${q.toString()}`);
      if (!res.ok) throw new Error('Không thể tải lịch sử đơn hàng để xuất Excel');
      const data = await res.json();
      all.push(...(data.orders || []));
      cursor = data.nextCursor || null;
    } while (cursor);

    if (all.length === 0) {
      alert('Không có đơn hàng nào khớp với bộ lọc hiện tại để xuất Excel!');
      return;
    }

    await exportOrdersToExcel(all, {
      totalRevenueVnd: historySummary.totalRevenueVnd,
      totalBottlesDelivered: historySummary.totalBottles,
      totalIceServed: all.filter(o => o.status === 'delivered').reduce((s, o) => s + o.items.reduce((sum, i) => sum + (i.iceQuantity || 0), 0), 0)
    });
  });

  const handlePurgeOldData = async () => {
    if (!hasDownloadedBackup) {
      alert('Ràng buộc an toàn: Bạn bắt buộc phải bấm nút tải bản sao lưu hệ thống về máy trước khi thực hiện dọn dẹp!');
      return;
    }
    setIsCleaning(true);
    setCleanSuccessMessage('');
    try {
      const res = await apiFetch('/api/admin/clean/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: cleanDaysPreset === 'custom' ? cleanStartDate : undefined,
          endDate: cleanDaysPreset === 'custom' ? cleanEndDate : undefined,
          beforeDate: cleanDaysPreset !== 'custom' && cleanDaysPreset !== 'all' ? cleanPreview?.beforeDate : undefined,
          days: cleanDaysPreset,
          includeOrders: cleanIncludeOrders,
          includeInventory: cleanIncludeInventory,
          includeAuditLogs: cleanIncludeAuditLogs
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi khi dọn dẹp');
      setShowCleanConfirmModal(false);
      const ordersDel = data.deletedOrders ?? data.cleaned?.ordersDeleted ?? 0;
      const invDel = data.deletedInventory ?? data.cleaned?.inventoryMovementsDeleted ?? 0;
      const intakeDel = data.deletedIntake ?? data.cleaned?.stockIntakeDeleted ?? 0;
      const logsDel = data.deletedAuditLogs ?? data.cleaned?.auditLogsDeleted ?? 0;
      const intakeMsg = intakeDel > 0 ? ` (gồm ${intakeDel} phiếu nhập hàng cũ)` : '';
      setCleanSuccessMessage(`🎉 Đã dọn dẹp thành công: Xoá ${ordersDel} đơn hàng cũ, ${invDel} biến động kho${intakeMsg}, ${logsDel} dòng nhật ký. Tồn kho và giá vốn hiện tại của các sản phẩm đang bán luôn được bảo toàn nguyên vẹn 100%!`);
      // Reset backup constraint so future cleans require fresh backup
      setHasDownloadedBackup(false);
      try { sessionStorage.removeItem('admin_backup_downloaded'); } catch {}
      await fetchCleanPreview();
      void fetchAuditLogs();
    } catch (e) {
      alert('Lỗi dọn dẹp: ' + (e as Error).message);
    } finally {
      setIsCleaning(false);
    }
  };
  // ================= PRODUCT ACTIONS =================
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormData.name || productFormData.priceVnd <= 0) {
      alert('Vui lòng điền tên và giá bán hợp lệ!');
      return;
    }

    try {
      if (editingProduct) {
        await apiFetch(`/api/admin/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({...productFormData, expectedStock: editingProduct.stock})
        });
      } else {
        await apiFetch('/api/admin/products', {
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
    await runAction('delete:'+productId,async()=>{await apiFetch(`/api/admin/products/${productId}`, { method: 'DELETE' });await fetchProducts();});
  };

  const handleStockUpdate = async () => {
    if (!stockModalProduct || pendingActions.current.has('stock')) return;
    pendingActions.current.add('stock');
    const stockPayload={productId:stockModalProduct.id,type:stockAdjustmentType,amount:stockDelta};
    const clientRequestId=stableRequestId('stock',stockPayload);
    try {
      if (stockAdjustmentType === 'intake') {
        await apiFetch(`/api/admin/products/${stockModalProduct.id}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientRequestId,
            delta: stockDelta,
            reason: 'stock_intake',
            costPriceVnd: stockCostPrice,
            sellingPriceVnd: stockSellingPrice,
            note: stockNote.trim() || undefined
          })
        });
      } else {
        await apiFetch(`/api/admin/products/${stockModalProduct.id}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientRequestId, setAbsoluteStock: stockDelta, expectedStock: stockModalProduct.stock })
        });
      }
      completeRequest('stock');
      setStockModalProduct(null);
      fetchProducts();
    } catch (e: any) {
      alert('Lỗi cập nhật kho: ' + e.message);
    } finally {pendingActions.current.delete('stock');}
  };


  // ================= COURT ACTIONS =================
  const handleToggleCourt = async (court: Court) => {
    try {
      sound.playActionClick();
      const res = await apiFetch(`/api/admin/courts/${court.id}`, { method: 'PATCH', body:JSON.stringify({isActive:!court.isActive}) });
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
      const res = await apiFetch(`/api/admin/courts/${editingCourt.id}`, {
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
      const res = await apiFetch('/api/admin/courts', {
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
      const res = await apiFetch(`/api/admin/courts/${courtId}`, { method: 'DELETE' });
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
    const dataUrl = await generateCourtQrPng(court.code, court.sig);
    setPreviewQrDataUrl(dataUrl);
    setPreviewQrCourt(court);
  };

  // ================= POS ORDER ACTION (TẠO ĐƠN TẠI QUẦY - THU TIỀN NGAY) =================
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

    if (pendingActions.current.has('pos')) return;
    pendingActions.current.add('pos');
    const clientRequestId = stableRequestId('pos', { items });
    setIsSubmittingPosOrder(true);
    try {
      sound.playActionClick();
      const res = await apiFetch('/api/admin/orders/create-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          items
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Lỗi tạo đơn');
        return;
      }

      completeRequest('pos');
      setPosCart({});
      setIsCreateOrderModalOpen(false);
      fetchActiveOrders();
      fetchProducts();
      sound.playOrderChime();
    } catch (err: any) {
      alert('Lỗi tạo đơn: ' + err.message);
    } finally {
      pendingActions.current.delete('pos');
      setIsSubmittingPosOrder(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)' }}>
      {apiError&&<div role="alert" style={{padding:12,background:'#fee2e2',color:'#991b1b'}}>{apiError}<button onClick={()=>setApiError('')} style={{marginLeft:12}}>Đóng</button></div>}
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
              <span>{courts.length} Sân thi đấu</span>
            </div>
          </div>
        </div>

        {/* Action controls: Nút Bánh Răng Cài Đặt Nhanh & Nút Đăng Xuất */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Quick Settings Gear Icon Button & Popover */}
          <div ref={quickSettingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setIsQuickSettingsOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isQuickSettingsOpen ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.12)',
                color: '#FFFFFF',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 800,
                letterSpacing: '0.3px',
                border: isQuickSettingsOpen ? '1px solid var(--color-primary-light)' : '1px solid rgba(255, 255, 255, 0.25)',
                cursor: 'pointer',
                boxShadow: isQuickSettingsOpen ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title="Cài đặt nhanh chuông & nhận đơn"
            >
              <span>CÀI ĐẶT QUẦY</span>
              {/* LED status indicator dot */}
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isAcceptingOrders ? '#22C55E' : '#EF4444',
                boxShadow: isAcceptingOrders ? '0 0 6px #22C55E' : '0 0 6px #EF4444'
              }} />
              <span style={{ fontSize: '10px', opacity: 0.8 }}>{isQuickSettingsOpen ? '▲' : '▾'}</span>
            </button>

            {/* Popover Menu */}
            {isQuickSettingsOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--color-border)',
                width: '310px',
                zIndex: 110,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                color: 'var(--color-text-main)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--color-deep)' }}>
                    Cài đặt vận hành nhanh
                  </div>
                  <button
                    onClick={() => setIsQuickSettingsOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--color-text-muted)' }}
                  >
                    ✕
                  </button>
                </div>

                {/* 1. Trạng thái nhận đơn */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>
                      Nhận đơn tại sân
                    </div>
                    <div style={{ fontSize: '11px', color: isAcceptingOrders ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                      {isAcceptingOrders ? '● Đang mở nhận đơn' : '● Tạm tắt nhận đơn'}
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAcceptingOrders}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isAcceptingOrders ? '#DC2626' : '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {isAcceptingOrders ? 'Tắt nhận' : 'Bật nhận'}
                  </button>
                </div>

                {/* 2. Âm thanh thông báo chuông quầy */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>
                      Chuông báo đơn mới
                    </div>
                    <div style={{ fontSize: '11px', color: isSoundActive ? '#16A34A' : 'var(--color-text-muted)', fontWeight: 600 }}>
                      {isSoundActive ? 'Đã bật chuông quầy' : 'Chuông đang tắt'}
                    </div>
                  </div>
                  <button
                    onClick={handleToggleSound}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isSoundActive ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: isSoundActive ? '#FFFFFF' : 'var(--color-deep)',
                      border: '1px solid var(--color-border)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isSoundActive ? 'Đang bật' : 'Bật chuông'}
                  </button>
                </div>

                {/* 3. Kiểu nhạc chuông báo đơn */}
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-deep)' }}>
                    Nhạc chuông báo đơn:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {[
                      { id: 'sound1', label: 'Sound 1' },
                      { id: 'sound2', label: 'Sound 2' },
                      { id: 'sound3', label: 'Sound 3' },
                      { id: 'sound4', label: 'Sound 4' },
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => {
                          handleSetRingtone(item.id as RingtoneStyle);
                          sound.enableSound();
                          sound.playOrderChime({ style: item.id as RingtoneStyle, withVoice: false });
                        }}
                        style={{
                          padding: '6px 4px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: ringtoneStyle === item.id ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: ringtoneStyle === item.id ? '#FFFFFF' : 'var(--color-deep)',
                          border: '1px solid var(--color-border)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Mức âm lượng chuông */}
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-deep)' }}>
                    Âm lượng chuông:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    {[
                      { label: '100% Lớn', value: 1.0 },
                      { label: '80% Vừa', value: 0.8 },
                      { label: '50% Nhẹ', value: 0.5 }
                    ].map(lvl => (
                      <button
                        key={lvl.value}
                        onClick={() => handleSetVolume(lvl.value)}
                        style={{
                          padding: '5px 4px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: Math.abs(soundVolume - lvl.value) < 0.05 ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: Math.abs(soundVolume - lvl.value) < 0.05 ? '#FFFFFF' : 'var(--color-deep)',
                          border: '1px solid var(--color-border)',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Đọc loa thông báo giọng nói */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-deep)' }}>
                      Đọc loa thông báo
                    </div>
                    <div style={{ fontSize: '11px', color: isVoiceActive ? '#16A34A' : 'var(--color-text-muted)', fontWeight: 600 }}>
                      {isVoiceActive ? 'Đang bật đọc tiếng Việt' : 'Đang tắt giọng nói'}
                    </div>
                  </div>
                  <button
                    onClick={handleToggleVoice}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isVoiceActive ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: isVoiceActive ? '#FFFFFF' : 'var(--color-deep)',
                      border: '1px solid var(--color-border)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isVoiceActive ? 'Đang bật' : 'Bật đọc'}
                  </button>
                </div>

                {/* 6. Phát thử âm thanh */}
                <button
                  onClick={() => {
                    sound.enableSound();
                    sound.playOrderChime({
                      withVoice: isVoiceActive,
                      courtId: '05'
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <span>Phát thử chuông & giọng đọc</span>
                </button>

                {/* Vạch phân cách */}
                <div style={{ height: '1px', backgroundColor: 'var(--color-border)', margin: '2px 0' }} />

                {/* 4. Đăng xuất tích hợp vào Cài đặt quầy */}
                <button
                  onClick={() => void runAction('logout', async () => {
                    await apiFetch('/api/admin/auth/logout', { method: 'POST', body: '{}' });
                    window.dispatchEvent(new Event('admin-session-expired'));
                  })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#DC2626',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>Đăng xuất tài khoản</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* THANH ĐIỀU HƯỚNG DROPDOWN CĂN CHỈNH ĐỀU ĐẸP */}
      <nav ref={navDropdownRef} style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'stretch',
        height: '52px',
        gap: '8px',
        position: 'relative',
        zIndex: 50
      }}>
        {/* 1. Quầy điều hành (Tab độc lập) */}
        <button
          onClick={() => {
            setCurrentTab('orders');
            setActiveNavDropdown(null);
          }}
          style={{
            height: '100%',
            padding: '0 18px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 800,
            letterSpacing: '0.4px',
            color: currentTab === 'orders' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: 'none',
            borderBottom: currentTab === 'orders' ? '3px solid var(--color-primary)' : '3px solid transparent',
            marginBottom: '-1px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
        >
          <span>QUẦY ĐIỀU HÀNH</span>
          {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length > 0 && (
            <span style={{
              backgroundColor: currentTab === 'orders' ? 'var(--color-primary)' : '#DC2626',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 800,
              padding: '1px 7px',
              borderRadius: 'var(--radius-full)'
            }}>
              {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length}
            </span>
          )}
        </button>

        {/* 2. Sản phẩm & QR (Dropdown) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => setActiveNavDropdown(prev => prev === 'products' ? null : 'products')}
            style={{
              height: '100%',
              padding: '0 18px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              color: (currentTab === 'products' || currentTab === 'courts') ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              borderBottom: (currentTab === 'products' || currentTab === 'courts') ? '3px solid var(--color-primary)' : '3px solid transparent',
              marginBottom: '-1px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            <span>SẢN PHẨM & QR</span>
            {lowStockCount > 0 && (
              <span style={{
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '10px',
                marginLeft: '4px'
              }}>
                {lowStockCount}
              </span>
            )}
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{
                marginLeft: '2px',
                transition: 'transform 0.2s ease',
                transform: activeNavDropdown === 'products' ? 'rotate(180deg)' : 'none',
                opacity: (currentTab === 'products' || currentTab === 'courts') ? 1 : 0.6
              }}
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {activeNavDropdown === 'products' && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              backgroundColor: 'var(--color-surface)',
              borderRadius: '0 0 var(--radius-md) var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              border: '1px solid var(--color-border)',
              borderTop: 'none',
              minWidth: '220px',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              <button
                onClick={() => { setCurrentTab('products'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: 'none',
                  backgroundColor: currentTab === 'products' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'products' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span>Sản phẩm & Tồn kho</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{products.length} món</span>
              </button>
              <button
                onClick={() => { setCurrentTab('courts'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: 'none',
                  backgroundColor: currentTab === 'courts' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'courts' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderTop: '1px solid var(--color-border)'
                }}
              >
                <span>Sân thi đấu & Mã QR</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{courts.length} sân</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Thống kê & Lịch sử doanh thu (Dropdown) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => setActiveNavDropdown(prev => prev === 'reports' ? null : 'reports')}
            style={{
              height: '100%',
              padding: '0 18px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              color: (currentTab === 'reports' || currentTab === 'history' || currentTab === 'stock-history') ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              borderBottom: (currentTab === 'reports' || currentTab === 'history' || currentTab === 'stock-history') ? '3px solid var(--color-primary)' : '3px solid transparent',
              marginBottom: '-1px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            <span>THỐNG KÊ & LỊCH SỬ</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{
                marginLeft: '2px',
                transition: 'transform 0.2s ease',
                transform: activeNavDropdown === 'reports' ? 'rotate(180deg)' : 'none',
                opacity: (currentTab === 'reports' || currentTab === 'history' || currentTab === 'stock-history') ? 1 : 0.6
              }}
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {activeNavDropdown === 'reports' && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              backgroundColor: 'var(--color-surface)',
              borderRadius: '0 0 var(--radius-md) var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              border: '1px solid var(--color-border)',
              borderTop: 'none',
              minWidth: '230px',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              <button
                onClick={() => { setCurrentTab('reports'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  backgroundColor: currentTab === 'reports' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'reports' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span>Báo cáo doanh thu</span>
              </button>
              <button
                onClick={() => { setCurrentTab('history'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  backgroundColor: currentTab === 'history' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'history' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderTop: '1px solid var(--color-border)'
                }}
              >
                <span>Lịch sử đơn hàng</span>
              </button>
              <button
                onClick={() => { setCurrentTab('stock-history'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  backgroundColor: currentTab === 'stock-history' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'stock-history' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderTop: '1px solid var(--color-border)'
                }}
              >
                <span>Lịch sử nhập hàng</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Cài đặt & Dữ liệu (Dropdown) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => setActiveNavDropdown(prev => prev === 'system' ? null : 'system')}
            style={{
              height: '100%',
              padding: '0 18px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              color: (currentTab === 'backup' || currentTab === 'settings') ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              borderBottom: (currentTab === 'backup' || currentTab === 'settings') ? '3px solid var(--color-primary)' : '3px solid transparent',
              marginBottom: '-1px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            <span>CÀI ĐẶT</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{
                marginLeft: '2px',
                transition: 'transform 0.2s ease',
                transform: activeNavDropdown === 'system' ? 'rotate(180deg)' : 'none',
                opacity: (currentTab === 'backup' || currentTab === 'settings') ? 1 : 0.6
              }}
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {activeNavDropdown === 'system' && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              backgroundColor: 'var(--color-surface)',
              borderRadius: '0 0 var(--radius-md) var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              border: '1px solid var(--color-border)',
              borderTop: 'none',
              minWidth: '220px',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              <button
                onClick={() => { setCurrentTab('backup'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  backgroundColor: currentTab === 'backup' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'backup' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span>Sao lưu & Dữ liệu</span>
              </button>
              <button
                onClick={() => { setCurrentTab('settings'); setActiveNavDropdown(null); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                  backgroundColor: currentTab === 'settings' ? 'var(--color-primary-light)' : 'transparent',
                  color: currentTab === 'settings' ? 'var(--color-primary)' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderTop: '1px solid var(--color-border)'
                }}
              >
                <span>Cài đặt hệ thống</span>
              </button>
            </div>
          )}
        </div>
      </nav>


      {/* BODY CONTENT NỘI DUNG TỪNG TAB */}
      <div style={{ flex: 1 }}>
        <React.Suspense fallback={<div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Đang tải giao diện...</div>}>

        {/* TAB 1: QUẦY ĐIỀU HÀNH */}
        {currentTab === 'orders' && (
          <AdminOrdersView
            orders={orders}
            onPrepareOrder={handlePrepareOrder}
            onDeliverOrder={handleDeliverOrder}
            onDeliverWithPayment={handleDeliverWithPayment}
            onCancelOrder={handleCancelOrder}
            onUpdatePayment={handleUpdatePayment}
            onOpenCreateOrderModal={() => {
              setPosCart({});
              if (products.length === 0) fetchProducts();
              setIsCreateOrderModalOpen(true);
            }}
          />
        )}

        {/* TAB 2: SẢN PHẨM & TỒN KHO */}
        {currentTab === 'products' && (
          <ProductsTab
            products={products}
            onOpenAddModal={() => {
              setEditingProduct(null);
              setProductFormData({ name: '', volume: '500ml', category: 'water', costPriceVnd: 8000, priceVnd: 15000, stock: 20, tag: '', imageSvg: '' });
              setIsProductModalOpen(true);
            }}
            onOpenEditModal={(p) => {
              setEditingProduct(p);
              setProductFormData({
                name: p.name,
                volume: p.volume,
                category: p.category,
                costPriceVnd: p.costPriceVnd ?? 0,
                priceVnd: p.priceVnd,
                stock: p.stock,
                tag: p.tag || '',
                imageSvg: p.imageSvg || ''
              });
              setIsProductModalOpen(true);
            }}
            onOpenStockModal={(p) => {
              setStockModalProduct(p);
              setStockDelta(10);
              setStockAdjustmentType('intake');
              setStockCostPrice(p.costPriceVnd ?? 0);
              setStockSellingPrice(p.priceVnd);
              setStockNote('');
            }}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {/* TAB 3: SÂN ĐẤU & BỘ TẠO MÃ QR */}
        {currentTab === 'courts' && (
          <CourtsTab
            courts={courts}
            onDownloadAllCourtsPdf={() => downloadAllCourtsPdf(courts)}
            onOpenAddCourtModal={() => {
              const nextNum = (courts.length + 1).toString().padStart(2, '0');
              setCourtFormCode(nextNum);
              setCourtFormName(`Sân ${nextNum}`);
              setIsCourtModalOpen(true);
            }}
            onToggleCourt={handleToggleCourt}
            onOpenQrPreview={handleOpenQrPreview}
            onDownloadCourtQrPng={downloadCourtQrPng}
            onOpenEditCourtModal={(court) => {
              setEditingCourt(court);
              setEditCourtName(court.name);
            }}
            onDeleteCourt={handleDeleteCourt}
          />
        )}

        {/* TAB 4: BÁO CÁO DOANH THU & THỐNG KÊ */}
        {currentTab === 'reports' && (
          <ReportsTab
            reportData={reportData}
            reportTimeFilter={reportTimeFilter}
            onSelectTimeFilter={setReportTimeFilter}
          />
        )}

        {/* TAB 5: LỊCH SỬ ĐƠN & XUẤT EXCEL */}
        {currentTab === 'history' && (
          <HistoryTab
            historyOrders={historyOrders}
            historySummary={historySummary}
            historyCourtFilter={historyCourtFilter}
            historyStatusFilter={historyStatusFilter}
            historyTimePreset={historyTimePreset}
            historyStartDate={historyStartDate}
            historyEndDate={historyEndDate}
            historySearchQuery={historySearchQuery}
            historyCursor={historyCursor}
            historyBusy={historyBusy}
            page={historyPage}
            totalPages={historyTotalPages}
            onPageChange={(p) => setHistoryPage(p)}
            courts={courts}
            onExportHistory={exportHistory}
            onLoadMore={() => void loadMoreHistory()}
            setHistoryCourtFilter={handleHistoryCourtFilterChange}
            setHistoryStatusFilter={handleHistoryStatusFilterChange}
            setHistoryTimePreset={handleHistoryTimePresetChange}
            setHistoryStartDate={handleHistoryStartDateChange}
            setHistoryEndDate={handleHistoryEndDateChange}
            setHistorySearchQuery={handleHistorySearchQueryChange}
          />
        )}

        {/* TAB 5B: LỊCH SỬ NHẬP HÀNG & GIÁ VỐN */}
        {currentTab === 'stock-history' && (
          <StockIntakeTab
            products={products}
          />
        )}

        {/* TAB 6: SAO LƯU & NHẬT KÝ KIỂM TOÁN */}
        {currentTab === 'backup' && (
          <BackupTab
            hasDownloadedBackup={hasDownloadedBackup}
            backupDownloadedTime={backupDownloadedTime}
            onExportFullBackup={handleExportFullBackup}
            onImportCatalog={handleImportCatalog}
            isImporting={isImporting}
            importStatusMessage={importStatusMessage}
            cleanDaysPreset={cleanDaysPreset}
            setCleanDaysPreset={setCleanDaysPreset}
            cleanStartDate={cleanStartDate}
            setCleanStartDate={setCleanStartDate}
            cleanEndDate={cleanEndDate}
            setCleanEndDate={setCleanEndDate}
            cleanIncludeOrders={cleanIncludeOrders}
            setCleanIncludeOrders={setCleanIncludeOrders}
            cleanIncludeInventory={cleanIncludeInventory}
            setCleanIncludeInventory={setCleanIncludeInventory}
            cleanIncludeAuditLogs={cleanIncludeAuditLogs}
            setCleanIncludeAuditLogs={setCleanIncludeAuditLogs}
            cleanPreview={cleanPreview}
            cleanSuccessMessage={cleanSuccessMessage}
            isCleaning={isCleaning}
            onOpenCleanConfirmModal={() => setShowCleanConfirmModal(true)}
            auditLogs={auditLogs}
            isAuditLogsLoading={isAuditLogsLoading}
            fetchAuditLogs={() => void fetchAuditLogs(1)}
            auditLogsPage={auditLogsPage}
            auditLogsTotalPages={auditLogsTotalPages}
            auditLogsTotal={auditLogsTotal}
            onAuditLogsPageChange={(newPage) => {
              setAuditLogsPage(newPage);
              void fetchAuditLogs(newPage);
            }}
          />
        )}

        {/* TAB 7: CÀI ĐẶT HỆ THỐNG */}
        {currentTab === 'settings' && (
          <SettingsTab
            isAcceptingOrders={isAcceptingOrders}
            onToggleAcceptingOrders={handleToggleAcceptingOrders}
            isSoundActive={isSoundActive}
            onToggleSound={handleToggleSound}
            isVoiceActive={isVoiceActive}
            onToggleVoice={handleToggleVoice}
            soundVolume={soundVolume}
            onSetVolume={handleSetVolume}
            ringtoneStyle={ringtoneStyle}
            onSetRingtone={handleSetRingtone}
          />
        )}
        </React.Suspense>
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
              </div>

              {/* Giá nhập hàng & Giá bán ra */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px', color: '#B45309' }}>
                    Giá nhập hàng (VNĐ) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    value={productFormData.costPriceVnd || 0}
                    onChange={e => setProductFormData({ ...productFormData, costPriceVnd: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #FCD34D', fontSize: 'var(--font-size-sm)', backgroundColor: '#FFFBEB' }}
                    placeholder="VD: 7000"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-primary)' }}>
                    Giá bán ra (VNĐ) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    value={productFormData.priceVnd}
                    onChange={e => setProductFormData({ ...productFormData, priceVnd: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-primary)', fontSize: 'var(--font-size-sm)', backgroundColor: 'var(--color-primary-light)' }}
                    placeholder="VD: 15000"
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
                        if (file.type === 'image/svg+xml') {
                          const reader = new FileReader();
                          reader.onload = (loadEvt) => {
                            setProductFormData(prev => ({ ...prev, imageSvg: loadEvt.target?.result as string }));
                          };
                          reader.readAsDataURL(file);
                        } else {
                          compressImage(file, 400, 400, 0.82)
                            .then(dataUrl => {
                              setProductFormData(prev => ({ ...prev, imageSvg: dataUrl }));
                            })
                            .catch(err => {
                              alert('Không thể nén ảnh: ' + (err as Error).message);
                            });
                        }
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
                          if (file.type === 'image/svg+xml') {
                            const reader = new FileReader();
                            reader.onload = (loadEvt) => {
                              setProductFormData(prev => ({ ...prev, imageSvg: loadEvt.target?.result as string }));
                            };
                            reader.readAsDataURL(file);
                          } else {
                            compressImage(file, 400, 400, 0.82)
                              .then(dataUrl => {
                                setProductFormData(prev => ({ ...prev, imageSvg: dataUrl }));
                              })
                              .catch(err => {
                                alert('Không thể nén ảnh: ' + (err as Error).message);
                              });
                          }
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  {stockAdjustmentType === 'intake' ? 'Số chai nhập thêm:' : 'Số chai thực tế trong kho:'}
                </label>
                <input
                  type="number"
                  value={stockDelta}
                  onChange={e => setStockDelta(parseInt(e.target.value, 10) || 0)}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-base)', fontWeight: 800 }}
                />
              </div>

              {stockAdjustmentType === 'intake' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                        Giá vào / vốn (đ/chai):
                      </label>
                      <input
                        type="number"
                        step="500"
                        value={stockCostPrice}
                        onChange={e => setStockCostPrice(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                        Giá bán ra (đ/chai):
                      </label>
                      <input
                        type="number"
                        step="500"
                        value={stockSellingPrice}
                        onChange={e => setStockSellingPrice(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                      Ghi chú lô nhập:
                    </label>
                    <input
                      type="text"
                      value={stockNote}
                      onChange={e => setStockNote(e.target.value)}
                      placeholder="VD: Nhập đại lý nước ngọt, đợt cuối tuần..."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
                    />
                  </div>

                  {/* Tính nhanh tài chính lô nhập */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #E2E8F0',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tổng vốn lô nhập:</span>
                      <strong style={{ color: 'var(--color-deep)' }}>{formatVnd(stockCostPrice * stockDelta)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Doanh thu kỳ vọng:</span>
                      <strong style={{ color: 'var(--color-primary)' }}>{formatVnd(stockSellingPrice * stockDelta)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #CBD5E1', paddingTop: '4px', marginTop: '2px' }}>
                      <span style={{ color: '#15803D', fontWeight: 700 }}>Lãi dự kiến:</span>
                      <strong style={{ color: '#15803D' }}>
                        +{formatVnd((stockSellingPrice - stockCostPrice) * stockDelta)}
                        {stockSellingPrice > 0 ? ` (${Math.round((((stockSellingPrice - stockCostPrice) / stockSellingPrice) * 100) * 10) / 10}%)` : ''}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                      <span>Tồn sau khi nhập:</span>
                      <span>{stockModalProduct.stock} + {stockDelta} = <strong>{stockModalProduct.stock + stockDelta} chai</strong></span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <details style={{marginTop:12}}><summary>Lịch sử biến động kho (100 lần gần nhất)</summary><div style={{maxHeight:160,overflow:'auto'}}>{stockMovements.map(m=><p key={m.operationId}>{new Date(m.createdAt).toLocaleString('vi-VN')} · {m.delta>0?'+':''}{m.delta} chai · còn {m.stockAfter}</p>)}</div></details>
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

      {/* MODAL: TẠO ĐƠN TẠI QUẦY (POS) */}
      {isCreateOrderModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
          zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{ backgroundColor: 'var(--color-surface)', width: '100%', maxWidth: '540px', maxHeight: '90vh', borderRadius: 'var(--radius-xl)', padding: '24px', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-deep)', margin: 0, letterSpacing: '0.3px' }}>
                  TẠO ĐƠN TẠI QUẦY
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                  Khách mua và thu tiền ngay tại quầy. Đơn hàng hoàn tất tức thì.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOrderModalOpen(false)}
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-bg)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                ✕
              </button>
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
                          <span>Đá:</span>
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
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>TỔNG TIỀN:</div>
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
                  style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', fontWeight: 700, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmitPosOrder}
                  disabled={isSubmittingPosOrder}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: 'var(--font-size-sm)',
                    letterSpacing: '0.4px',
                    border: 'none',
                    cursor: isSubmittingPosOrder ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmittingPosOrder ? 'Đang tạo...' : 'TẠO ĐƠN'}
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

      {/* MODAL: XÁC NHẬN DỌN DẸP DỮ LIỆU AN TOÀN */}
      {showCleanConfirmModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--color-surface)',
            width: '100%', maxWidth: '480px',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            border: '1px solid #FECACA',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                  Xác Nhận Dọn Dẹp Dữ Liệu Cũ
                </h3>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Hành động này sẽ giải phóng dữ liệu cũ khỏi cơ sở dữ liệu MongoDB
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 'var(--radius-md)', padding: '14px', fontSize: 'var(--font-size-xs)', color: '#991B1B', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                Bạn có chắc chắn muốn dọn dẹp các bản ghi cũ ({cleanPreview?.rangeLabel || (cleanPreview?.beforeDate ? `Trước ngày ${new Date(cleanPreview.beforeDate).toLocaleDateString('vi-VN')}` : '')})?
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px' }}>
                {cleanIncludeOrders && <li>Lịch sử đơn hàng cũ: <strong>{cleanPreview?.ordersCount ?? 0} đơn đã xong</strong></li>}
                {cleanIncludeAuditLogs && <li>Nhật ký thao tác (Audit Logs): <strong>{cleanPreview?.auditLogsCount ?? 0} dòng</strong></li>}
                {cleanIncludeInventory && (
                  <li>
                    Biến động kho & Lịch sử nhập hàng cũ: <strong>{cleanPreview?.inventoryCount ?? 0} bản ghi</strong>
                    {cleanPreview?.intakeCount ? <span style={{ color: '#D97706', fontWeight: 600 }}> (gồm {cleanPreview.intakeCount} phiếu nhập kho)</span> : ''}
                  </li>
                )}
              </ul>
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #FCA5A5', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontWeight: 700, color: '#166534' }}>
                  ✅ Đã thỏa mãn ràng buộc: Bản sao lưu hệ thống đã được tải về máy lúc {backupDownloadedTime}.
                </span>
                <span style={{ fontWeight: 600, color: '#166534' }}>
                  🛡️ Toàn bộ các phần KHÔNG TÍCH, số lượng tồn kho và giá vốn của sản phẩm đang bán luôn được bảo toàn 100%. Đơn hàng đang phục vụ tại sân cũng được giữ nguyên vẹn.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                disabled={isCleaning}
                onClick={() => setShowCleanConfirmModal(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer'
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isCleaning}
                onClick={handlePurgeOldData}
                style={{
                  padding: '10px 22px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: 'var(--font-size-sm)',
                  border: 'none',
                  cursor: isCleaning ? 'wait' : 'pointer',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)'
                }}
              >
                {isCleaning ? '⏳ Đang dọn dẹp...' : '🗑️ Xác nhận dọn dẹp ngay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
