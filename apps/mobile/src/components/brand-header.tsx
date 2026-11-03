import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pick, t } from '@neobridge/i18n';
import { color, radius } from '@neobridge/tokens';

import { LanguageSwitch } from '@/components/language-switch';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';
import { useSession } from '@/session';

const LOGO_HEIGHT = 30;

/** Logo + language switch, then who is signed in + log out. Top of every dashboard. */
export function BrandHeader() {
  const { account, signOut } = useSession();
  const [lang] = useLanguage();

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Image
          source={require('@/assets/images/neobridge-logo.png')}
          style={{ height: LOGO_HEIGHT, width: (LOGO_HEIGHT * 1261) / 355 }}
          contentFit="contain"
          accessibilityLabel="NeoBridge"
        />
        <LanguageSwitch />
      </View>
      <View style={styles.row}>
        <Text style={styles.who}>
          <Text style={styles.name}>{account ? pick(lang, account.name) : ''}</Text>
          {account ? `  ·  ${pick(lang, account.label)}` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.logout}
          onPress={() => {
            signOut();
            router.replace('/login');
          }}>
          <Text style={styles.logoutText}>{t(lang, 'logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  who: { flex: 1, fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  name: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.text },
  logout: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  logoutText: { fontFamily: fontFamily.bodyBold, fontSize: 14, color: color.action },
});
