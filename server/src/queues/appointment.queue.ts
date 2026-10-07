import { Queue } from 'bullmq';
import { getQueueConnection } from './queue.connection.js';

export type AppointmentReminderPayload = {
  appointmentId: string;
  userId: string;
  email: string;
  fullName: string;
  counselorName: string;
  scheduledAt: string;
  timeLabel: string;
};

const QUEUE_NAME = 'appointment';

let appointmentQueue: Queue<AppointmentReminderPayload> | null = null;

export function getAppointmentQueue(): Queue<AppointmentReminderPayload> | null {
  if (!appointmentQueue) {
    appointmentQueue = new Queue<AppointmentReminderPayload>(QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return appointmentQueue;
}

export async function scheduleAppointmentReminder(
  payload: AppointmentReminderPayload,
  runAt: Date,
): Promise<void> {
  const queue = getAppointmentQueue();
  if (!queue) return;

  const delay = Math.max(0, runAt.getTime() - Date.now());
  const jobId = `reminder:${payload.appointmentId}`;

  const existing = await queue.getJob(jobId);
  if (existing) {
    await existing.remove();
  }

  await queue.add('APPOINTMENT_REMINDER', payload, {
    jobId,
    delay,
  });
}

export async function cancelAppointmentReminder(appointmentId: string): Promise<void> {
  const queue = getAppointmentQueue();
  if (!queue) return;
  const job = await queue.getJob(`reminder:${appointmentId}`);
  if (job) await job.remove();
}

export async function closeAppointmentQueue(): Promise<void> {
  if (appointmentQueue) {
    await appointmentQueue.close();
    appointmentQueue = null;
  }
}
