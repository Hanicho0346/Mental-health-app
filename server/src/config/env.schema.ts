import { z } from 'zod';

const nodeEnvSchema = z.enum([
  'development',
  'production',
  'test',
]);

function boolFromEnv(defaultVal: boolean) {
  return z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return defaultVal;

      if (typeof v === 'boolean') return v;

      const s = v.toLowerCase();

      if (
        s === 'true' ||
        s === '1' ||
        s === 'yes'
      ) {
        return true;
      }

      if (
        s === 'false' ||
        s === '0' ||
        s === 'no'
      ) {
        return false;
      }

      return defaultVal;
    });
}

const baseEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  MONGODB_URI: z.string().min(1),

  JWT_SECRET: z.string().min(16),

  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .optional(),

  JWT_ACCESS_EXPIRES_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(1800),

  JWT_REFRESH_EXPIRES_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),

  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((s) =>
      s
        ?.split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),

  EMERGENCY_PHONE: z
    .string()
    .optional()
    .default(''),

  EMAIL_VERIFICATION_ENABLED:
    boolFromEnv(false),

  BLOCK_UNVERIFIED_LOGIN:
    boolFromEnv(false),

  OTP_PEPPER: z
    .string()
    .min(8)
    .optional(),

  SMTP_HOST: z.string().optional(),

  SMTP_PORT: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  SMTP_SECURE: boolFromEnv(false),

  SMTP_USER: z.string().optional(),

  SMTP_PASS: z.string().optional(),

  EMAIL_FROM: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().email().optional(),
  ),

  CLOUDINARY_CLOUD_NAME:
    z.string().optional(),

  CLOUDINARY_API_KEY:
    z.string().optional(),

  CLOUDINARY_API_SECRET:
    z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),

  RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(300),

  AUTH_RATE_LIMIT_WINDOW_MS:
    z.coerce
      .number()
      .int()
      .positive()
      .default(900_000),

  AUTH_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(40),

  OTP_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(600_000),

  OTP_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(5),

  REDIS_URL: z
    .string()
    .min(1)
    .default('redis://127.0.0.1:6379'),

  RESEND_API_KEY: z.string().optional(),

  EMAIL_REPLY_TO: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().email().optional(),
  ),

  CLIENT_URL: z.string().url().optional(),

  SOCKET_CORS_ORIGINS: z
    .string()
    .optional()
    .transform((s) =>
      s
        ?.split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),

  SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),

  SOCKET_MESSAGE_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(60),

  SOCKET_MAX_CONNECTIONS_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(3),

  ADMIN_BOOTSTRAP_EMAILS: z
    .string()
    .optional()
    .transform((s) =>
      s
        ?.split(',')
        .map((x) =>
          x.trim().toLowerCase()
        )
        .filter(Boolean)
    ),

  // ADMIN ENV VARIABLES
  ADMIN_EMAIL: z
    .string()
    .email()
    .optional(),

  ADMIN_NAME: z
    .string()
    .optional(),
});

export type AppEnv = {
  nodeEnv: z.infer<
    typeof nodeEnvSchema
  >;

  port: number;

  mongoUri: string;

  jwtSecret: string;

  jwtRefreshSecret: string;

  jwtAccessExpiresSec: number;

  jwtRefreshExpiresDays: number;

  corsOrigins:
    | string[]
    | undefined;

  emergencyPhone: string;

  emailVerificationEnabled: boolean;

  blockUnverifiedLogin: boolean;

  otpPepper: string;

  smtp: {
    host?: string;
    port?: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };

  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };

  rateLimitWindowMs: number;

  rateLimitMax: number;

  authRateLimitWindowMs: number;

  authRateLimitMax: number;

  otpRateLimitWindowMs: number;

  otpRateLimitMax: number;

  redisUrl: string;

  resendApiKey?: string;

  emailReplyTo?: string;

  clientUrl?: string;

  socketCorsOrigins?: string[];

  socketMessageRateLimitWindowMs: number;

  socketMessageRateLimitMax: number;

  socketMaxConnectionsPerUser: number;

  adminBootstrapEmails: string[];

  // ADMIN TYPES
  adminEmail?: string;

  adminName?: string;
};

