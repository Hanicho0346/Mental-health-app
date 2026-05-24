import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';

/** Preload vector icon fonts so Expo Go does not load empty Ionicons assets at runtime. */
export function useIconFonts(): { fontsReady: boolean; fontError: Error | null } {
  const [loaded, error] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
  });
  return { fontsReady: loaded, fontError: error };
}
