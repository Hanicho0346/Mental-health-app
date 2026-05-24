import { useAuth } from '@clerk/clerk-expo';
import { resolvePostAuthRoute } from '@/lib/sessionRouting';
import { useAuthStore } from '@/stores/authStore';
import { useAuthHydrated } from '@/lib/auth';
import { useClerkBackendSession } from '@/hooks/useClerkBackendSession';
import { Redirect } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, TouchableOpacity } from 'react-native';

const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
);

export default function TabsGroupLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { syncSession } = useClerkBackendSession();
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempted, setSyncAttempted] = useState(false);

  useEffect(() => {
    if (!authHydrated || !isLoaded || !isSignedIn || accessToken || syncAttempted) {
      return;
    }

    setSyncAttempted(true);
    setSyncState('syncing');
    setSyncError(null);

    void syncSession()
      .then(({ user: syncedUser, error }) => {
        if (!syncedUser) {
          setSyncState('error');
          setSyncError(error ?? 'Unable to restore your session. Please try again.');
        } else {
          setSyncState('idle');
        }
      })
      .catch((error) => {
        setSyncState('error');
        setSyncError(error instanceof Error ? error.message : String(error));
      });
  }, [authHydrated, isLoaded, isSignedIn, accessToken, syncAttempted, syncSession]);

  const retrySync = () => {
    setSyncAttempted(false);
    setSyncState('idle');
    setSyncError(null);
  };

  const isInvalidSessionError = /invalid\s*(or\s*)?expired|invalid token|unauthorized/i.test(syncError ?? '');
  const isLoading = !authHydrated || !isLoaded || (isSignedIn && !accessToken && syncState === 'syncing');

  if (isLoading) return <LoadingScreen />;
  if (!isSignedIn || isInvalidSessionError) return <Redirect href="/login" />;
  if (syncState === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, marginBottom: 16, textAlign: 'center' }}>
          {syncError ?? 'Unable to restore your session.'}
        </Text>
        <TouchableOpacity
          onPress={retrySync}
          style={{ backgroundColor: '#4ADE80', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 }}
        >
          <Text style={{ color: '#111827', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!accessToken) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  return <Redirect href={resolvePostAuthRoute(user)} />;
}
