import { getRedisClient } from './redis.client.js';
import { logServerWarn } from '../../utils/logger.js';

function prefixKey(key: string): string {
  return key;
}

export class RedisService {
  private get client() {
    return getRedisClient();
  }

  isAvailable(): boolean {
    return this.client?.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    const c = this.client;
    if (!c || c.status !== 'ready') return null;
    try {
      return await c.get(prefixKey(key));
    } catch {
      logServerWarn('redis.get.failed', { key });
      return null;
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    const c = this.client;
    if (!c || c.status !== 'ready') return false;
    try {
      await c.set(prefixKey(key), value);
      return true;
    } catch {
      logServerWarn('redis.set.failed', { key });
      return false;
    }
  }

  async setWithTTL(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const c = this.client;
    if (!c || c.status !== 'ready') return false;
    try {
      await c.set(prefixKey(key), value, 'EX', ttlSeconds);
      return true;
    } catch {
      logServerWarn('redis.setWithTTL.failed', { key });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    const c = this.client;
    if (!c || c.status !== 'ready') return false;
    try {
      await c.del(prefixKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    const c = this.client;
    if (!c || c.status !== 'ready') return false;
    try {
      return (await c.exists(prefixKey(key))) === 1;
    } catch {
      return false;
    }
  }

  async increment(key: string): Promise<number | null> {
    const c = this.client;
    if (!c || c.status !== 'ready') return null;
    try {
      return await c.incr(prefixKey(key));
    } catch {
      return null;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const c = this.client;
    if (!c || c.status !== 'ready') return false;
    try {
      await c.expire(prefixKey(key), ttlSeconds);
      return true;
    } catch {
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJsonWithTTL(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    return this.setWithTTL(key, JSON.stringify(value), ttlSeconds);
  }
}

export const redisService = new RedisService();

/** Redis keys for one-time email codes (never log values). */
export const emailCodeKeys = {
  verification: (userId: string) => `email:code:verify:${userId}`,
  passwordReset: (userId: string) => `email:code:reset:${userId}`,
};
