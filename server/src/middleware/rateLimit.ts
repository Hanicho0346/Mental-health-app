import rateLimit, { type Options, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { getRedisClient } from '../integrations/redis/redis.client.js';

class RedisRateLimitStore implements Store {
  prefix: string;
  windowMs: number;

  constructor(prefix: string, windowMs: number) {
    this.prefix = `rl:${prefix}`;
    this.windowMs = windowMs;
  }

  private client() {
    const c = getRedisClient();
    return c && c.status === 'ready' ? c : null;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const client = this.client();
    const resetTime = new Date(Date.now() + this.windowMs);

    if (!client) {
      return { totalHits: 1, resetTime };
    }

    const redisKey = `${this.prefix}:${key}`;
    const hits = await client.incr(redisKey);
    if (hits === 1) {
      await client.pexpire(redisKey, this.windowMs);
    }
    return { totalHits: hits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const client = this.client();
    if (!client) return;
    await client.decr(`${this.prefix}:${key}`);
  }

  async resetKey(key: string): Promise<void> {
    const client = this.client();
    if (!client) return;
    await client.del(`${this.prefix}:${key}`);
  }
}

function limiterOptions(prefix: string, windowMs: number, max: number): Partial<Options> {
  const store = new RedisRateLimitStore(prefix, windowMs);

  return {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req: Request) => {
      const ip =
        (typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
          : undefined) ?? req.socket.remoteAddress ?? 'unknown';
      return ip;
    },
  };
}

export function globalRateLimiter() {
  return rateLimit(limiterOptions('global', env.rateLimitWindowMs, env.rateLimitMax));
}

export function authRateLimiter() {
  return rateLimit(limiterOptions('auth', env.authRateLimitWindowMs, env.authRateLimitMax));
}

export function otpRateLimiter() {
  return rateLimit(limiterOptions('otp', env.otpRateLimitWindowMs, env.otpRateLimitMax));
}
