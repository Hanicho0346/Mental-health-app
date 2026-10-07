import { scheduleAppointmentReminder } from '../queues/appointment.queue.js';
import { enqueueEmailJob } from '../queues/email.queue.js';
import { logServerWarn } from '../utils/logger.js';

const REMINDER_LEAD_MS = 60 * 60 * 1000; // 1 hour before

export async function notifyAppointmentCreated(params: {
  appointmentId: string;
  userId: string;
  email: string;
  fullName: string;
  counselorName: string;
  scheduledAt: Date;
  timeLabel: string;
}): Promise<void> {
  const scheduledAtIso = params.scheduledAt.toISOString();
  const timeLabel = params.timeLabel;

  const confirmationQueued = await enqueueEmailJob(
    {
      type: 'APPOINTMENT_CONFIRMATION',
      userId: params.userId,
      email: params.email,
      meta: {
        fullName: params.fullName,
        counselorName: params.counselorName,
        scheduledAt: scheduledAtIso,
        timeLabel,
        appointmentId: params.appointmentId,
      },
    },
    `appt-confirm:${params.appointmentId}`,
  );

  if (!confirmationQueued) {
    logServerWarn('appointment.confirmationNotQueued', { appointmentId: params.appointmentId });
  }

  const reminderAt = new Date(params.scheduledAt.getTime() - REMINDER_LEAD_MS);
  if (reminderAt.getTime() > Date.now()) {
    await scheduleAppointmentReminder(
      {
        appointmentId: params.appointmentId,
        userId: params.userId,
        email: params.email,
        fullName: params.fullName,
        counselorName: params.counselorName,
        scheduledAt: scheduledAtIso,
        timeLabel,
      },
      reminderAt,
    );
  }
}

export async function notifyPsychiatristReview(params: {
  userId: string;
  email: string;
  fullName: string;
  approved: boolean;
  feedback?: string;
}): Promise<void> {
  await enqueueEmailJob(
    {
      type: 'PSYCHIATRIST_APPROVAL',
      userId: params.userId,
      email: params.email,
      meta: {
        fullName: params.fullName,
        status: params.approved ? 'approved' : 'rejected',
        feedback: params.feedback,
      },
    },
    `psychiatrist-review:${params.userId}:${params.approved ? 'approved' : 'rejected'}`,
  );
}
