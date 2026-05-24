import { createClerkClient, verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

export function isClerkConfigured(): boolean {
  return Boolean(env.clerkSecretKey && env.clerkSecretKey.length > 0);
}

export function getClerkClient(): ReturnType<typeof createClerkClient> {
  if (!isClerkConfigured()) {
    throw new AppError(503, 'Clerk authentication is not configured on the server');
  }
  if (!clerkClient) {
    clerkClient = createClerkClient({ secretKey: env.clerkSecretKey! });
  }
  return clerkClient;
}

export type VerifiedClerkSession = {
  clerkId: string;
  email: string;
  fullName: string;
  profileImage: string;
};

export async function verifyClerkSessionToken(token: string): Promise<VerifiedClerkSession> {
  if (!isClerkConfigured()) {
    throw new AppError(503, 'Clerk authentication is not configured on the server');
  }
  try {
    const payload = await verifyToken(token, {
  secretKey: env.clerkSecretKey!,
  clockSkewInMs: 15_000,
});
    const clerkId = payload.sub;
    if (!clerkId) {
      throw new AppError(401, 'Invalid Clerk token');
    }
    const client = getClerkClient();
    const user = await client.users.getUser(clerkId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress;
    if (!email) {
      throw new AppError(400, 'Clerk account has no email address');
    }
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0]!;
    return {
      clerkId,
      email: email.toLowerCase(),
      fullName,
      profileImage: user.imageUrl ?? '',
    };
  }  catch (err) {
    if (err instanceof AppError) throw err;
    // TEMPORARY — remove after debugging
    console.error('[clerk.verify] raw error:', err);
    throw new AppError(401, 'Invalid or expired Clerk session');
  }
}
