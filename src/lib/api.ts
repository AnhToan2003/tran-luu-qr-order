import { promptActionProofModal, ActionProofCancelledError } from './actionProofModal.js';

export { ActionProofCancelledError };

export function isActionProofCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  return Boolean(
    e.isCancelled ||
    e.name === 'ActionProofCancelledError' ||
    e.code === 'ACTION_PROOF_CANCELLED' ||
    (typeof e.message === 'string' && (e.message.includes('Đã hủy') || e.message.includes('hủy xác nhận')))
  );
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) { super(message); }
}

const memoryStore = new Map<string, { fingerprint: string; id: string }>();

const inMemorySessionMap = new Map<string, string>();
const inMemoryLocalMap = new Map<string, string>();
let pendingActionProof: string | null = null;

function inferSensitiveAction(url: string): string | undefined {
  const path = url.split('?')[0];
  if (/\/api\/admin\/(products|inventory\/)/.test(path)) return 'inventory';
  if (/\/api\/admin\/categories(?:\/|$)/.test(path)) return 'drink.category';
  if (/\/api\/admin\/sports\/categories(?:\/|$)/.test(path)) return 'sports.category';
  if (/\/api\/admin\/courts(?:\/|$)/.test(path)) return 'courts.manage';
  if (/\/api\/admin\/settings$/.test(path)) return 'settings';
  if (/\/api\/admin\/catalog\/import$/.test(path)) return 'catalog.import';
  if (/\/api\/admin\/backup\/full$/.test(path)) return 'backup.export';
  if (/\/api\/admin\/clean\/purge$/.test(path)) return 'data.purge';
  if (/\/api\/admin\/sports\/(items|intake|batch-intake)(?:\/|$)/.test(path)) return 'inventory';
  if (/\/api\/admin\/rbac\//.test(path)) return 'rbac.manage';
  return undefined;
}

function actionSuccessMessage(action: string): string {
  const map: Record<string, string> = {
    'inventory': '✅ Xác nhận thành công — Thao tác kho hàng đã được thực hiện',
    'drink.category': '✅ Xác nhận thành công — Đã cập nhật hạng mục nước',
    'sports.category': '✅ Xác nhận thành công — Đã cập nhật hạng mục thể thao',
    'courts.manage': '✅ Xác nhận thành công — Đã cập nhật quản lý sân',
    'settings': '✅ Xác nhận thành công — Đã lưu cài đặt hệ thống',
    'catalog.import': '✅ Xác nhận thành công — Đã nhập danh mục sản phẩm',
    'backup.export': '✅ Xác nhận thành công — Đã tạo bản sao lưu dữ liệu',
    'data.purge': '✅ Xác nhận thành công — Đã xóa dữ liệu theo yêu cầu',
    'rbac.manage': '✅ Xác nhận thành công — Đã cập nhật phân quyền tài khoản'
  };
  return map[action] || '✅ Xác nhận mật khẩu thành công — Thao tác đã được thực hiện';
}

async function requestActionProof(action: string): Promise<string> {
  return await promptActionProofModal({
    action,
    title: 'Xác Nhận Mật Khẩu Quản Trị',
    description: 'Thao tác này cần xác nhận mật khẩu quản trị. Vui lòng nhập mật khẩu:'
  });
}

export function setActionProof(proofToken: string): void {
  pendingActionProof = /^[a-f0-9]{64}$/i.test(proofToken) ? proofToken : null;
}

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key) ?? inMemorySessionMap.get(key) ?? null;
    } catch {
      return inMemorySessionMap.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      inMemorySessionMap.set(key, value);
    }
  },
  removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      inMemorySessionMap.delete(key);
    }
  }
};

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? inMemoryLocalMap.get(key) ?? null;
    } catch {
      return inMemoryLocalMap.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      inMemoryLocalMap.set(key, value);
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      inMemoryLocalMap.delete(key);
    }
  }
};

function safeSessionStorageGet(key: string): string | null {
  return safeSessionStorage.getItem(key);
}

function safeSessionStorageSet(key: string, value: string): void {
  safeSessionStorage.setItem(key, value);
}

