import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus } from '@neobridge/ble-protocol';
import { t } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { StatusPanel } from '@/components/status-panel';
import { fontFamily } from '@/constants/fonts';

const statuses = [BandStatus.Green, BandStatus.Yellow, BandStatus.Red, BandStatus.Grey];

export default function MotherHome() {
  // Placeholder until BandClient feeds real status in. Tap the panel to
  // preview the four states from the Figma file.
  const [status, setStatus] = useState(BandStatus.Green);
  const call = t('hi', 'call.asha', { name: 'सुनीता', nameEn: 'Sunita' });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />

      <View style={styles.chip}>
        <Text style={styles.chipText}>{t('hi', 'band.linked').local.text}</Text>
        <Text style={styles.chipSub}>{t('hi', 'band.linked').english}</Text>
      </View>

      <Pressable onPress={() => setStatus(statuses[(statuses.indexOf(status) + 1) % 4])}>
        <StatusPanel status={status} lang="hi" />
      </Pressable>

      <View style={styles.spacer} />

      <Pressable style={styles.callButton} accessibilityRole="button">
        <Text style={styles.callTitle}>{call.local.text}</Text>
        <Text style={styles.callSub}>{call.english}</Text>
      </Pressable>
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
  callButton: {
    minHeight: size.callButton,
    marginBottom: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: color.action,
  },
  callTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 21,
    lineHeight: 28,
    color: color.surface,
  },
  callSub: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.actionOnDark,
  },
});
