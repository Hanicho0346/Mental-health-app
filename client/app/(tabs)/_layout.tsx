import { Stack } from 'expo-router';

/** Tab groups: index redirect + (user-tabs) / (psychiatrist-tabs) navigators. */
export default function TabsGroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
