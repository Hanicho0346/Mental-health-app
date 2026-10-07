"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnv = parseEnv;
const zod_1 = require("zod");
const nodeEnvSchema = zod_1.z.enum([
    'development',
    'production',
    'test',
]);
function boolFromEnv(defaultVal) {
    return zod_1.z
        .union([zod_1.z.boolean(), zod_1.z.string()])
        .optional()
        .transform((v) => {
        if (v === undefined || v === '')
            return defaultVal;
        if (typeof v === 'boolean')
            return v;
        const s = v.toLowerCase();
        if (s === 'true' ||
            s === '1' ||
            s === 'yes') {
            return true;
        }
        if (s === 'false' ||
            s === '0' ||
            s === 'no') {
            return false;
        }
        return defaultVal;
    });
}
const baseEnvSchema = zod_1.z.object({
    NODE_ENV: nodeEnvSchema.default('development'),
    PORT: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(4000),
    MONGODB_URI: zod_1.z.string().min(1),
    JWT_SECRET: zod_1.z.string().min(16),
    JWT_REFRESH_SECRET: zod_1.z
        .string()
        .min(16)
        .optional(),
    JWT_ACCESS_EXPIRES_SEC: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(900),
    JWT_REFRESH_EXPIRES_DAYS: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(30),
    CORS_ORIGINS: zod_1.z
        .string()
        .optional()
        .transform((s) => s
        ?.split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    EMERGENCY_PHONE: zod_1.z
        .string()
        .optional()
        .default(''),
    EMAIL_VERIFICATION_ENABLED: boolFromEnv(false),
    BLOCK_UNVERIFIED_LOGIN: boolFromEnv(false),
    OTP_PEPPER: zod_1.z
        .string()
        .min(8)
        .optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .optional(),
    SMTP_SECURE: boolFromEnv(false),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.preprocess((v) => (v === '' || v === null ? undefined : v), zod_1.z.string().email().optional()),
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().optional(),
    CLOUDINARY_API_KEY: zod_1.z.string().optional(),
    CLOUDINARY_API_SECRET: zod_1.z.string().optional(),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(900_000),
    RATE_LIMIT_MAX: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(300),
    AUTH_RATE_LIMIT_WINDOW_MS: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(900_000),
    AUTH_RATE_LIMIT_MAX: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(40),
    OTP_RATE_LIMIT_WINDOW_MS: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(600_000),
    OTP_RATE_LIMIT_MAX: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(5),
    REDIS_URL: zod_1.z
        .string()
        .min(1)
        .default('redis://127.0.0.1:6379'),
    RESEND_API_KEY: zod_1.z.string().optional(),
    EMAIL_REPLY_TO: zod_1.z.preprocess((v) => (v === '' || v === null ? undefined : v), zod_1.z.string().email().optional()),
    CLIENT_URL: zod_1.z.string().url().optional(),
    SOCKET_CORS_ORIGINS: zod_1.z
        .string()
        .optional()
        .transform((s) => s
        ?.split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(60_000),
    SOCKET_MESSAGE_RATE_LIMIT_MAX: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(60),
    SOCKET_MAX_CONNECTIONS_PER_USER: zod_1.z.coerce
        .number()
        .int()
        .positive()
        .default(3),
    ADMIN_BOOTSTRAP_EMAILS: zod_1.z
        .string()
        .optional()
        .transform((s) => s
        ?.split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)),
    // ADMIN ENV VARIABLES
    ADMIN_EMAIL: zod_1.z
        .string()
        .email()
        .optional(),
    ADMIN_NAME: zod_1.z
        .string()
        .optional(),
});
function parseEnv(processEnv) {
    const parsed = baseEnvSchema.safeParse(processEnv);
    if (!parsed.success) {
        const msg = parsed.error.flatten()
            .fieldErrors;
        throw new Error(`Invalid environment: ${JSON.stringify(msg)}`);
    }
    const d = parsed.data;
    const jwtRefreshSecret = d.JWT_REFRESH_SECRET &&
        d.JWT_REFRESH_SECRET.length >=
            16
        ? d.JWT_REFRESH_SECRET
        : `${d.JWT_SECRET}:refresh`;
    if (d.NODE_ENV ===
        'production' &&
        !processEnv.JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET is required in production');
    }
    if (d.NODE_ENV === 'production') {
        if (!processEnv.REDIS_URL) {
            throw new Error('REDIS_URL is required in production');
        }
        if (!processEnv.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is required in production');
        }
        if (!processEnv.EMAIL_FROM) {
            throw new Error('EMAIL_FROM is required in production');
        }
        const socketOrigins = processEnv.SOCKET_CORS_ORIGINS?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
        const httpOrigins = processEnv.CORS_ORIGINS?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
        if (socketOrigins.length === 0 && httpOrigins.length === 0) {
            throw new Error('SOCKET_CORS_ORIGINS or CORS_ORIGINS is required in production for browser Socket.IO clients');
        }
    }
    assertMongoDbUriPath(d.MONGODB_URI);
    const otpPepper = d.OTP_PEPPER &&
        d.OTP_PEPPER.length >= 8
        ? d.OTP_PEPPER
        : `${d.JWT_SECRET}:otp`;
    return {
        nodeEnv: d.NODE_ENV,
        port: d.PORT,
        mongoUri: d.MONGODB_URI,
        jwtSecret: d.JWT_SECRET,
        jwtRefreshSecret,
        jwtAccessExpiresSec: d.JWT_ACCESS_EXPIRES_SEC,
        jwtRefreshExpiresDays: d.JWT_REFRESH_EXPIRES_DAYS,
        corsOrigins: d.CORS_ORIGINS,
        emergencyPhone: d.EMERGENCY_PHONE?.trim() ??
            '',
        emailVerificationEnabled: d.EMAIL_VERIFICATION_ENABLED,
        blockUnverifiedLogin: d.BLOCK_UNVERIFIED_LOGIN,
        otpPepper,
        smtp: {
            host: d.SMTP_HOST,
            port: d.SMTP_PORT,
            secure: d.SMTP_SECURE,
            user: d.SMTP_USER,
            pass: d.SMTP_PASS,
            from: d.EMAIL_FROM,
        },
        cloudinary: {
            cloudName: d.CLOUDINARY_CLOUD_NAME,
            apiKey: d.CLOUDINARY_API_KEY,
            apiSecret: d.CLOUDINARY_API_SECRET,
        },
        rateLimitWindowMs: d.RATE_LIMIT_WINDOW_MS,
        rateLimitMax: d.RATE_LIMIT_MAX,
        authRateLimitWindowMs: d.AUTH_RATE_LIMIT_WINDOW_MS,
        authRateLimitMax: d.AUTH_RATE_LIMIT_MAX,
        otpRateLimitWindowMs: d.OTP_RATE_LIMIT_WINDOW_MS,
        otpRateLimitMax: d.OTP_RATE_LIMIT_MAX,
        redisUrl: d.REDIS_URL,
        resendApiKey: d.RESEND_API_KEY,
        emailReplyTo: d.EMAIL_REPLY_TO,
        clientUrl: d.CLIENT_URL,
        socketCorsOrigins: d.SOCKET_CORS_ORIGINS,
        socketMessageRateLimitWindowMs: d.SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS,
        socketMessageRateLimitMax: d.SOCKET_MESSAGE_RATE_LIMIT_MAX,
        socketMaxConnectionsPerUser: d.SOCKET_MAX_CONNECTIONS_PER_USER,
        adminBootstrapEmails: d.ADMIN_BOOTSTRAP_EMAILS ??
            [],
        // ADMIN VALUES
        adminEmail: d.ADMIN_EMAIL,
        adminName: d.ADMIN_NAME,
    };
}
function assertMongoDbUriPath(uri) {
    const noQuery = uri.split('?')[0] ?? uri;
    const match = /^mongodb(\+srv)?:\/\/[^/]+\/(.+)$/i.exec(noQuery);
    if (!match)
        return;
    const dbPath = match[2];
    if (dbPath.includes('/')) {
        throw new Error('MONGODB_URI must end with a single database name.');
    }
}
