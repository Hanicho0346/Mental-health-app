import 'dotenv/config';
import { connectDb, disconnectDb } from './database/connection.js';
import { connectRedis, disconnectRedis } from './integrations/redis/redis.client.js';
import { startEmailWorker, stopEmailWorker } from './workers/email.worker.js';
import { startAppointmentWorker, stopAppointmentWorker } from './workers/appointment.worker.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeAppointmentQueue } from './queues/appointment.queue.js';
import { closeQueueConnections } from './queues/queue.connection.js';
import { logServerError, logServerInfo } from './utils/logger.js';

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logServerInfo('worker.shutdown', { signal });

  await stopEmailWorker();
  await stopAppointmentWorker();
  await closeEmailQueue();
  await closeAppointmentQueue();
  await closeQueueConnections();
  await disconnectRedis();
  await disconnectDb();

  process.exit(0);
}

async function main(): Promise<void> {
  await connectRedis();
  await connectDb();

  startEmailWorker();
  startAppointmentWorker();

  logServerInfo('worker.ready', {});

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logServerError('worker.main', err);
  process.exit(1);
});
