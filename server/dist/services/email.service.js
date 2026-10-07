"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailConfigured = isEmailConfigured;
exports.verifyEmailTransport = verifyEmailTransport;
exports.warnIfVerificationEmailDisabled = warnIfVerificationEmailDisabled;
exports.sendVerificationCodeToRegisteredEmail = sendVerificationCodeToRegisteredEmail;
exports.queuePasswordResetEmail = queuePasswordResetEmail;
exports.queueWelcomeEmail = queueWelcomeEmail;
exports.sendMail = sendMail;
const env_js_1 = require("../config/env.js");
const AppError_js_1 = require("../utils/AppError.js");
const logger_js_1 = require("../utils/logger.js");
const redis_service_js_1 = require("../integrations/redis/redis.service.js");
const email_queue_js_1 = require("../queues/email.queue.js");
const email_service_js_1 = require("../integrations/email/email.service.js");
function isEmailConfigured() {
    return (0, email_service_js_1.isEmailDeliveryConfigured)();
}
async function verifyEmailTransport() {
    if (!(0, email_service_js_1.isEmailDeliveryConfigured)()) {
        (0, logger_js_1.logServerWarn)('email: Resend not configured', { hint: 'set RESEND_API_KEY and EMAIL_FROM' });
        return;
    }
    (0, logger_js_1.logServerInfo)('email: Resend configured', { from: env_js_1.env.smtp.from ?? '' });
}
function warnIfVerificationEmailDisabled() {
    if (!env_js_1.env.emailVerificationEnabled)
        return;
    if (isEmailConfigured())
        return;
    (0, logger_js_1.logServerWarn)('email: EMAIL_VERIFICATION_ENABLED but Resend is not configured', {
        hint: 'Set RESEND_API_KEY and EMAIL_FROM in server/.env',
    });
}
/** Queue verification email; OTP plaintext stored in Redis with TTL (not in job payload). */
async function sendVerificationCodeToRegisteredEmail(userId, registeredEmail, code) {
    const to = registeredEmail.trim().toLowerCase();
    await redis_service_js_1.redisService.setWithTTL(redis_service_js_1.emailCodeKeys.verification(userId), code, 15 * 60);
    const queued = await (0, email_queue_js_1.enqueueEmailJob)({ type: 'EMAIL_VERIFICATION', userId, email: to }, `email-verify-${userId}`);
    if (!queued) {
        if (env_js_1.env.nodeEnv !== 'production') {
            await (0, email_service_js_1.devLogEmailFallback)(to, 'Verify your email', 'verification email (queue unavailable)');
        }
        else {
            throw new AppError_js_1.AppError(503, 'Email queue unavailable');
        }
    }
}
async function queuePasswordResetEmail(userId, email, code) {
    const to = email.trim().toLowerCase();
    await redis_service_js_1.redisService.setWithTTL(redis_service_js_1.emailCodeKeys.passwordReset(userId), code, 60 * 60);
    const queued = await (0, email_queue_js_1.enqueueEmailJob)({ type: 'PASSWORD_RESET', userId, email: to }, `password-reset-${userId}`);
    if (!queued) {
        if (env_js_1.env.nodeEnv !== 'production') {
            await (0, email_service_js_1.devLogEmailFallback)(to, 'Password reset', 'reset email (queue unavailable)');
        }
        else {
            throw new AppError_js_1.AppError(503, 'Email queue unavailable');
        }
    }
}
async function queueWelcomeEmail(userId, email, fullName) {
    await (0, email_queue_js_1.enqueueEmailJob)({ type: 'WELCOME_EMAIL', userId, email, meta: { fullName } }, `welcome-${userId}`);
}
/** @deprecated Use queue-specific helpers. Kept for compatibility during migration. */
async function sendMail(options, opts) {
    (0, logger_js_1.logServerWarn)('email.sendMail.deprecated', { subject: options.subject });
    if (env_js_1.env.nodeEnv !== 'production') {
        await (0, email_service_js_1.devLogEmailFallback)(options.to, options.subject, options.text);
        return;
    }
    if (opts?.required) {
        throw new AppError_js_1.AppError(503, 'Direct email send is disabled; use queued email jobs');
    }
}
