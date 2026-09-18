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
import { TemporaryCredentialsModal } from '../../components/TemporaryCredentialsModal';
import { ForceChangePasswordModal } from '../../components/ForceChangePasswordModal';

const DrinkIntakeTab = React.lazy(() => import('./tabs/DrinkIntakeTab').then(m => ({ default: m.DrinkIntakeTab })));
const SportsIntakeTab = React.lazy(() => import('./tabs/SportsIntakeTab').then(m => ({ default: m.SportsIntakeTab })));
const CourtsTab = React.lazy(() => import('./tabs/CourtsTab').then(m => ({ default: m.CourtsTab })));
const ReportsTab = React.lazy(() => import('./tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const HistoryTab = React.lazy(() => import('./tabs/HistoryTab').then(m => ({ default: m.HistoryTab })));
const StockIntakeTab = React.lazy(() => import('./tabs/StockIntakeTab').then(m => ({ default: m.StockIntakeTab })));
const SportsPosTab = React.lazy(() => import('./tabs/SportsPosTab').then(m => ({ default: m.SportsPosTab })));
const SportsIntakeHistoryTab = React.lazy(() => import('./tabs/SportsIntakeHistoryTab').then(m => ({ default: m.SportsIntakeHistoryTab })));
const SportsOrderHistoryTab = React.lazy(() => import('./tabs/SportsOrderHistoryTab').then(m => ({ default: m.SportsOrderHistoryTab })));
const BackupTab = React.lazy(() => import('./tabs/BackupTab').then(m => ({ default: m.BackupTab })));
const RbacUsersTab = React.lazy(() => import('./tabs/RbacUsersTab').then(m => ({ default: m.RbacUsersTab })));

type AdminTab =
  | 'orders'
  | 'sports-pos'
  | 'drink-intake'
  | 'sports-intake'
  | 'products'
  | 'sports-catalog'
  | 'courts'
  | 'reports'
  | 'history'
  | 'sports-order-history'
  | 'stock-history'
  | 'sports-stock-history'
  | 'backup'
  | 'rbac'
  | 'settings';

export interface AdminPortalProps {
  onLogout?: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onLogout }) => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('orders');

  const [apiError, setApiError] = useState('');
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [stockMovements, setStockMovements] = useState<Array<{ operationId: string; delta: number; stockAfter: number; createdAt: string; reason: string }>>([]);
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
  useEffect(() => { const onError = (e: Event) => setApiError((e as CustomEvent<string>).detail); window.addEventListener('api-error', onError); return () => window.removeEventListener('api-error', onError); }, []);
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
      try { localStorage.setItem('admin_sound_active', 'true'); } catch { }
    } else {
      setIsSoundActive(false);
      sound.stopPendingAlert();
      try { localStorage.setItem('admin_sound_active', 'false'); } catch { }
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

  // Thông tin tài khoản & quyền hạn đăng nhập (RBAC)
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ username: string; fullName: string; roleName: string; roleId: string } | null>(null);
  const [temporaryCredentials, setTemporaryCredentials] = useState<Array<{ username: string; tempPassword: string }> | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const refreshUserSession = useCallback(() => {
    apiFetch('/api/admin/auth/session')
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.permissions)) {
          setUserPermissions(data.permissions);
          setCurrentUserInfo({
            username: data.username,
            fullName: data.fullName,
            roleName: data.roleName,
            roleId: data.roleId
          });
          setMustChangePassword(Boolean(data.mustChangePassword));
          if (data.roleId !== 'admin' && data.username !== 'admin') {
            const perms: string[] = data.permissions;
            const tabPermMap: Record<string, string> = {
              'orders': 'orders',
              'sports-pos': 'sports-pos',
              'drink-intake': 'drink-intake',
              'sports-intake': 'sports-intake',
              'courts': 'courts',
              'reports': 'revenue-report',
              'history': 'order-history',
              'sports-order-history': 'sports-order-history',
              'stock-history': 'intake-history',
              'sports-stock-history': 'sports-intake',
              'backup': 'backup',
              'rbac': 'rbac',
              'settings': 'rbac'
            };
            if (!perms.includes(tabPermMap[currentTab] || '')) {
              const fallbackTabs: AdminTab[] = ['orders', 'sports-pos', 'drink-intake', 'sports-intake', 'courts', 'reports', 'history', 'sports-order-history', 'stock-history', 'backup', 'rbac'];
              const allowed = fallbackTabs.find(t => perms.includes(tabPermMap[t] || ''));
              if (allowed) {
                setCurrentTab(allowed);
              }
            }
          }
        }
      })
      .catch(() => { });
  }, [currentTab]);

  useEffect(() => {
    refreshUserSession();
  }, [refreshUserSession]);

  useEffect(() => {
    const handlePasswordChangeRequired = () => {
      setMustChangePassword(true);
    };
    window.addEventListener('password-change-required', handlePasswordChangeRequired);
    return () => {
      window.removeEventListener('password-change-required', handlePasswordChangeRequired);
    };
  }, []);

  const hasPermission = useCallback((perm: string) => {
    if (!currentUserInfo) return false;
    if (currentUserInfo.roleId === 'admin' || currentUserInfo.username === 'admin') return true;
    return userPermissions.includes(perm);
  }, [currentUserInfo, userPermissions]);

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
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>('all');
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
  const [historySummary, setHistorySummary] = useState<{
    totalMatched: number;
    totalRevenueVnd: number;
    totalCostVnd: number;
    totalProfitVnd: number;
    totalBottles: number;
  }>({
    totalMatched: 0,
    totalRevenueVnd: 0,
    totalCostVnd: 0,
    totalProfitVnd: 0,
    totalBottles: 0
  });

  // Quick Settings Header Popover & Navigation Dropdown State
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState<boolean>(false);
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const [activeNavDropdown, setActiveNavDropdown] = useState<'products' | 'intake-history' | 'export-history' | 'system' | null>(null);
  const navDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside or Escape to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (quickSettingsRef.current && !quickSettingsRef.current.contains(e.target as Node)) {
        setIsQuickSettingsOpen(false);
      }
      if (target && !target.closest('[data-dropdown-container="true"]')) {
        setActiveNavDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveNavDropdown(null);
        setIsQuickSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // POS Order State (Tạo đơn tại quầy)
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState<boolean>(false);
  const [posOrderStep, setPosOrderStep] = useState<1 | 2>(1);
  const [posCart, setPosCart] = useState<{ [productId: string]: { quantity: number; iceQuantity: number } }>({});
  const [posCourtId, setPosCourtId] = useState<string>('counter');
  const [posSearchQuery, setPosSearchQuery] = useState<string>('');
  const [posCategoryFilter, setPosCategoryFilter] = useState<string>('all');
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
    if (!hasPermission('orders')) return;
    try {
      const res = await apiFetch('/api/admin/orders/active');
      if (res.ok) {
        const data: Order[] = await res.json();
        setOrders(data);
      }
    } catch {
      // Ignored - will retry on next poll cycle
    }
  }, [hasPermission]);

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
      if (!isMounted || !hasPermission('orders')) return;
      if (inFlight) return;
      inFlight = true;
      try {
        await fetchActiveOrders();
        delay = 3500;
      } catch {
        delay = Math.min(delay * 1.5, 20000);
      } finally {
        inFlight = false;
        if (isMounted) {
          clearScheduledTimer();
          const nextDelay = document.hidden ? 12000 : delay;
          timerId = setTimeout(poll, nextDelay);
        }
      }
    };

    if (hasPermission('orders')) {
      void poll();
    }

    const onWake = () => {
      if (!isMounted || !hasPermission('orders')) return;
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
  }, [fetchActiveOrders, hasPermission]);

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
      Notification.requestPermission().catch(() => { });
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
                } catch { }
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
          } catch { }
        };
        ws.onclose = () => {
          if (isMounted) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch { }
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
      const res = await apiFetch(`/api/admin/reports/summary?timeFilter=${reportTimeFilter}&categoryFilter=${reportCategoryFilter}`);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [reportTimeFilter, reportCategoryFilter]);

  // 5. Fetch History (with page pagination)
  const fetchHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const q = new URLSearchParams({
        orderType: 'drinks',
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
            totalCostVnd: data.summary.totalCostVnd || 0,
            totalProfitVnd: data.summary.totalProfitVnd !== undefined
              ? data.summary.totalProfitVnd
              : Math.max(0, (data.summary.totalRevenueVnd || 0) - (data.summary.totalCostVnd || 0)),
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
      } catch { }
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
      if (Array.isArray(data.temporaryCredentials) && data.temporaryCredentials.length > 0) {
        setTemporaryCredentials(data.temporaryCredentials);
      }
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

  const handleDeliverWithPayment = (orderId: string, paymentStatus: 'paid' | 'unpaid', paymentMethod?: 'cash' | 'transfer') => runAction(orderId, async () => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? {
        ...o,
        status: 'delivered' as const,
        paymentStatus,
        paymentMethod: paymentStatus === 'paid' ? (paymentMethod || 'cash') : null,
        deliveredAt: Date.now()
      } : o);
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
      body: JSON.stringify({ paymentStatus, paymentMethod })
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

  const handleUpdatePayment = (orderId: string, paymentStatus: 'paid' | 'unpaid', paymentMethod?: 'cash' | 'transfer') => runAction(orderId, async () => {
    await apiFetch('/api/admin/orders/' + orderId + '/payment', {
      method: 'POST',
      body: JSON.stringify({ paymentStatus, paymentMethod })
    });
    await fetchActiveOrders();
  });
  const refreshSettings = useCallback(async () => {
    try { const data = await (await apiFetch('/api/admin/settings')).json(); setIsAcceptingOrders(data.isAcceptingOrders); } catch { /* Error banner comes from apiFetch. */ }
  }, []);
  useEffect(() => { void refreshSettings(); const timer = setInterval(refreshSettings, 10000); return () => clearInterval(timer); }, [refreshSettings]);
  useEffect(() => { if (!stockModalProduct) { setStockMovements([]); return; } let active = true; void apiFetch('/api/admin/products/' + stockModalProduct.id + '/movements').then(r => r.json()).then(data => { if (active) setStockMovements(data); }).catch(() => { }); return () => { active = false; }; }, [stockModalProduct]);
  const handleToggleAcceptingOrders = () => runAction('settings', async () => {
    const result = await (await apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ isAcceptingOrders: !isAcceptingOrders }) })).json(); setIsAcceptingOrders(result.isAcceptingOrders);
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
      try { sessionStorage.removeItem('admin_backup_downloaded'); } catch { }
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
          body: JSON.stringify({ ...productFormData, expectedStock: editingProduct.stock })
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

  const handleStockUpdate = async () => {
    if (!stockModalProduct || pendingActions.current.has('stock')) return;
    pendingActions.current.add('stock');
    const stockPayload = { productId: stockModalProduct.id, type: stockAdjustmentType, amount: stockDelta };
    const clientRequestId = stableRequestId('stock', stockPayload);
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
    } finally { pendingActions.current.delete('stock'); }
  };


  // ================= COURT ACTIONS =================
  const handleToggleCourt = async (court: Court) => {
    try {
      sound.playActionClick();
      const res = await apiFetch(`/api/admin/courts/${court.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !court.isActive }) });
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

  // ================= POS ORDER ACTION (TẠO ĐƠN TẠI QUẦY) =================
  const handleSubmitPosOrder = async (paymentStatus: 'paid' | 'unpaid' = 'paid', paymentMethod: 'cash' | 'transfer' = 'cash') => {
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
    const clientRequestId = stableRequestId('pos', { items, paymentStatus, paymentMethod, courtId: posCourtId });
    setIsSubmittingPosOrder(true);
    try {
      sound.playActionClick();
      const res = await apiFetch('/api/admin/orders/create-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          items,
          paymentStatus,
          paymentMethod: paymentStatus === 'paid' ? paymentMethod : undefined,
          courtId: posCourtId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Lỗi tạo đơn');
        return;
      }

      completeRequest('pos');
      setPosCart({});
      setPosCourtId('counter');
      setPosOrderStep(1);
      setIsCreateOrderModalOpen(false);
      await fetchActiveOrders();
      await fetchProducts();
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
      {apiError && <div role="alert" style={{ padding: 12, background: '#fee2e2', color: '#991b1b' }}>{apiError}<button onClick={() => setApiError('')} style={{ marginLeft: 12 }}>Đóng</button></div>}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2.5px solid #22C55E',
            boxShadow: '0 0 16px rgba(34, 197, 94, 0.5)',
            backgroundColor: '#09251B',
            flexShrink: 0
          }}>
            <img
              src="/images/logo.jpg"
              alt="Sân Cầu Lông Trần Lựu"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scale(1.3)',
                display: 'block'
              }}
            />
          </div>
          <div>
            <h1 style={{ fontSize: '21px', fontWeight: 900, margin: 0, letterSpacing: '0.2px', color: '#FFFFFF' }}>
              Quản lí Quầy nước _ Sân Cầu Lông Trần Lựu
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#E2E8F0', marginTop: '3px', fontWeight: 700 }}>
              <span style={{
                display: 'inline-block',
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: isAcceptingOrders ? '#22C55E' : '#EF4444'
              }} />
              <span>{isAcceptingOrders ? 'Đang mở nhận đơn' : 'Đang tạm dừng nhận đơn'}</span>
              <span>•</span>
              <span>{courts.length} Sân thi đấu</span>
            </div>
          </div>
        </div>

        {/* Action controls: Tài khoản, Nút Cài Đặt Quầy & Đăng Xuất */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentUserInfo && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              padding: '5px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              lineHeight: 1.25
            }}>
              <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 800 }}>
                {currentUserInfo.fullName || currentUserInfo.username}
              </span>
              <span style={{ color: '#86EFAC', fontSize: '10px', fontWeight: 700 }}>
                {currentUserInfo.roleName}
              </span>
            </div>
          )}

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
                    sessionStorage.removeItem('tl_admin_tab_authenticated');
                    try {
                      await apiFetch('/api/admin/auth/logout', { method: 'POST', body: '{}' });
                    } catch {}
                    window.dispatchEvent(new Event('admin-logged-out'));
                    onLogout?.();
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

      {/* THANH ĐIỀU HƯỚNG POS CHUYÊN NGHIỆP - TẬP TRUNG THỐNG NHẤT */}
      <nav ref={navDropdownRef} style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 20px',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        gap: '8px',
        minHeight: '52px',
        position: 'relative',
        zIndex: 60,
        overflow: 'visible'
      }}>
        {/* NHÓM 1: QUẦY TÁC NGHIỆP BÁN HÀNG */}
        {(hasPermission('orders') || hasPermission('sports-pos')) && (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '4px', flexShrink: 0 }}>
            {/* 1. Quầy Nước (Order Sân) */}
            {hasPermission('orders') && (
              <button
                onClick={() => {
                  setCurrentTab('orders');
                  setActiveNavDropdown(null);
                }}
                style={{
                  height: '100%',
                  padding: '0 18px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: currentTab === 'orders' ? 'var(--color-primary)' : '#0F172A',
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
                <span>QUẦY NƯỚC (ORDER SÂN)</span>
                {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length > 0 && (
                  <span style={{
                    backgroundColor: currentTab === 'orders' ? 'var(--color-primary)' : '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length}
                  </span>
                )}
              </button>
            )}

            {/* 2. Quầy Thể Thao & Dịch Vụ */}
            {hasPermission('sports-pos') && (
              <button
                onClick={() => {
                  setCurrentTab('sports-pos');
                  setActiveNavDropdown(null);
                }}
                style={{
                  height: '100%',
                  padding: '0 18px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: currentTab === 'sports-pos' ? 'var(--color-primary)' : '#0F172A',
                  border: 'none',
                  borderBottom: currentTab === 'sports-pos' ? '3px solid var(--color-primary)' : '3px solid transparent',
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
                <span>QUẦY THỂ THAO & DỊCH VỤ</span>
              </button>
            )}
          </div>
        )}

        {/* VẠCH NGĂN CÁCH NHẸ GIỮA QUẦY VÀ QUẢN TRỊ */}
        {(hasPermission('orders') || hasPermission('sports-pos')) && (
          <div style={{ width: '1px', backgroundColor: 'var(--color-border)', margin: '10px 4px', flexShrink: 0 }} />
        )}

        {/* NHÓM 2: QUẢN TRỊ & THỐNG KÊ */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px', flexShrink: 0 }}>
          {/* 3. Nhập Hàng & Kho (Dropdown) */}
          {(hasPermission('drink-intake') || hasPermission('sports-intake')) && (
            <div data-dropdown-container="true" style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
              <button
                onClick={() => setActiveNavDropdown(prev => prev === 'products' ? null : 'products')}
                onMouseEnter={() => { if (activeNavDropdown) setActiveNavDropdown('products'); }}
                style={{
                  height: '100%',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: (currentTab === 'drink-intake' || currentTab === 'sports-intake' || currentTab === 'products' || currentTab === 'sports-catalog') ? 'var(--color-primary)' : '#0F172A',
                  border: 'none',
                  borderBottom: (currentTab === 'drink-intake' || currentTab === 'sports-intake' || currentTab === 'products' || currentTab === 'sports-catalog') ? '3px solid var(--color-primary)' : '3px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeNavDropdown === 'products' ? 'rgba(18, 67, 46, 0.05)' : 'transparent',
                  borderRadius: activeNavDropdown === 'products' ? '8px 8px 0 0' : '0',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>NHẬP HÀNG & KHO</span>
                {lowStockCount > 0 && (
                  <span style={{
                    backgroundColor: '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 900,
                    padding: '2px 7px',
                    borderRadius: '10px'
                  }}>
                    {lowStockCount}
                  </span>
                )}
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '2px', transition: 'transform 0.2s', transform: activeNavDropdown === 'products' ? 'rotate(180deg)' : 'none' }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {activeNavDropdown === 'products' && (
                <div
                  className="animate-nav-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 20px 32px -4px rgba(15, 23, 42, 0.16), 0 8px 16px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
                    border: '1px solid var(--color-border)',
                    minWidth: '310px',
                    zIndex: 1000,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {/* Item 1: Nhập Nước & Thực Phẩm */}
                  {hasPermission('drink-intake') && (
                    <button
                      onClick={() => { setCurrentTab('drink-intake'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: (currentTab === 'drink-intake' || currentTab === 'products') ? 'var(--color-primary-light)' : 'transparent',
                        color: (currentTab === 'drink-intake' || currentTab === 'products') ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'drink-intake' && currentTab !== 'products') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'drink-intake' && currentTab !== 'products') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Nhập Hàng Nước & Thực Phẩm</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Quản lý kho & giá vốn đồ uống</div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>{products.length} món</span>
                    </button>
                  )}

                  {/* Item 2: Nhập Thể Thao & Dịch Vụ */}
                  {hasPermission('sports-intake') && (
                    <button
                      onClick={() => { setCurrentTab('sports-intake'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: (currentTab === 'sports-intake' || currentTab === 'sports-catalog') ? 'var(--color-primary-light)' : 'transparent',
                        color: (currentTab === 'sports-intake' || currentTab === 'sports-catalog') ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'sports-intake' && currentTab !== 'sports-catalog') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'sports-intake' && currentTab !== 'sports-catalog') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Nhập Hàng Thể Thao & Dịch Vụ</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Vợt, vớ, quấn cán, cước & thuê đồ</div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>Dụng cụ & DV</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Lịch Sử Nhập Hàng (Dropdown Mới) */}
          {(hasPermission('intake-history') || hasPermission('sports-intake')) && (
            <div data-dropdown-container="true" style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
              <button
                onClick={() => setActiveNavDropdown(prev => prev === 'intake-history' ? null : 'intake-history')}
                onMouseEnter={() => { if (activeNavDropdown) setActiveNavDropdown('intake-history'); }}
                style={{
                  height: '100%',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: (currentTab === 'stock-history' || currentTab === 'sports-stock-history') ? 'var(--color-primary)' : '#0F172A',
                  border: 'none',
                  borderBottom: (currentTab === 'stock-history' || currentTab === 'sports-stock-history') ? '3px solid var(--color-primary)' : '3px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeNavDropdown === 'intake-history' ? 'rgba(18, 67, 46, 0.05)' : 'transparent',
                  borderRadius: activeNavDropdown === 'intake-history' ? '8px 8px 0 0' : '0',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>LỊCH SỬ NHẬP HÀNG</span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '2px', transition: 'transform 0.2s', transform: activeNavDropdown === 'intake-history' ? 'rotate(180deg)' : 'none' }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {activeNavDropdown === 'intake-history' && (
                <div
                  className="animate-nav-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 20px 32px -4px rgba(15, 23, 42, 0.16), 0 8px 16px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
                    border: '1px solid var(--color-border)',
                    minWidth: '310px',
                    zIndex: 1000,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {hasPermission('intake-history') && (
                    <button
                      onClick={() => { setCurrentTab('stock-history'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'stock-history' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'stock-history' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'stock-history') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'stock-history') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Lịch Sử Nhập Hàng (Nước)</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Biến động tồn kho & giá vốn nước uống</div>
                      </div>
                    </button>
                  )}

                  {hasPermission('sports-intake') && (
                    <button
                      onClick={() => { setCurrentTab('sports-stock-history'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'sports-stock-history' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'sports-stock-history' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'sports-stock-history') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'sports-stock-history') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Lịch Sử Nhập Hàng (Thể Thao)</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Phiếu nhập hàng dụng cụ & đan lưới</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5. Lịch Sử Xuất Hàng (Đổi từ Thống Kê & Lịch Sử) */}
          {(hasPermission('revenue-report') || hasPermission('order-history') || hasPermission('sports-order-history')) && (
            <div data-dropdown-container="true" style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
              <button
                onClick={() => setActiveNavDropdown(prev => prev === 'export-history' ? null : 'export-history')}
                onMouseEnter={() => { if (activeNavDropdown) setActiveNavDropdown('export-history'); }}
                style={{
                  height: '100%',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: (currentTab === 'history' || currentTab === 'sports-order-history' || currentTab === 'reports') ? 'var(--color-primary)' : '#0F172A',
                  border: 'none',
                  borderBottom: (currentTab === 'history' || currentTab === 'sports-order-history' || currentTab === 'reports') ? '3px solid var(--color-primary)' : '3px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeNavDropdown === 'export-history' ? 'rgba(18, 67, 46, 0.05)' : 'transparent',
                  borderRadius: activeNavDropdown === 'export-history' ? '8px 8px 0 0' : '0',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>LỊCH SỬ XUẤT HÀNG</span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '2px', transition: 'transform 0.2s', transform: activeNavDropdown === 'export-history' ? 'rotate(180deg)' : 'none' }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {activeNavDropdown === 'export-history' && (
                <div
                  className="animate-nav-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 20px 32px -4px rgba(15, 23, 42, 0.16), 0 8px 16px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
                    border: '1px solid var(--color-border)',
                    minWidth: '310px',
                    zIndex: 1000,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {hasPermission('order-history') && (
                    <button
                      onClick={() => { setCurrentTab('history'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'history' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'history' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'history') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'history') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Lịch Sử Bán Nước</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Đơn gọi nước & thực phẩm tại sân</div>
                      </div>
                    </button>
                  )}

                  {hasPermission('sports-order-history') && (
                    <button
                      onClick={() => { setCurrentTab('sports-order-history'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'sports-order-history' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'sports-order-history' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'sports-order-history') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'sports-order-history') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Lịch Sử Bán Đồ Thể Thao</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Hóa đơn bán dụng cụ & dịch vụ sân</div>
                      </div>
                    </button>
                  )}

                  {hasPermission('revenue-report') && (
                    <button
                      onClick={() => { setCurrentTab('reports'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'reports' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'reports' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'reports') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'reports') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Báo Cáo Doanh Thu & Xuất Hàng</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Doanh thu, sản lượng xuất kho & lợi nhuận</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5. CÀI ĐẶT CHUNG (Dropdown: Phân quyền, Sân & Mã QR, Sao lưu) */}
          {(hasPermission('rbac') || hasPermission('courts') || hasPermission('backup')) && (
            <div data-dropdown-container="true" style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
              <button
                onClick={() => setActiveNavDropdown(prev => prev === 'system' ? null : 'system')}
                onMouseEnter={() => { if (activeNavDropdown) setActiveNavDropdown('system'); }}
                style={{
                  height: '100%',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  color: (currentTab === 'rbac' || currentTab === 'courts' || currentTab === 'backup' || currentTab === 'settings') ? 'var(--color-primary)' : '#0F172A',
                  border: 'none',
                  borderBottom: (currentTab === 'rbac' || currentTab === 'courts' || currentTab === 'backup' || currentTab === 'settings') ? '3px solid var(--color-primary)' : '3px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeNavDropdown === 'system' ? 'rgba(18, 67, 46, 0.05)' : 'transparent',
                  borderRadius: activeNavDropdown === 'system' ? '8px 8px 0 0' : '0',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>CÀI ĐẶT CHUNG</span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '2px', transition: 'transform 0.2s', transform: activeNavDropdown === 'system' ? 'rotate(180deg)' : 'none' }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {activeNavDropdown === 'system' && (
                <div
                  className="animate-nav-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 20px 32px -4px rgba(15, 23, 42, 0.16), 0 8px 16px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
                    border: '1px solid var(--color-border)',
                    minWidth: '310px',
                    zIndex: 1000,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {/* Item 1: Phân Quyền & Tài Khoản */}
                  {hasPermission('rbac') && (
                    <button
                      onClick={() => { setCurrentTab('rbac'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: (currentTab === 'rbac' || currentTab === 'settings') ? 'var(--color-primary-light)' : 'transparent',
                        color: (currentTab === 'rbac' || currentTab === 'settings') ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'rbac' && currentTab !== 'settings') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'rbac' && currentTab !== 'settings') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Phân Quyền & Tài Khoản</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Phân quyền vai trò & tài khoản nhân viên</div>
                      </div>
                    </button>
                  )}

                  {/* Item 2: Sân Thi Đấu & Bộ Mã QR */}
                  {hasPermission('courts') && (
                    <button
                      onClick={() => { setCurrentTab('courts'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'courts' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'courts' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'courts') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'courts') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Sân Thi Đấu & Bộ Mã QR</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Danh sách sân & tải mã QR in ấn</div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>{courts.length} sân</span>
                    </button>
                  )}

                  {/* Item 3: Sao Lưu & Nhật Ký Hệ Thống */}
                  {hasPermission('backup') && (
                    <button
                      onClick={() => { setCurrentTab('backup'); setActiveNavDropdown(null); }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: currentTab === 'backup' ? 'var(--color-primary-light)' : 'transparent',
                        color: currentTab === 'backup' ? 'var(--color-primary)' : '#0F172A',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (currentTab !== 'backup') e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (currentTab !== 'backup') e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div>
                        <div>Sao Lưu & Nhật Ký Hệ Thống</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Tải bản lưu trữ & kiểm toán</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
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
                setPosCourtId('counter');
                if (products.length === 0) fetchProducts();
                setIsCreateOrderModalOpen(true);
              }}
            />
          )}

          {/* TAB 1B: QUẦY THỂ THAO & DỊCH VỤ */}
          {currentTab === 'sports-pos' && (
            <SportsPosTab courts={courts} />
          )}

          {/* TAB 2: NHẬP HÀNG NƯỚC & THỰC PHẨM */}
          {(currentTab === 'drink-intake' || currentTab === 'products') && (
            <DrinkIntakeTab
              products={products}
              onRefreshProducts={fetchProducts}
            />
          )}

          {/* TAB 2B: NHẬP HÀNG THỂ THAO & DỊCH VỤ SÂN */}
          {(currentTab === 'sports-intake' || currentTab === 'sports-catalog') && (
            <SportsIntakeTab />
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
              reportCategoryFilter={reportCategoryFilter}
              onSelectCategoryFilter={setReportCategoryFilter}
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

          {/* TAB 5A-2: LỊCH SỬ BÁN THỂ THAO */}
          {currentTab === 'sports-order-history' && (
            <SportsOrderHistoryTab />
          )}

          {/* TAB 5B: LỊCH SỬ NHẬP HÀNG & GIÁ VỐN */}
          {currentTab === 'stock-history' && (
            <StockIntakeTab
              products={products}
            />
          )}

          {/* TAB 5C: LỊCH SỬ NHẬP HÀNG THỂ THAO */}
          {currentTab === 'sports-stock-history' && (
            <SportsIntakeHistoryTab />
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

          {/* TAB 7: PHÂN QUYỀN & TÀI KHOẢN (RBAC) */}
          {(currentTab === 'rbac' || currentTab === 'settings') && (
            <RbacUsersTab />
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
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Tên sản phẩm / Món *</label>
                <input
                  type="text"
                  required
                  value={productFormData.name}
                  onChange={e => setProductFormData({ ...productFormData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                  placeholder="VD: Nước tăng lực Monster Energy / Mì ly Modern"
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Phân loại danh mục *
                </label>
                <select
                  value={productFormData.category}
                  onChange={e => setProductFormData({ ...productFormData, category: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1.5px solid var(--color-border)',
                    fontSize: 'var(--font-size-sm)',
                    backgroundColor: 'var(--color-surface)',
                    color: '#0F172A',
                    fontWeight: 700
                  }}
                >
                  <option value="water">💧 Nước suối / Nước khoáng</option>
                  <option value="energy">⚡ Nước tăng lực (Red Bull, Monster...)</option>
                  <option value="soda">🥤 Nước ngọt có gas (Coca, Pepsi, 7Up...)</option>
                  <option value="tea">🍵 Trà đóng chai & Thảo mộc</option>
                  <option value="juice">🧃 Nước ép & Nước trái cây</option>
                  <option value="coffee">☕ Cà phê đóng lon / Chai</option>
                  <option value="food">🍜 Thức ăn nhanh (Mì ly, snack, xúc xích...)</option>
                  <option value="other">📦 Khác</option>
                </select>
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

            <details style={{ marginTop: 12 }}><summary>Lịch sử biến động kho (100 lần gần nhất)</summary><div style={{ maxHeight: 160, overflow: 'auto' }}>{stockMovements.map(m => <p key={m.operationId}>{new Date(m.createdAt).toLocaleString('vi-VN')} · {m.delta > 0 ? '+' : ''}{m.delta} chai · còn {m.stockAfter}</p>)}</div></details>
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

      {/* MODAL: TẠO ĐƠN TẠI QUẦY (POS 2 BƯỚC) */}
      {isCreateOrderModalOpen && (() => {
        const posItemsList = Object.entries(posCart)
          .filter(([_, data]) => data.quantity > 0)
          .map(([productId, data]) => {
            const pr = products.find(p => p.id === productId);
            return {
              product: pr,
              productId,
              name: pr?.name || 'Mặt hàng',
              category: pr?.category,
              quantity: data.quantity,
              iceQuantity: data.iceQuantity,
              unitPrice: pr?.priceVnd || 0,
              totalVnd: (pr?.priceVnd || 0) * data.quantity
            };
          });
        const posTotalVnd = posItemsList.reduce((sum, i) => sum + i.totalVnd, 0);
        const posTotalItems = posItemsList.reduce((sum, i) => sum + i.quantity, 0);
        const courtLabel = posCourtId === 'counter'
          ? 'Tại quầy phục vụ'
          : (courts.find(c => c.code === posCourtId)?.name || `Sân ${posCourtId}`);

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10, 41, 28, 0.65)', backdropFilter: 'blur(4px)',
            zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}>
            <div style={{
              backgroundColor: 'var(--color-surface)',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '92vh',
              borderRadius: 'var(--radius-xl)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '0.3px' }}>
                      {posOrderStep === 1 ? 'TẠO ĐƠN TẠI QUẦY' : 'XÁC NHẬN & THANH TOÁN'}
                    </h3>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: posOrderStep === 1 ? '#EFF6FF' : '#ECFDF5',
                      color: posOrderStep === 1 ? '#1D4ED8' : '#059669',
                      border: `1px solid ${posOrderStep === 1 ? '#BFDBFE' : '#A7F3D0'}`
                    }}>
                      BƯỚC {posOrderStep}/2
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0', fontWeight: 600 }}>
                    {posOrderStep === 1
                      ? 'Chọn vị trí phục vụ và số lượng nước, đồ ăn nhanh cần gọi.'
                      : 'Kiểm tra kỹ hóa đơn và chọn hình thức thu tiền để hoàn tất.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCreateOrderModalOpen(false);
                    setPosCart({});
                    setPosOrderStep(1);
                  }}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-bg)', border: 'none', fontWeight: 800, fontSize: '15px', cursor: 'pointer', color: '#334155' }}
                >
                  ✕
                </button>
              </div>

              {/* BƯỚC 1: CHỌN VỊ TRÍ & MÓN */}
              {posOrderStep === 1 && (
                <>
                  {/* Chọn vị trí phục vụ */}
                  <div style={{
                    marginBottom: '14px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A' }}>
                      VỊ TRÍ PHỤC VỤ:
                    </span>
                    <select
                      value={posCourtId}
                      onChange={e => setPosCourtId(e.target.value)}
                      style={{
                        flex: 1,
                        maxWidth: '240px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--color-border)',
                        fontSize: '13px',
                        fontWeight: 800,
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-deep)'
                      }}
                    >
                      <option value="counter">Tại quầy phục vụ</option>
                      {courts.map(c => (
                        <option key={c.id} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bộ lọc tìm kiếm & nhóm món */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Tìm tên nước, món ăn..."
                      value={posSearchQuery}
                      onChange={e => setPosSearchQuery(e.target.value)}
                      style={{
                        flex: '1 1 180px',
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--color-border)',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: '#FFFFFF'
                      }}
                    />
                    <select
                      value={posCategoryFilter}
                      onChange={e => setPosCategoryFilter(e.target.value)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--color-border)',
                        fontSize: '12px',
                        fontWeight: 800,
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all">Tất cả nhóm</option>
                      <option value="water">Nước suối</option>
                      <option value="soda">Nước ngọt / Có gas</option>
                      <option value="isotonic">Bù khoáng / Thể thao</option>
                      <option value="energy">Tăng lực</option>
                      <option value="tea">Trà</option>
                      <option value="juice">Nước trái cây / Sữa chua</option>
                      <option value="food">Thức ăn nhanh</option>
                    </select>
                  </div>

                  {/* Danh sách món chọn */}
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#64748B', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                      DANH SÁCH MẶT HÀNG:
                    </div>

                    {products
                      .filter(p => {
                        if (posCategoryFilter !== 'all' && p.category !== posCategoryFilter) return false;
                        if (posSearchQuery.trim()) {
                          const q = posSearchQuery.toLowerCase().trim();
                          return p.name.toLowerCase().includes(q) || (p.tag && p.tag.toLowerCase().includes(q));
                        }
                        return true;
                      })
                      .map(p => {
                        const itemData = posCart[p.id] || { quantity: 0, iceQuantity: 0 };
                        const isFood = p.category === 'food';
                        return (
                          <div key={p.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            backgroundColor: itemData.quantity > 0 ? 'var(--color-primary-light)' : 'var(--color-bg)',
                            border: `1.5px solid ${itemData.quantity > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 'var(--radius-md)',
                            gap: '10px'
                          }}>
                            {/* Product Real Photo */}
                            {p.imageSvg ? (
                              <div style={{ width: '42px', height: '42px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '2px' }}>
                                <img src={p.imageSvg} alt={p.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                              </div>
                            ) : null}

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {p.name}
                                </span>
                                {isFood && (
                                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#B45309', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px' }}>
                                    Thức ăn • Không đá
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#334155', fontWeight: 600, marginTop: '2px' }}>
                                {formatVnd(p.priceVnd)} • Tồn: {p.stock}
                              </div>
                            </div>

                            {/* Stepper */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Quantity Stepper */}
                              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newQty = Math.max(0, itemData.quantity - 1);
                                    setPosCart(prev => ({ ...prev, [p.id]: { quantity: newQty, iceQuantity: 0 } }));
                                  }}
                                  style={{ width: '32px', height: '32px', border: 'none', background: 'transparent', fontWeight: 900, fontSize: '16px', cursor: 'pointer', color: '#0F172A' }}
                                >
                                  -
                                </button>
                                <span style={{ width: '28px', textAlign: 'center', fontWeight: 900, fontSize: '15px', color: '#0F172A' }}>
                                  {itemData.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newQty = itemData.quantity + 1;
                                    setPosCart(prev => ({ ...prev, [p.id]: { quantity: newQty, iceQuantity: 0 } }));
                                  }}
                                  style={{ width: '32px', height: '32px', border: 'none', background: 'transparent', fontWeight: 900, fontSize: '16px', cursor: 'pointer', color: 'var(--color-primary)' }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Bước 1: Thanh Footer Tiếp tục */}
                  <div style={{ borderTop: '1.5px solid var(--color-border)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>TẠM TÍNH ({posTotalItems} MÓN):</div>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-primary)' }}>
                        {formatVnd(posTotalVnd)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateOrderModalOpen(false);
                          setPosCart({});
                          setPosOrderStep(1);
                        }}
                        style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', fontWeight: 800, cursor: 'pointer', fontSize: '13px', color: '#334155' }}
                      >
                        Hủy bỏ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (posTotalItems === 0) {
                            alert('Vui lòng chọn ít nhất 1 món để tạo đơn!');
                            return;
                          }
                          sound.playActionClick();
                          setPosOrderStep(2);
                        }}
                        disabled={posTotalItems === 0}
                        style={{
                          padding: '10px 22px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: posTotalItems === 0 ? '#CBD5E1' : 'var(--color-primary)',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '13px',
                          border: 'none',
                          cursor: posTotalItems === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>TIẾP TỤC THANH TOÁN</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* BƯỚC 2: XÁC NHẬN & CHỌN HÌNH THỨC THU TIỀN */}
              {posOrderStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Tóm tắt thông tin đơn */}
                  <div style={{
                    backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--color-border)',
                    padding: '14px 16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px dashed var(--color-border)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>VỊ TRÍ PHỤC VỤ:</span>
                      <strong style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>{courtLabel}</strong>
                    </div>

                    {/* Bảng danh sách món */}
                    <div style={{ margin: '10px 0', maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {posItemsList.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                          <div>
                            <span style={{ fontWeight: 800, color: '#0F172A' }}>{it.quantity}x {it.name}</span>
                          </div>
                          <span style={{ fontWeight: 800, color: '#334155' }}>{formatVnd(it.totalVnd)}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>TỔNG THANH TOÁN:</span>
                      <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-primary)' }}>
                        {formatVnd(posTotalVnd)}
                      </span>
                    </div>
                  </div>

                  {/* 3 NÚT THANH TOÁN RÕ RÀNG */}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 900, color: '#334155', marginBottom: '8px', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                      CHỌN TRẠNG THÁI THU TIỀN ĐƠN HÀNG:
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Nút 1: Đã thu tiền mặt */}
                      <button
                        type="button"
                        onClick={() => handleSubmitPosOrder('paid', 'cash')}
                        disabled={isSubmittingPosOrder}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: '#15803D',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '14px',
                          border: 'none',
                          cursor: isSubmittingPosOrder ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: '0 2px 4px rgba(21, 128, 61, 0.2)'
                        }}
                      >
                        <span>ĐÃ THU TIỀN MẶT</span>
                        <span style={{ fontSize: '12px', opacity: 0.9 }}>Khách trả tại quầy • Hoàn tất tức thì</span>
                      </button>

                      {/* Nút 2: Đã thu chuyển khoản */}
                      <button
                        type="button"
                        onClick={() => handleSubmitPosOrder('paid', 'transfer')}
                        disabled={isSubmittingPosOrder}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: '#0284C7',
                          color: '#FFFFFF',
                          fontWeight: 900,
                          fontSize: '14px',
                          border: 'none',
                          cursor: isSubmittingPosOrder ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
                        }}
                      >
                        <span>ĐÃ THU CHUYỂN KHOẢN (QR)</span>
                        <span style={{ fontSize: '12px', opacity: 0.9 }}>Quét mã ngân hàng • Hoàn tất tức thì</span>
                      </button>

                      {/* Nút 3: Chưa thu tiền (Ghi nợ) */}
                      <button
                        type="button"
                        onClick={() => handleSubmitPosOrder('unpaid')}
                        disabled={isSubmittingPosOrder}
                        style={{
                          width: '100%',
                          padding: '13px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: '#FFFFFF',
                          color: '#B45309',
                          border: '2px solid #F59E0B',
                          fontWeight: 900,
                          fontSize: '13px',
                          cursor: isSubmittingPosOrder ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>CHƯA THU TIỀN (GHI SỔ SÂN)</span>
                        <span style={{ fontSize: '12px', color: '#D97706' }}>Khách chơi xong tính sau</span>
                      </button>
                    </div>
                  </div>

                  {/* Nút quay lại Bước 1 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setPosOrderStep(1)}
                      disabled={isSubmittingPosOrder}
                      style={{
                        padding: '8px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#64748B',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>←</span>
                      <span>Quay lại sửa danh sách món</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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

      {/* MODAL CẤP PHÁT MẬT KHẨU TẠM SAU KHI RESTORE */}
      {temporaryCredentials && temporaryCredentials.length > 0 && (
        <TemporaryCredentialsModal
          credentials={temporaryCredentials}
          onClose={() => setTemporaryCredentials(null)}
        />
      )}

      {/* MODAL BẮT BUỘC ĐỔI MẬT KHẨU (NON-DISMISSIBLE) */}
      {mustChangePassword && (
        <ForceChangePasswordModal
          username={currentUserInfo?.username}
          onSuccess={() => {
            setMustChangePassword(false);
            refreshUserSession();
          }}
        />
      )}
    </div>
  );
};
