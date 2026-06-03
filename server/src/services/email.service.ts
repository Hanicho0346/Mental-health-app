import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logServerError, logServerInfo, logServerWarn } from '../utils/logger.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const { host, port, user, pass, from } = env.smtp;
  if (!host || !user || !pass?.trim() || !from) {
    return null;
  }
  if (!transporter) {
   transporter = nodemailer.createTransport({
  host,
  port: 465,
  secure: true,
  auth: {
    user,
    pass: pass.trim(),
  },
  tls: {
    family: 4,
  },
});
  }
  return transporter;
}

export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}

export async function verifyEmailTransport(): Promise<void> {
  const t = getTransporter();
  if (!t) {
    logServerWarn('email: transporter not created — SMTP_HOST/USER/PASS/FROM missing or blank');
    return;
  }
  try {
    await t.verify();
    logServerInfo('email: SMTP connection verified OK', { host: env.smtp.host, port: env.smtp.port });
  } catch (err) {
    logServerError('email: SMTP verify failed — emails will NOT send', err, {
      host: env.smtp.host,
      port: env.smtp.port,
      user: env.smtp.user,
      secure: env.smtp.secure,
    });
  }
}

export function warnIfVerificationEmailDisabled(): void {
  if (!env.emailVerificationEnabled) return;
  if (isEmailConfigured()) return;
  logServerWarn('email: EMAIL_VERIFICATION_ENABLED but SMTP is incomplete', {
    hint: 'Set SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM in server/.env',
  });
}

/** Sends a 6-digit code to the address the user registered with (not the SMTP account). */
export async function sendVerificationCodeToRegisteredEmail(
  registeredEmail: string,
  code: string
): Promise<void> {
  const to = registeredEmail.trim().toLowerCase();
  const text = `Your verification code is: ${code}. It expires in 15 minutes.`;
  const html = `
    <p>Hello,</p>
    <p>Use this code to verify <strong>${escapeHtml(to)}</strong>:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `.trim();

  await sendMail(
    {
      to,
      subject: 'Verify your email',
      text,
      html,
    },
    { required: false }
  );
}

export async function sendMail(
  options: { to: string; subject: string; text: string; html?: string },
  opts?: { required?: boolean }
): Promise<void> {
  const to = options.to.trim().toLowerCase();
  const t = getTransporter();
  const from = env.smtp.from;
  if (!t || !from) {
    if (opts?.required) {
      throw new AppError(
        503,
        'Could not send email. Add SMTP_PASS (Gmail app password) to server/.env and restart the server.'
      );
    }
    logServerWarn('email: SMTP not configured; skipping send', { to, subject: options.subject });
    if (env.nodeEnv !== 'production') {
      logServerInfo('email: dev fallback — full message (configure SMTP_* and EMAIL_FROM to send real mail)', {
        to,
        subject: options.subject,
        body: options.text,
      });
    }
    return;
  }

  try {
    await t.sendMail({
      from,
      to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? `<pre>${escapeHtml(options.text)}</pre>`,
    });
    logServerInfo('email: sent to registered address', { to, subject: options.subject });
  } catch (err) {
    logServerError('email: send failed', err, { to, subject: options.subject });
    if (opts?.required) {
      throw new AppError(503, 'Failed to send email. Check SMTP_USER and SMTP_PASS in server/.env.');
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
