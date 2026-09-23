export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
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
  if (/\/api\/admin\/sports\/pos\/order$/.test(path)) return 'sports.pos';
  if (/\/api\/admin\/orders\/(create-pos|create-for-court)$/.test(path)) return 'order.pos';
  if (/\/api\/admin\/orders\/[^/]+\/(payment|deliver-and-pay|cancel)$/.test(path)) return 'order.financial';
  if (/\/api\/admin\/orders\/[^/]+\/transition$/.test(path)) return 'order.transition';
  if (/\/api\/admin\/courts(?:\/|$)/.test(path)) return 'courts.manage';
  if (/\/api\/admin\/settings$/.test(path)) return 'settings';
  if (/\/api\/admin\/catalog\/import$/.test(path)) return 'catalog.import';
  if (/\/api\/admin\/rbac\//.test(path)) return 'rbac.manage';
  return undefined;
}

async function requestActionProof(action: string): Promise<string> {
  const password = typeof window !== 'undefined'
    ? window.prompt('Thao tác này cần xác nhận mật khẩu quản trị. Vui lòng nhập mật khẩu:')
    : null;
  if (!password) throw new ApiError(403, 'ACTION_PROOF_REQUIRED', 'Đã hủy xác nhận mật khẩu quản trị.');

  const verifyResponse = await fetch('/api/admin/auth/verify-action-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, action })
  });
  const verifyBody = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok || typeof verifyBody.proofToken !== 'string') {
    throw new ApiError(verifyResponse.status || 403, verifyBody.code || 'INVALID_PASSWORD', verifyBody.message || 'Mật khẩu quản trị không chính xác.');
  }
  return verifyBody.proofToken;
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
    inMemorySessionMap.set(key, value);
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  },
  removeItem(key: string): void {
    inMemorySessionMap.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch {}
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
    inMemoryLocalMap.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem(key: string): void {
    inMemoryLocalMap.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {}
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

export async function apiFetch(url: string, options: RequestInit = {}) {
  let response: Response;
  const method = (options.method || 'GET').toUpperCase();
  const requestHeaders = new Headers(options.headers);
  // Keep headers in a single `Headers` instance. Building a plain object with
  // both `Content-Type` and the lower-cased entry from Headers can make the
  // browser serialize the value as `application/json, application/json`,
  // which Express does not recognise as a JSON media type.
  if (options.body != null && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (pendingActionProof && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    requestHeaders.set('x-action-proof', pendingActionProof);
  }
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      signal: options.signal ?? AbortSignal.timeout(20000),
      headers: requestHeaders
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
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
    const body = await response.json().catch(() => ({ message: 'Máy chủ không thể xử lý yêu cầu' }));
    const proofRetried = Boolean((options as RequestInit & { __proofRetried?: boolean }).__proofRetried);
    const sensitiveAction = inferSensitiveAction(url);
    if (response.status === 403 && (body.code === 'ACTION_PROOF_REQUIRED' || body.code === 'ACTION_PROOF_INVALID') && sensitiveAction && !proofRetried && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const proof = await requestActionProof(sensitiveAction);
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set('x-action-proof', proof);
      const retryOptions = { ...options, headers: retryHeaders, __proofRetried: true } as RequestInit;
      return apiFetch(url, retryOptions);
    }
    const error = new ApiError(response.status, body.code || 'API_ERROR', body.message);
    if (response.status === 401 && url.startsWith('/api/admin') && !url.endsWith('/login')) {
      window.dispatchEvent(new Event('admin-session-expired'));
    }
    if (response.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('password-change-required', { detail: body.message }));
    }
    window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }));
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
