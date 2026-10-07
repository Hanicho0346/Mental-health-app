import { Queue } from 'bullmq';
import type { EmailJobPayload } from '../integrations/email/email.types.js';
import { getQueueConnection } from './queue.connection.js';
import { logServerWarn } from '../utils/logger.js';

const QUEUE_NAME = 'email';

let emailQueue: Queue<EmailJobPayload> | null = null;

export function getEmailQueue(): Queue<EmailJobPayload> | null {
  if (!emailQueue) {
    try {
      emailQueue = new Queue<EmailJobPayload>(QUEUE_NAME, {
        connection: getQueueConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      });
    } catch (err) {
      logServerWarn('email.queue.initFailed', { err: String(err) });
      return null;
    }
  }
  return emailQueue;
}

export async function enqueueEmailJob(
  payload: EmailJobPayload,
  jobId?: string,
): Promise<boolean> {
  const queue = getEmailQueue();
  if (!queue) return false;

  await queue.add(payload.type, payload, {
    jobId: jobId ?? `${payload.type}:${payload.userId}:${Date.now()}`,
  });
  return true;
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
  }
}
