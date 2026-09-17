import { Redis, type RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;
let isRedisConnected = false;
let redisConnectionAttempted = false;

function buildRedisOptions(): RedisOptions {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  return {
    host,
    port,
    password,
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        return null; // Stop retrying after 3 failed attempts to avoid log spam
      }
      return Math.min(times * 1000, 3000);
    }
  };
}

export async function initRedis(): Promise<Redis | null> {
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('[Redis] Disabled via REDIS_ENABLED=false. Running with database/in-memory fallback.');
    return null;
  }

  if (redisConnectionAttempted) {
    return isRedisConnected ? redisClient : null;
  }

  redisConnectionAttempted = true;

  try {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI;
    if (redisUrl) {
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 2500,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 3 ? null : 1500)
      });
    } else {
      redisClient = new Redis(buildRedisOptions());
    }

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('[Redis] Connected successfully to Redis server.');
    });

    redisClient.on('ready', () => {
      isRedisConnected = true;
    });

    redisClient.on('error', (err) => {
      // Safe error logger - does not crash the Node.js process
      if (isRedisConnected) {
        console.warn('[Redis] Connection error:', err.message);
      }
      isRedisConnected = false;
    });

    redisClient.on('close', () => {
      isRedisConnected = false;
    });

    // Attempt initial connection with 2.5s timeout
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout (2500ms)')), 2500))
    ]);

    isRedisConnected = true;
    return redisClient;
  } catch (error) {
    isRedisConnected = false;
    console.log(`[Redis] Not available (${(error as Error).message}). Gracefully falling back to MongoDB/in-memory mode.`);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return isRedisConnected && redisClient !== null && redisClient.status === 'ready';
}

export function getRedisClient(): Redis | null {
  return isRedisAvailable() ? redisClient : null;
}

/**
 * Cache Helper: Lấy dữ liệu từ cache Redis
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable() || !redisClient) return null;
  try {
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Cache Helper: Ghi dữ liệu vào cache Redis với TTL
 */
export async function cacheSet(key: string, value: any, ttlSeconds = 300): Promise<boolean> {
  if (!isRedisAvailable() || !redisClient) return false;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache Helper: Xóa cache theo key hoặc pattern
 */
export async function cacheDel(keyOrPattern: string): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    if (keyOrPattern.includes('*')) {
      const keys = await redisClient.keys(keyOrPattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } else {
      await redisClient.del(keyOrPattern);
    }
  } catch {
    // Silent fail-safe
  }
}

/**
 * Cache Helper: Xóa cache danh mục sản phẩm (sử dụng khi tồn kho hoặc sản phẩm thay đổi)
 */
export async function invalidateCatalogCache(): Promise<void> {
  await cacheDel('cache:catalog:available_products');
}

let redisSubClient: Redis | null = null;
type RealtimeSubscriber = (event: any) => void;
type RevocationSubscriber = (payload: { userId?: string; tokenHash?: string; roleId?: string; _originInstanceId?: string }) => void;

let onRealtimeMessage: RealtimeSubscriber | null = null;
let onRevocationMessage: RevocationSubscriber | null = null;

export function registerRealtimeSubscriber(handler: RealtimeSubscriber) {
  onRealtimeMessage = handler;
}

export function registerRevocationSubscriber(handler: RevocationSubscriber) {
  onRevocationMessage = handler;
}

/**
 * Khởi tạo subscriber lắng nghe sự kiện xuyên nhiều instance
 */
export async function initRedisSubscriber(): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    redisSubClient = redisClient.duplicate();
    await redisSubClient.connect();
    await redisSubClient.subscribe('tranluu:realtime_events', 'tranluu:session_revoked');
    
    redisSubClient.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === 'tranluu:realtime_events' && onRealtimeMessage) {
          onRealtimeMessage(data);
        } else if (channel === 'tranluu:session_revoked' && onRevocationMessage) {
          onRevocationMessage(data);
        }
      } catch {}
    });
  } catch (err) {
    console.warn('[Redis Sub] Could not initialize subscriber:', (err as Error).message);
  }
}

/**
 * Redis Pub/Sub: Phát tán sự kiện thời gian thực (đơn hàng, tồn kho) xuyên instance
 */
export async function publishRealtimeEvent(event: any): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    await redisClient.publish('tranluu:realtime_events', JSON.stringify(event));
  } catch {
    // Fail-safe
  }
}

/**
 * Redis Pub/Sub: Phát tán lệnh thu hồi phiên xuyên instance
 */
export async function publishSessionRevocation(payload: { userId?: string; tokenHash?: string; roleId?: string; _originInstanceId?: string }): Promise<void> {
  if (!isRedisAvailable() || !redisClient) return;
  try {
    await redisClient.publish('tranluu:session_revoked', JSON.stringify(payload));
  } catch {
    // Fail-safe
  }
}

/**
 * Đóng kết nối Redis khi server tắt
 */
export async function closeRedis(): Promise<void> {
  if (redisSubClient) {
    try { await redisSubClient.quit(); } catch { redisSubClient.disconnect(); } finally { redisSubClient = null; }
  }
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isRedisConnected = false;
    }
  }
}
