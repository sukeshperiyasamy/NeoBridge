import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';
import { useSession } from '@/session';

const LOGO_HEIGHT = 30;

/** NeoBridge logo, who is signed in, and log out. Top of every dashboard. */
export function BrandHeader() {
  const { account, signOut } = useSession();

  return (
    <View style={styles.header}>
      <Image
        source={require('@/assets/images/neobridge-logo.png')}
        style={{ height: LOGO_HEIGHT, width: (LOGO_HEIGHT * 1261) / 355 }}
        contentFit="contain"
        accessibilityLabel="NeoBridge"
      />
      <View style={styles.who}>
        <Text style={styles.name}>{account?.name}</Text>
        <Text style={styles.role}>{account?.labelLocal}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        style={styles.logout}
        onPress={() => {
          signOut();
          router.replace('/login');
        }}>
        <Text style={styles.logoutText}>लॉग आउट</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  who: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  name: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: color.text,
  },
  role: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: color.textMuted,
  },
  logout: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  logoutText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 14,
    color: color.action,
  },
});
