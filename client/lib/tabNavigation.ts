import type { AuthUser } from "@/stores/authStore";
import { resolvePostAuthRoute } from "@/lib/sessionRouting";

export function isPsychiatrist(user: AuthUser | null | undefined): boolean {
  return user?.role === "psychiatrist";
}

/** Default route after login for the current role and approval state. */
export function getDefaultTabRoute(user: AuthUser | null | undefined) {
  return resolvePostAuthRoute(user);
}
