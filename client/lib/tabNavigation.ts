import type { AuthUser } from "@/stores/authStore";

export function isPsychiatrist(user: AuthUser | null | undefined): boolean {
  return user?.role === "psychiatrist";
}

/** Default tab route after login for the current role. */
export function getDefaultTabRoute(
  user: AuthUser | null | undefined,
): "/(tabs)/(psychiatrist-tabs)/dashboard" | "/(tabs)/(user-tabs)/home" {
  if (user?.role === "psychiatrist") {
    return "/(tabs)/(psychiatrist-tabs)/dashboard";
  }
  return "/(tabs)/(user-tabs)/home";
}
