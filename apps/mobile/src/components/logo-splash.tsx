import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { color } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';

/** Shown under the logo when set, e.g. "Test build 1" (EXPO_PUBLIC_BUILD_LABEL). */
const BUILD_LABEL = process.env.EXPO_PUBLIC_BUILD_LABEL ?? '';

const SHOW_MS = 1_200;
const FADE_MS = 350;

/**
 * The full NeoBridge logo over the app for a moment at start-up. Android 12+
 * only shows the round launcher mark as its native splash, so this follows it
 * on the same white, then fades away.
 */
export function LogoSplash() {
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.92));
  const [gone, setGone] = useState(false);

  useEffect(() => {
    Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setGone(true));
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [opacity, scale]);

  if (gone) return null;
  return (
    <Animated.View style={[styles.screen, { opacity }]} pointerEvents="none" accessibilityLabel="NeoBridge">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={require('@/assets/images/neobridge-logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
      </Animated.View>
      {BUILD_LABEL !== '' && <Text style={styles.label}>{BUILD_LABEL}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  logo: { width: 260, height: (260 * 355) / 1261 },
  label: { fontFamily: fontFamily.bodyBold, fontSize: 14, color: color.textMuted, letterSpacing: 0.5 },
});
