import { Pressable, StyleSheet, Text } from 'react-native';

import type { Bilingual } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';
import { dial } from '@/dial';

/** Large call button (Figma: Call Sunita, 102). Tapping opens the dialer. */
export function CallButton({
  label,
  phone,
  tone = 'action',
}: {
  label: Bilingual;
  phone: string;
  tone?: 'action' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={phone}
      onPress={() => dial(phone)}
      style={({ pressed }) => [
        styles.button,
        tone === 'danger' && styles.danger,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.title}>{label.text}</Text>
      {label.gloss && <Text style={styles.gloss}>{label.gloss}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.callButton,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: color.action,
  },
  danger: { backgroundColor: '#a82820' },
  pressed: { opacity: 0.85 },
  title: { fontFamily: fontFamily.heading, fontSize: 21, lineHeight: 28, color: color.surface },
  gloss: { fontFamily: fontFamily.body, fontSize: 13, color: color.actionOnDark },
});
