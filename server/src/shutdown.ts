import type { Server } from 'node:http';
import type { Server as IOServer } from 'socket.io';
import { disconnectDb } from './database/connection.js';
import { disconnectRedis } from './integrations/redis/redis.client.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeAppointmentQueue } from './queues/appointment.queue.js';
import { closeQueueConnections } from './queues/queue.connection.js';
import { logServerInfo } from './utils/logger.js';

export function registerGracefulShutdown(httpServer: Server, io?: IOServer): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logServerInfo('api.shutdown', { signal });

    io?.close();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    await closeEmailQueue();
    await closeAppointmentQueue();
    await closeQueueConnections();
    await disconnectRedis();
    await disconnectDb();

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
