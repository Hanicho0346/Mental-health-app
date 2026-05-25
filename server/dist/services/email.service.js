"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailConfigured = isEmailConfigured;
exports.verifyEmailTransport = verifyEmailTransport;
exports.warnIfVerificationEmailDisabled = warnIfVerificationEmailDisabled;
exports.sendVerificationCodeToRegisteredEmail = sendVerificationCodeToRegisteredEmail;
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_js_1 = require("../config/env.js");
const AppError_js_1 = require("../utils/AppError.js");
const logger_js_1 = require("../utils/logger.js");
let transporter = null;
function getTransporter() {
    const { host, port, user, pass, from } = env_js_1.env.smtp;
    if (!host || !user || !pass?.trim() || !from) {
        return null;
    }
    if (!transporter) {
        transporter = nodemailer_1.default.createTransport({
            host,
            port: port ?? 587,
            secure: env_js_1.env.smtp.secure,
            auth: { user, pass: pass.trim() },
        });
    }
    return transporter;
}
function isEmailConfigured() {
    return getTransporter() !== null;
}
async function verifyEmailTransport() {
    const t = getTransporter();
    if (!t)
        return;
    await t.verify();
}
function warnIfVerificationEmailDisabled() {
    if (!env_js_1.env.emailVerificationEnabled)
        return;
    if (isEmailConfigured())
        return;
    (0, logger_js_1.logServerWarn)('email: EMAIL_VERIFICATION_ENABLED but SMTP is incomplete', {
        hint: 'Set SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM in server/.env',
    });
}
/** Sends a 6-digit code to the address the user registered with (not the SMTP account). */
async function sendVerificationCodeToRegisteredEmail(registeredEmail, code) {
    const to = registeredEmail.trim().toLowerCase();
    const text = `Your verification code is: ${code}. It expires in 15 minutes.`;
    const html = `
    <p>Hello,</p>
    <p>Use this code to verify <strong>${escapeHtml(to)}</strong>:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
    <p>This code expires in 15 minutes.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `.trim();
    await sendMail({
        to,
        subject: 'Verify your email',
        text,
        html,
    }, { required: env_js_1.env.nodeEnv === 'production' });
}
async function sendMail(options, opts) {
    const to = options.to.trim().toLowerCase();
    const t = getTransporter();
    const from = env_js_1.env.smtp.from;
    if (!t || !from) {
        if (opts?.required) {
            throw new AppError_js_1.AppError(503, 'Could not send email. Add SMTP_PASS (Gmail app password) to server/.env and restart the server.');
        }
        (0, logger_js_1.logServerWarn)('email: SMTP not configured; skipping send', { to, subject: options.subject });
        if (env_js_1.env.nodeEnv !== 'production') {
            (0, logger_js_1.logServerInfo)('email: dev fallback — full message (configure SMTP_* and EMAIL_FROM to send real mail)', {
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
        (0, logger_js_1.logServerInfo)('email: sent to registered address', { to, subject: options.subject });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('email: send failed', err, { to, subject: options.subject });
        throw new AppError_js_1.AppError(503, 'Failed to send email. Check SMTP_USER and SMTP_PASS in server/.env.');
    }
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
