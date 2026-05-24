import { Stack } from "expo-router";

/**
 * Stack navigator for chat routes within (psychiatrist-tabs)
 * Keeps tab bar visible while navigating between lobby and [peer]
 */
export default function PsychiatristChatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[peer]" />
    </Stack>
  );
}