function safeSessionStorageRemove(key: string): void {
  safeSessionStorage.removeItem(key);
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const requestHeaders = new Headers(options.headers || {});
  if (!requestHeaders.has('Content-Type') && options.body != null && !(options.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (pendingActionProof && !requestHeaders.has('x-action-proof') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    requestHeaders.set('x-action-proof', pendingActionProof);
  }
  if (!requestHeaders.has('x-client-request-id')) {
    requestHeaders.set('x-client-request-id', crypto.randomUUID());
  }
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      signal: options.signal ?? AbortSignal.timeout(20000),
      headers: requestHeaders
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      if (options.signal?.reason === 'session_changed' || options.signal?.reason === 'caller_aborted') {
        throw err;
      }
      const timeoutError = new ApiError(0, 'TIMEOUT', 'Yêu cầu quá thời gian chờ (20 giây). Vui lòng kiểm tra lại kết nối mạng.');
      window.dispatchEvent(new CustomEvent('api-error', { detail: timeoutError.message }));
      throw timeoutError;
    }
    const error = new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Vui lòng thử lại; yêu cầu đặt đơn sẽ giữ nguyên mã để tránh đặt trùng.');
    window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }));
    throw error;
  }
  // A proof is single-use. Clear it after the first mutating request reaches
  // the server, regardless of success, so it cannot be replayed from the UI.
  if (pendingActionProof && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    pendingActionProof = null;
  }
  if (!response.ok) {
    const responseRequestId = response.headers.get('x-request-id') || undefined;
    const fallbackMessage = `Máy chủ không thể xử lý yêu cầu (HTTP ${response.status}${responseRequestId ? `, mã ${responseRequestId}` : ''})`;
    const body = await response.json().catch(() => ({ message: fallbackMessage, code: `HTTP_${response.status}` }));
    const proofRetried = Boolean((options as RequestInit & { __proofRetried?: boolean }).__proofRetried);
    const sensitiveAction = inferSensitiveAction(url);
    if (response.status === 403 && (body.code === 'ACTION_PROOF_REQUIRED' || body.code === 'ACTION_PROOF_INVALID') && sensitiveAction && !proofRetried && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      try {
        const proof = await requestActionProof(sensitiveAction);
        const retryHeaders = new Headers(options.headers);
        retryHeaders.set('x-action-proof', proof);
        const retryOptions = { ...options, headers: retryHeaders, __proofRetried: true } as RequestInit;
        const retryResponse = await apiFetch(url, retryOptions);
        if (retryResponse.ok && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('api-action-success', {
            detail: actionSuccessMessage(sensitiveAction)
          }));
        }
        return retryResponse;
      } catch (err: any) {
        if (isActionProofCancelled(err)) {
          throw err;
        }
        throw err;
      }
    }
    const error = new ApiError(response.status, body.code || 'API_ERROR', body.message || fallbackMessage, responseRequestId);
    if (response.status === 401 && url.startsWith('/api/admin') && !url.endsWith('/login')) {
      window.dispatchEvent(new Event('admin-session-expired'));
    }
    if (response.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('password-change-required', { detail: body.message }));
    }
    if (!url.includes('/auth/verify-action-password') && !url.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }));
    }
    throw error;
  }
  return response;
}

export function stableRequestId(key: string, payload: unknown): string {
  const storageKey = 'tl-request:' + key;
  const fingerprint = JSON.stringify(payload);

  // 1. Kiểm tra memoryStore trước (luôn phản ánh trạng thái in-memory đang chờ và không bị lỗi quota)
  const memEntry = memoryStore.get(storageKey);
  if (memEntry && memEntry.fingerprint === fingerprint) {
    return memEntry.id;
  }

  // 2. Kiểm tra sessionStorage nếu memoryStore chưa có
  const raw = safeSessionStorageGet(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.fingerprint === fingerprint) {
        memoryStore.set(storageKey, parsed);
        return parsed.id;
      }
    } catch {}
  }

  // 3. Sinh ID mới cho lần xác nhận đặt đơn mới
  const id = crypto.randomUUID();
  const entry = { fingerprint, id };
  memoryStore.set(storageKey, entry);
  safeSessionStorageSet(storageKey, JSON.stringify(entry));
  return id;
}

export function completeRequest(key: string): void {
  const storageKey = 'tl-request:' + key;
  safeSessionStorageRemove(storageKey);
  memoryStore.delete(storageKey);
}
