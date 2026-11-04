import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color } from '@neobridge/tokens';

import { LanguageSwitch } from '@/components/language-switch';
import { SyncBanner } from '@/components/sync-banner';
import { fontFamily } from '@/constants/fonts';
import { useSession } from '@/session';

import { roleLabel, useT } from './ui-role';

const LOGO_HEIGHT = 30;

/**
 * Logo + language switch, then who is signed in and the avatar that opens
 * profile and settings (C8). The sync banner (C9) sits underneath.
 */
export function BrandHeader({ banner = true }: { banner?: boolean }) {
  const { me } = useSession();
  const { t } = useT();
  const p = me?.profile;
  const initial = p?.name.trim().charAt(0).toUpperCase() ?? '?';

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
        <Text style={styles.who} numberOfLines={1}>
          <Text style={styles.name}>{p?.name ?? ''}</Text>
          {p ? `  ·  ${roleLabel(t, p)}` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.settings')}
          style={styles.avatar}
          onPress={() => router.push('/settings')}>
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>
      {banner && <SyncBanner />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  who: { flex: 1, fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  name: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.text },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.actionSoft,
    borderWidth: 2,
    borderColor: color.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fontFamily.heading, fontSize: 18, color: color.actionStrong },
});
