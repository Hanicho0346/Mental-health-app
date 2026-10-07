import { Alert, Platform } from 'react-native';

/** Cross-platform alert — RN Alert is a no-op on many web builds. */
export function showAlert(title: string, message?: string): void {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(text);
    }
    return;
  }
  Alert.alert(title, message);
}

/** Cross-platform confirmation dialog */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText = 'Confirm'
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`${title}\n\n${message}`);
      if (ok) {
        void onConfirm();
      }
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmText,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}
