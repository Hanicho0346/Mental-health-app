import { useAuthStore } from "@/stores/authStore";
import { Redirect } from "expo-router";

/**
 * This layout acts as a role-based router.
 * Psychiatrists go to (psychiatrist-tabs), users go to (user-tabs).
 * Each sub-group has its own Tabs navigator and auth guard.
 */
export default function TabsGroupLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return <Redirect href="/login" />;
  }

  if (user?.role === "psychiatrist") {
    return <Redirect href="/(tabs)/(psychiatrist-tabs)/dashboard" />;
  }

  return <Redirect href="/(tabs)/(user-tabs)/home" />;
}
