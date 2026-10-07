import { env } from '../../config/env.js';

export function getRedisUrl(): string {
  return env.redisUrl;
}

export const REDIS_KEY_PREFIX = 'mh:';
