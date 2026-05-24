import { Stack } from "expo-router";

/**
 * Stack navigator for chat routes within (user-tabs)
 * Keeps tab bar visible while navigating between lobby and [peer]
 */
export default function UserChatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[peer]" />
    </Stack>
  );
}
