import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus } from '@neobridge/ble-protocol';
import { demoAshaName, demoPhone } from '@neobridge/demo';
import { bi } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { CallButton } from '@/components/call-button';
import { StatusPanel } from '@/components/status-panel';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';

const statuses = [BandStatus.Green, BandStatus.Yellow, BandStatus.Red, BandStatus.Grey];

export default function MotherHome() {
  const [lang] = useLanguage();
  // Placeholder until BandClient feeds real status in. Tap the panel to
  // preview the four states from the Figma file.
  const [status, setStatus] = useState(BandStatus.Green);
  const linked = bi(lang, 'band.linked');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />

      <View style={styles.chip}>
        <Text style={styles.chipText}>{linked.text}</Text>
        {linked.gloss && <Text style={styles.chipSub}>{linked.gloss}</Text>}
      </View>

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
