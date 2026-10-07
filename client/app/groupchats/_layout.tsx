import { Stack } from "expo-router";

export default function GroupChatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[groupId]" />
    </Stack>
  );
}
