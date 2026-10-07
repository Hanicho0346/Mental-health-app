export const EMAIL_JOB_TYPES = [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'WELCOME_EMAIL',
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_REMINDER',
  'PSYCHIATRIST_APPROVAL',
  'ACCOUNT_STATUS',
] as const;

export type EmailJobType = (typeof EMAIL_JOB_TYPES)[number];

export type EmailJobPayload = {
  type: EmailJobType;
  userId: string;
  email: string;
  meta?: {
    fullName?: string;
    appointmentId?: string;
    scheduledAt?: string;
    timeLabel?: string;
    counselorName?: string;
    status?: string;
    feedback?: string;
  };
};
