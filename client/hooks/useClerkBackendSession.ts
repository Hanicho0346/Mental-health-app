import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useCallback, useState } from 'react';
import { syncClerkWithBackend, type ClerkSyncPayload } from '@/lib/clerkBackendSync';
import { useAuthStore, type AuthUser } from '@/stores/authStore';

function isInvalidClerkSessionError(message: string): boolean {
  return /invalid\s*(or\s*)?expired|invalid token|unauthorized/i.test(message);
}

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 12_000;

/**
 * Waits until Clerk's session is active and getToken() returns a non-null value.
 * Needed because setActive() resolves before React re-renders useSession(),
 * so session from useSession() can still be null while getToken() already works.
 */
async function waitForClerkToken(
  getToken: () => Promise<string | null>
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const token = await getToken();
    if (token) return token;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for Clerk session token. Please try again.');
}

export function useClerkBackendSession() {
  const { isLoaded, getToken } = useAuth();
  const { signOut } = useClerk();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

 const syncSession = useCallback(
  async (
    payload?: ClerkSyncPayload,
    explicitToken?: string   // ← new optional param
  ): Promise<{ user: AuthUser | null; error: string | null }> => {
    if (!isLoaded) {
      const msg = 'Clerk is not ready yet';
      setError(msg);
      return { user: null, error: msg };
    }

    setSyncing(true);
    setError(null);

    try {
      // Use explicit token if provided (e.g. right after OTP verification
      // before useAuth() hook has re-rendered with the new session)
      let token = explicitToken?.trim() ?? null;

      if (!token) {
        token = await waitForClerkToken(() =>
          getToken({ template: 'backend', skipCache: true }).catch(() => null)
        ).catch(() => null);
      }

      if (!token) {
        token = await waitForClerkToken(() =>
          getToken({ skipCache: true }).catch(() => null)
        );
      }

      if (!token?.trim()) {
        throw new Error('Could not obtain a Clerk session token.');
      }

      const result = await syncClerkWithBackend(token, payload);
      return { user: result.user, error: null };
    } catch (e) {
      // ... rest unchanged
    } finally {
      setSyncing(false);
    }
  },
  [isLoaded, getToken]
);

  return { syncSession, syncing, error };
}