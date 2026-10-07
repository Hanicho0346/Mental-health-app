import { Worker, type Job } from 'bullmq';
import { processEmailJob, handleEmailWorkerError } from '../integrations/email/email.service.js';
import type { EmailJobPayload } from '../integrations/email/email.types.js';
import { getQueueConnection } from '../queues/queue.connection.js';
import { logServerInfo } from '../utils/logger.js';

let emailWorker: Worker<EmailJobPayload> | null = null;

export function startEmailWorker(): Worker<EmailJobPayload> {
  if (emailWorker) return emailWorker;

  emailWorker = new Worker<EmailJobPayload>(
    'email',
    async (job: Job<EmailJobPayload>) => {
      const started = Date.now();
      logServerInfo('email.worker.start', { jobId: job.id, type: job.data.type, attempt: job.attemptsMade + 1 });
      await processEmailJob(job.data);
      logServerInfo('email.worker.done', {
        jobId: job.id,
        type: job.data.type,
        durationMs: Date.now() - started,
      });
    },
    {
      connection: getQueueConnection(),
      concurrency: 5,
    },
  );

  emailWorker.on('failed', (job: Job<EmailJobPayload> | undefined, err: Error) => {
    handleEmailWorkerError(job?.id, job?.data?.type ?? 'unknown', err);
  });

  return emailWorker;
}

export async function stopEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.close();
    emailWorker = null;
  }
}
