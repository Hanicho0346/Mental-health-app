import type { CorsOptions } from 'cors';
import { env } from './env.js';

/** Allowed browser origins for Socket.IO (falls back to HTTP CORS_ORIGINS). */
export function getSocketCorsAllowlist(): string[] {
  const fromSocket = env.socketCorsOrigins ?? [];
  if (fromSocket.length > 0) return fromSocket;
  return env.corsOrigins ?? [];
}

/**
 * Socket.IO CORS — never uses `origin: "*"` in production.
 * Native mobile clients often omit Origin; those connections rely on bearer token auth.
 */
export function createSocketCorsOriginValidator(): CorsOptions['origin'] {
  const allowlist = getSocketCorsAllowlist();

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.nodeEnv !== 'production' && allowlist.length === 0) {
      callback(null, true);
      return;
    }

    if (allowlist.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Socket CORS: origin not allowed'));
  };
}
