import { Pressable, StyleSheet, Text } from 'react-native';

import { color } from '@neobridge/tokens';

import { dial } from '@/dial';

/** Round outlined phone button for list rows. Tapping opens the dialer. */
export function CallIconButton({ phone, label }: { phone: string; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={phone}
      onPress={() => dial(phone)}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      {/* TODO: swap for the Figma phone pictogram once icons are exported */}
      <Text style={styles.glyph}>📞</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 22 },
});
