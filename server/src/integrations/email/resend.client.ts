import { Resend } from 'resend';
import { env } from '../../config/env.js';

let resend: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!resend) {
    resend = new Resend(env.resendApiKey);
  }
  return resend;
}

export function isResendConfigured(): boolean {
  return Boolean(env.resendApiKey && env.smtp.from);
}
