import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { color } from '@neobridge/tokens';

import { useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { useSettings } from '@/language';
import { useSession } from '@/session';

/** C1: splash. Logo and version while the stored session is checked, then the role's home. */
export default function Splash() {
  const { status, me } = useSession();
  const [settings, , ready] = useSettings();
  const { t } = useT();

  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'signedIn' && me && ready) {
    if (!settings.primerDone) return <Redirect href="/permissions" />;
    const role = me.profile.role === 'admin' ? 'doctor' : me.profile.role;
    return <Redirect href={`/${role}`} />;
  }

  return (
    <View style={styles.screen}>
      <Image
        source={require('@/assets/images/neobridge-logo.png')}
        style={{ height: 56, width: (56 * 1261) / 355 }}
        contentFit="contain"
        accessibilityLabel="NeoBridge"
      />
      <ActivityIndicator color={color.action} />
      <Text style={styles.version}>{t('splash.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: color.background },
  version: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
});
