import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logServerError, logServerInfo, logServerWarn } from '../../utils/logger.js';
import { emailCodeKeys, redisService } from '../redis/redis.service.js';
import { getResendClient, isResendConfigured } from './resend.client.js';
import type { EmailJobPayload } from './email.types.js';
import { verificationEmailContent } from './templates/verification.js';
import { passwordResetEmailContent } from './templates/password-reset.js';
import { welcomeEmailContent } from './templates/welcome.js';
import {
  appointmentConfirmationContent,
  appointmentReminderContent,
} from './templates/appointment.js';
import { psychiatristApprovalContent } from './templates/psychiatrist-approval.js';

export function isEmailDeliveryConfigured(): boolean {
  return isResendConfigured();
}

export async function sendEmailViaResend(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const client = getResendClient();
  if (!client || !env.smtp.from) {
    throw new AppError(503, 'Email service not configured');
  }

  const { error } = await client.emails.send({
    from: env.smtp.from,
    to: options.to,
    replyTo: env.emailReplyTo || undefined,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  if (error) {
    throw new AppError(502, error.message || 'Failed to send email');
  }

  logServerInfo('email.resend.sent', { to: options.to, subject: options.subject });
}

export async function processEmailJob(payload: EmailJobPayload): Promise<void> {
  const to = payload.email.trim().toLowerCase();
  const meta = payload.meta ?? {};

  if (!isResendConfigured()) {
    await devLogEmailFallback(to, payload.type, `${payload.type} email`);
    return;
  }

  switch (payload.type) {
    case 'EMAIL_VERIFICATION': {
      const code = await redisService.get(emailCodeKeys.verification(payload.userId));
      if (!code) {
        logServerWarn('email.worker.verificationCodeMissing', { userId: payload.userId });
        return;
      }
      const content = verificationEmailContent(code, to);
      await sendEmailViaResend({ to, ...content });
      await redisService.delete(emailCodeKeys.verification(payload.userId));
      return;
    }
    case 'PASSWORD_RESET': {
      const code = await redisService.get(emailCodeKeys.passwordReset(payload.userId));
      if (!code) {
        logServerWarn('email.worker.resetCodeMissing', { userId: payload.userId });
        return;
      }
      const content = passwordResetEmailContent(code);
      await sendEmailViaResend({ to, ...content });
      await redisService.delete(emailCodeKeys.passwordReset(payload.userId));
      return;
    }
    case 'WELCOME_EMAIL': {
      const content = welcomeEmailContent(meta.fullName ?? 'there');
      await sendEmailViaResend({ to, ...content });
      return;
    }
    case 'APPOINTMENT_CONFIRMATION': {
      const content = appointmentConfirmationContent({
        fullName: meta.fullName ?? 'there',
        counselorName: meta.counselorName ?? 'your counselor',
        scheduledAt: meta.scheduledAt ?? '',
        timeLabel: meta.timeLabel ?? '',
      });
      await sendEmailViaResend({ to, ...content });
      return;
    }
    case 'APPOINTMENT_REMINDER': {
      const content = appointmentReminderContent({
        fullName: meta.fullName ?? 'there',
        counselorName: meta.counselorName ?? 'your counselor',
        scheduledAt: meta.scheduledAt ?? '',
        timeLabel: meta.timeLabel ?? '',
      });
      await sendEmailViaResend({ to, ...content });
      return;
    }
    case 'PSYCHIATRIST_APPROVAL': {
      const content = psychiatristApprovalContent({
        fullName: meta.fullName ?? 'Doctor',
        approved: meta.status === 'approved',
        feedback: meta.feedback,
      });
      await sendEmailViaResend({ to, ...content });
      return;
    }
    case 'ACCOUNT_STATUS': {
      const content = psychiatristApprovalContent({
        fullName: meta.fullName ?? 'User',
        approved: meta.status === 'active',
        feedback: meta.feedback,
      });
      await sendEmailViaResend({ to, ...content });
      return;
    }
    default:
      logServerWarn('email.worker.unknownType', { type: (payload as EmailJobPayload).type });
  }
}

export async function devLogEmailFallback(to: string, subject: string, body: string): Promise<void> {
  if (env.nodeEnv === 'production') return;
  logServerInfo('email.dev.fallback', { to, subject, bodyLength: body.length });
}

export function handleEmailWorkerError(jobId: string | undefined, type: string, err: unknown): void {
  logServerError('email.worker.failed', err, { jobId, type });
}