export function parseEnv(
  processEnv: NodeJS.ProcessEnv
): AppEnv {
  const parsed =
    baseEnvSchema.safeParse(
      processEnv
    );

  if (!parsed.success) {
    const msg =
      parsed.error.flatten()
        .fieldErrors;

    throw new Error(
      `Invalid environment: ${JSON.stringify(
        msg
      )}`
    );
  }

  const d = parsed.data;

  const jwtRefreshSecret =
    d.JWT_REFRESH_SECRET &&
    d.JWT_REFRESH_SECRET.length >=
      16
      ? d.JWT_REFRESH_SECRET
      : `${d.JWT_SECRET}:refresh`;

  if (
    d.NODE_ENV ===
      'production' &&
    !processEnv.JWT_REFRESH_SECRET
  ) {
    throw new Error(
      'JWT_REFRESH_SECRET is required in production'
    );
  }

  if (d.NODE_ENV === 'production') {
    if (!processEnv.REDIS_URL) {
      throw new Error('REDIS_URL is required in production');
    }
    if (!processEnv.RESEND_API_KEY) {
      // RESEND_API_KEY is optional — emails will be skipped if not set.
      // A warning is logged at startup by the email service.
    }
    if (!processEnv.EMAIL_FROM) {
      // EMAIL_FROM is optional when RESEND_API_KEY is not set.
    }
    const socketOrigins =
      processEnv.SOCKET_CORS_ORIGINS?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
    const httpOrigins =
      processEnv.CORS_ORIGINS?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
    if (socketOrigins.length === 0 && httpOrigins.length === 0) {
      throw new Error(
        'SOCKET_CORS_ORIGINS or CORS_ORIGINS is required in production for browser Socket.IO clients',
      );
    }
  }

  assertMongoDbUriPath(
    d.MONGODB_URI
  );

  const otpPepper =
    d.OTP_PEPPER &&
    d.OTP_PEPPER.length >= 8
      ? d.OTP_PEPPER
      : `${d.JWT_SECRET}:otp`;

  return {
    nodeEnv: d.NODE_ENV,

    port: d.PORT,

    mongoUri: d.MONGODB_URI,

    jwtSecret: d.JWT_SECRET,

    jwtRefreshSecret,

    jwtAccessExpiresSec:
      d.JWT_ACCESS_EXPIRES_SEC,

    jwtRefreshExpiresDays:
      d.JWT_REFRESH_EXPIRES_DAYS,

    corsOrigins: d.CORS_ORIGINS,

    emergencyPhone:
      d.EMERGENCY_PHONE?.trim() ??
      '',

    emailVerificationEnabled:
      d.EMAIL_VERIFICATION_ENABLED,

    blockUnverifiedLogin:
      d.BLOCK_UNVERIFIED_LOGIN,

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
      cloudName:
        d.CLOUDINARY_CLOUD_NAME,
      apiKey:
        d.CLOUDINARY_API_KEY,
      apiSecret:
        d.CLOUDINARY_API_SECRET,
    },

    rateLimitWindowMs:
      d.RATE_LIMIT_WINDOW_MS,

    rateLimitMax:
      d.RATE_LIMIT_MAX,

    authRateLimitWindowMs:
      d.AUTH_RATE_LIMIT_WINDOW_MS,

    authRateLimitMax:
      d.AUTH_RATE_LIMIT_MAX,

    otpRateLimitWindowMs:
      d.OTP_RATE_LIMIT_WINDOW_MS,

    otpRateLimitMax:
      d.OTP_RATE_LIMIT_MAX,

    redisUrl: d.REDIS_URL,

    resendApiKey: d.RESEND_API_KEY,

    emailReplyTo: d.EMAIL_REPLY_TO,

    clientUrl: d.CLIENT_URL,

    socketCorsOrigins: d.SOCKET_CORS_ORIGINS,

    socketMessageRateLimitWindowMs: d.SOCKET_MESSAGE_RATE_LIMIT_WINDOW_MS,

    socketMessageRateLimitMax: d.SOCKET_MESSAGE_RATE_LIMIT_MAX,

    socketMaxConnectionsPerUser: d.SOCKET_MAX_CONNECTIONS_PER_USER,

    adminBootstrapEmails:
      d.ADMIN_BOOTSTRAP_EMAILS ??
      [],

    // ADMIN VALUES
    adminEmail:
      d.ADMIN_EMAIL,

    adminName:
      d.ADMIN_NAME,
  };
}

function assertMongoDbUriPath(
  uri: string
): void {
  const noQuery =
    uri.split('?')[0] ?? uri;

  const match =
    /^mongodb(\+srv)?:\/\/[^/]+\/(.+)$/i.exec(
      noQuery
    );

  if (!match) return;

  const dbPath = match[2];

  if (dbPath.includes('/')) {
    throw new Error(
      'MONGODB_URI must end with a single database name.'
    );
  }
}