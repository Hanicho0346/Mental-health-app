import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('socket CORS', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'test-jwt-secret-min-16';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    delete process.env.SOCKET_CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('uses SOCKET_CORS_ORIGINS when set', async () => {
    process.env.SOCKET_CORS_ORIGINS = 'https://app.example.com,https://admin.example.com';
    const { getSocketCorsAllowlist: load } = await import('../../src/config/socket.cors.js');
    expect(load()).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('falls back to CORS_ORIGINS', async () => {
    process.env.CORS_ORIGINS = 'http://localhost:8081';
    vi.resetModules();
    const { getSocketCorsAllowlist: load } = await import('../../src/config/socket.cors.js');
    expect(load()).toEqual(['http://localhost:8081']);
  });

  it('allows missing origin in development with empty allowlist', async () => {
    const { createSocketCorsOriginValidator } = await import('../../src/config/socket.cors.js');
    const validate = createSocketCorsOriginValidator();
    await new Promise<void>((resolve, reject) => {
      validate!(undefined, (err, ok) => {
        try {
          expect(err).toBeNull();
          expect(ok).toBe(true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('rejects unknown origin in production when allowlist is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SOCKET_CORS_ORIGINS = 'https://app.example.com';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-16';
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'noreply@example.com';
    vi.resetModules();
    const { createSocketCorsOriginValidator: loadValidator } = await import(
      '../../src/config/socket.cors.js'
    );
    const validate = loadValidator();

    await new Promise<void>((resolve, reject) => {
      validate!('https://evil.example.com', (err, ok) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(ok).toBeFalsy();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });
});
