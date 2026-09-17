export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const memoryStore = new Map<string, { fingerprint: string; id: string }>();

const inMemorySessionMap = new Map<string, string>();
const inMemoryLocalMap = new Map<string, string>();

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
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      signal: options.signal ?? AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
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
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Máy chủ không thể xử lý yêu cầu' }));
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
