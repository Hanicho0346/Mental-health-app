import { env } from '../config/env.js';
import { redisService } from '../integrations/redis/redis.service.js';

export type SocketRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export async function checkSocketMessageRate(userId: string): Promise<SocketRateLimitResult> {
  const windowSec = Math.ceil(env.socketMessageRateLimitWindowMs / 1000);
  const key = `socket:msg:${userId}`;

  if (!redisService.isAvailable()) {
    return { allowed: true };
  }

  const count = await redisService.increment(key);
  if (count === 1) {
    await redisService.expire(key, windowSec);
  }

  if (count !== null && count > env.socketMessageRateLimitMax) {
    return { allowed: false, retryAfterSec: windowSec };
  }

  return { allowed: true };
}
