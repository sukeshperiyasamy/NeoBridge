import { Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Mukta_400Regular, Mukta_600SemiBold, Mukta_700Bold } from '@expo-google-fonts/mukta';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { color } from '@neobridge/tokens';

import { setOnFetched } from '@/api/cache';
import { getOutbox } from '@/api/outbox';
import { LanguageProvider } from '@/language';
import { setupNotifications } from '@/notify';
import { SessionProvider } from '@/session';

SplashScreen.preventAutoHideAsync();
setOnFetched(() => getOutbox().markSynced());

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Mukta_400Regular,
    Mukta_600SemiBold,
    Mukta_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    void setupNotifications().catch(() => undefined);
  }, []);

  if (!loaded && !error) return null;

  return (
    <LanguageProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }} />
      </SessionProvider>
    </LanguageProvider>
  );
}
