import type { Store, IncrementResponse } from 'express-rate-limit';
import { getRedisClient } from './redis.js';

/**
 * Shared rate-limit store. Redis is used when available so limits are applied
 * consistently across all backend instances; the bounded in-memory map keeps
 * a single instance safe during a transient Redis outage.
 */
export function createRateLimitStore(prefix: string): Store {
  const local = new Map<string, { hits: number; resetAt: number }>();
  let windowMs = 60_000;

  const localIncrement = (key: string): IncrementResponse => {
    const now = Date.now();
    const current = local.get(key);
    if (!current || current.resetAt <= now) {
      const entry = { hits: 1, resetAt: now + windowMs };
      local.set(key, entry);
      return { totalHits: 1, resetTime: new Date(entry.resetAt) };
    }
    current.hits += 1;
    return { totalHits: current.hits, resetTime: new Date(current.resetAt) };
  };

  const failClosedIncrement = (): IncrementResponse => ({
    // In production it is safer to reject a rate-limited request while the
    // shared store is unavailable than to silently bypass brute-force limits
    // on one backend instance.
    totalHits: Number.MAX_SAFE_INTEGER,
    resetTime: new Date(Date.now() + windowMs)
  });

  const store: Store = {
    localKeys: false,
    prefix: `ratelimit:${prefix}:`,
    init(options) {
      windowMs = options.windowMs;
    },
    async increment(key): Promise<IncrementResponse> {
      const redis = getRedisClient();
      if (!redis) return process.env.NODE_ENV === 'production' ? failClosedIncrement() : localIncrement(key);
      try {
        const redisKey = `ratelimit:${prefix}:${key}`;
        const hits = await redis.incr(redisKey);
        if (hits === 1) await redis.pexpire(redisKey, windowMs);
        const ttl = await redis.pttl(redisKey);
        return { totalHits: hits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
      } catch {
        return process.env.NODE_ENV === 'production' ? failClosedIncrement() : localIncrement(key);
      }
    },
    async decrement(key) {
      const redis = getRedisClient();
      if (!redis) {
        const current = local.get(key);
        if (current && current.hits > 0) current.hits -= 1;
        return;
      }
      try {
        const redisKey = `ratelimit:${prefix}:${key}`;
        const hits = await redis.decr(redisKey);
        if (hits <= 0) await redis.del(redisKey);
      } catch {
        const current = local.get(key);
        if (current && current.hits > 0) current.hits -= 1;
      }
    },
    async resetKey(key) {
      local.delete(key);
      const redis = getRedisClient();
      if (redis) {
        try { await redis.del(`ratelimit:${prefix}:${key}`); } catch { /* fail-safe */ }
      }
    },
    async resetAll() {
      local.clear();
      // Do not use KEYS/FLUSHDB here: those are unsafe in a shared Redis.
    },
    async shutdown() { local.clear(); }
  };

  return store;
}
