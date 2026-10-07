import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logServerInfo, logServerWarn } from '../utils/logger.js';
import { emailCodeKeys, redisService } from '../integrations/redis/redis.service.js';
import { enqueueEmailJob } from '../queues/email.queue.js';
import {
  devLogEmailFallback,
  isEmailDeliveryConfigured,
} from '../integrations/email/email.service.js';

export function isEmailConfigured(): boolean {
  return isEmailDeliveryConfigured();
}

export async function verifyEmailTransport(): Promise<void> {
  if (!isEmailDeliveryConfigured()) {
    logServerWarn('email: Resend not configured', { hint: 'set RESEND_API_KEY and EMAIL_FROM' });
    return;
  }
  logServerInfo('email: Resend configured', { from: env.smtp.from ?? '' });
}

export function warnIfVerificationEmailDisabled(): void {
  if (!env.emailVerificationEnabled) return;
  if (isEmailConfigured()) return;
  logServerWarn('email: EMAIL_VERIFICATION_ENABLED but Resend is not configured', {
    hint: 'Set RESEND_API_KEY and EMAIL_FROM in server/.env',
  });
}

/** Queue verification email; OTP plaintext stored in Redis with TTL (not in job payload). */
export async function sendVerificationCodeToRegisteredEmail(
  userId: string,
  registeredEmail: string,
  code: string,
): Promise<void> {
  const to = registeredEmail.trim().toLowerCase();
  await redisService.setWithTTL(emailCodeKeys.verification(userId), code, 15 * 60);

  const queued = await enqueueEmailJob(
    { type: 'EMAIL_VERIFICATION', userId, email: to },
    `email-verify-${userId}`,
  );

  if (!queued) {
    if (env.nodeEnv !== 'production') {
      await devLogEmailFallback(to, 'Verify your email', 'verification email (queue unavailable)');
    } else {
      throw new AppError(503, 'Email queue unavailable');
    }
  }
}

export async function queuePasswordResetEmail(
  userId: string,
  email: string,
  code: string,
): Promise<void> {
  const to = email.trim().toLowerCase();
  await redisService.setWithTTL(emailCodeKeys.passwordReset(userId), code, 60 * 60);

  const queued = await enqueueEmailJob(
    { type: 'PASSWORD_RESET', userId, email: to },
    `password-reset-${userId}`,
  );

  if (!queued) {
    if (env.nodeEnv !== 'production') {
      await devLogEmailFallback(to, 'Password reset', 'reset email (queue unavailable)');
    } else {
      throw new AppError(503, 'Email queue unavailable');
    }
  }
}

export async function queueWelcomeEmail(userId: string, email: string, fullName: string): Promise<void> {
  await enqueueEmailJob(
    { type: 'WELCOME_EMAIL', userId, email, meta: { fullName } },
    `welcome-${userId}`,
  );
}

/** @deprecated Use queue-specific helpers. Kept for compatibility during migration. */
export async function sendMail(
  options: { to: string; subject: string; text: string; html?: string },
  opts?: { required?: boolean },
): Promise<void> {
  logServerWarn('email.sendMail.deprecated', { subject: options.subject });
  if (env.nodeEnv !== 'production') {
    await devLogEmailFallback(options.to, options.subject, options.text);
    return;
  }
  if (opts?.required) {
    throw new AppError(503, 'Direct email send is disabled; use queued email jobs');
  }
}
