import { Worker, type Job } from 'bullmq';
import { enqueueEmailJob } from '../queues/email.queue.js';
import { getQueueConnection } from '../queues/queue.connection.js';
import type { AppointmentReminderPayload } from '../queues/appointment.queue.js';
import { logServerInfo, logServerError } from '../utils/logger.js';

let appointmentWorker: Worker<AppointmentReminderPayload> | null = null;

export function startAppointmentWorker(): Worker<AppointmentReminderPayload> {
  if (appointmentWorker) return appointmentWorker;

  appointmentWorker = new Worker<AppointmentReminderPayload>(
    'appointment',
    async (job: Job<AppointmentReminderPayload>) => {
      const p = job.data;
      await enqueueEmailJob(
        {
          type: 'APPOINTMENT_REMINDER',
          userId: p.userId,
          email: p.email,
          meta: {
            fullName: p.fullName,
            counselorName: p.counselorName,
            scheduledAt: p.scheduledAt,
            timeLabel: p.timeLabel,
            appointmentId: p.appointmentId,
          },
        },
        `reminder-email:${p.appointmentId}`,
      );
      logServerInfo('appointment.worker.reminderQueued', { appointmentId: p.appointmentId });
    },
    { connection: getQueueConnection(), concurrency: 2 },
  );

  appointmentWorker.on('failed', (job: Job<AppointmentReminderPayload> | undefined, err: Error) => {
    logServerError('appointment.worker.failed', err, { jobId: job?.id });
  });

  return appointmentWorker;
}

export async function stopAppointmentWorker(): Promise<void> {
  if (appointmentWorker) {
    await appointmentWorker.close();
    appointmentWorker = null;
  }
}
