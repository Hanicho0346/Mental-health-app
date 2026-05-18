import { Stack } from 'expo-router';

export default function ChatRoomLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[peer]" />
    </Stack>
  );
}
