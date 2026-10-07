import mongoose from 'mongoose';
import { verifyAccessToken } from './jwt.js';
import type { UserRole } from '../types/roles.js';

export type ResolvedAuth = {
  userId: string;
  role: UserRole;
  emailVerified: boolean;
};

/** Resolve identity from a backend access JWT (`sub` = MongoDB User._id). */
export async function resolveUserIdFromBearerToken(
  token: string,
): Promise<ResolvedAuth | null> {
  if (!token?.trim()) return null;

  try {
    const { sub, role, ev } = verifyAccessToken(token);
    if (!mongoose.Types.ObjectId.isValid(sub)) return null;
    return { userId: sub, role, emailVerified: ev };
  } catch {
    return null;
  }
}

export function extractBearerToken(
  authorization?: string,
  handshakeAuth?: { token?: string },
): string | undefined {
  if (handshakeAuth?.token?.trim()) return handshakeAuth.token.trim();
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return undefined;
}
