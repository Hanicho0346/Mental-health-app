import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../types/roles.js';

export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  /** email_verified */
  ev: boolean;
  typ: 'access';
};

export function signAccessToken(parts: { sub: string; role: UserRole; emailVerified: boolean }): string {
  const payload: AccessTokenPayload = {
    sub: parts.sub,
    role: parts.role,
    ev: parts.emailVerified,
    typ: 'access',
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresSec });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret);
  if (typeof payload === 'string' || !payload || typeof payload !== 'object') {
    throw new Error('Invalid token payload');
  }
  const p = payload as Record<string, unknown>;
  if (p.typ === 'access' && typeof p.sub === 'string' && typeof p.role === 'string' && typeof p.ev === 'boolean') {
    return { sub: p.sub, role: p.role as UserRole, ev: p.ev, typ: 'access' };
  }
  /** Legacy tokens issued before RBAC payload (treat as verified end-user). */
  if (typeof p.sub === 'string' && p.typ === undefined) {
    return { sub: p.sub, role: 'user', ev: true, typ: 'access' };
  }
  throw new Error('Invalid access token shape');
}
