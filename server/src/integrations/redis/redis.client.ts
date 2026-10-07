import Redis from 'ioredis';
import { getRedisUrl, REDIS_KEY_PREFIX } from './redis.config.js';
import { logServerError, logServerInfo, logServerWarn } from '../../utils/logger.js';

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedisClient(): Redis | null {
  return client;
}

export function createRedisConnection(label = 'default'): Redis {
  const url = getRedisUrl();
  const conn = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    keyPrefix: REDIS_KEY_PREFIX,
  });

  conn.on('error', (err: Error) => {
    logServerError(`redis.${label}.error`, err);
  });

  conn.on('connect', () => {
    logServerInfo(`redis.${label}.connect`, {});
  });

  conn.on('reconnecting', () => {
    logServerWarn(`redis.${label}.reconnecting`, {});
  });

  return conn;
}

export async function connectRedis(): Promise<Redis> {
  if (client?.status === 'ready') return client;

  client = createRedisConnection('api');
  await client.connect();
  return client;
}

export function getRedisSubscriber(): Redis {
  if (!subscriber) {
    subscriber = createRedisConnection('subscriber');
    void subscriber.connect().catch((err) => logServerError('redis.subscriber.connect', err));
  }
  return subscriber;
}

export async function disconnectRedis(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (client) {
    tasks.push(client.quit().catch(() => client?.disconnect()));
    client = null;
  }
  if (subscriber) {
    tasks.push(subscriber.quit().catch(() => subscriber?.disconnect()));
    subscriber = null;
  }
  await Promise.all(tasks);
}

export async function pingRedis(): Promise<boolean> {
  if (!client || client.status !== 'ready') return false;
  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
