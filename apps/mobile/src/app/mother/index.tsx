import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus } from '@neobridge/ble-protocol';
import { demoAshaName, demoPhone } from '@neobridge/demo';
import { bi, type Key } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import type { BandPhase } from '@/ble/band-controller';
import { useBand } from '@/ble/use-band';
import { BrandHeader } from '@/components/brand-header';
import { CallButton } from '@/components/call-button';
import { StatusPanel } from '@/components/status-panel';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';

const statuses = [BandStatus.Green, BandStatus.Yellow, BandStatus.Red, BandStatus.Grey];

const chipKey: Record<BandPhase, Key> = {
  loading: 'band.state.connecting',
  unpaired: 'band.homeUnpaired',
  connecting: 'band.state.connecting',
  connected: 'band.linked',
  reconnecting: 'band.state.reconnecting',
};

export default function MotherHome() {
  const [lang] = useLanguage();
  // Placeholder until BandClient feeds real status in. Tap the panel to
  // preview the four states from the Figma file.
  const [status, setStatus] = useState(BandStatus.Green);
  const [band] = useBand();
  const chip = bi(lang, chipKey[band.phase]);
  const unpaired = band.phase === 'unpaired';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/mother/band')}
        style={[styles.chip, unpaired && styles.chipUnpaired]}>
        <Text style={[styles.chipText, unpaired && { color: color.surface }]}>{chip.text}</Text>
        {chip.gloss && (
          <Text style={[styles.chipSub, unpaired && { color: color.actionOnDark }]}>{chip.gloss}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setStatus(statuses[(statuses.indexOf(status) + 1) % 4])}>
        <StatusPanel status={status} lang={lang} />
      </Pressable>

      <View style={styles.spacer} />

      <View style={styles.calls}>
        <CallButton label={bi(lang, 'call.asha', { name: demoAshaName })} phone={demoPhone.asha} />
        {status === BandStatus.Red && (
          <CallButton
            label={bi(lang, 'status.red.fallback')}
            phone={demoPhone.transport}
            tone="danger"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
    paddingHorizontal: size.screenGutter,
    gap: 12,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipUnpaired: {
    borderColor: color.action,
    backgroundColor: color.action,
  },
  chipText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: color.text,
  },
  chipSub: {
    fontFamily: fontFamily.body,
    fontSize: 11.5,
    color: color.textMuted,
  },
  spacer: { flex: 1 },
  calls: { gap: 12, marginBottom: 12 },
});
