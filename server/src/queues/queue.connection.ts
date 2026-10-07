import { Queue, type ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import { getRedisUrl } from '../integrations/redis/redis.config.js';
import { logServerError, logServerInfo } from '../utils/logger.js';

let bullmqConnection: Redis | null = null;

function createBullmqRedisConnection(): Redis {
  const url = getRedisUrl();
  const conn = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  conn.on('error', (err: Error) => {
    logServerError('redis.bullmq.error', err);
  });

  conn.on('connect', () => {
    logServerInfo?.('redis.bullmq.connect', {});
  });

  return conn;
}

export function getQueueConnection(): ConnectionOptions {
  if (!bullmqConnection) {
    bullmqConnection = createBullmqRedisConnection();
    void bullmqConnection.connect().catch(() => undefined);
  }
  return bullmqConnection;
}

export async function closeQueueConnections(): Promise<void> {
  if (bullmqConnection) {
    await bullmqConnection.quit().catch(() => bullmqConnection?.disconnect());
    bullmqConnection = null;
  }
}
