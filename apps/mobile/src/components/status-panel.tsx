import { StyleSheet, Text, View } from 'react-native';

import { BandStatus } from '@neobridge/ble-protocol';
import { t, type LanguageCode } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';

const copy = {
  [BandStatus.Green]: { title: 'status.green.title', sub: 'status.green.action' },
  [BandStatus.Yellow]: { title: 'status.yellow.title', sub: 'status.yellow.recheck' },
  [BandStatus.Red]: { title: 'status.red.title', sub: 'status.red.fallback' },
  [BandStatus.Grey]: { title: 'status.grey.title', sub: 'status.grey.action' },
} as const;

/**
 * The big status card at the top of Home. Caregivers never see numbers here.
 * TODO: status pictograms from Figma, the Listen button, and the yellow steps.
 */
export function StatusPanel({ status, lang }: { status: BandStatus; lang: LanguageCode }) {
  const title = t(lang, copy[status].title);
  const sub = t(lang, copy[status].sub);
  const look = panelLook[status];

  return (
    <View style={[styles.panel, { backgroundColor: look.background }]}>
      <Text style={[styles.title, { color: look.heading }]}>{title.local.text}</Text>
      <Text style={[styles.gloss, { color: look.caption }]}>{title.english}</Text>
      <Text style={[styles.action, { color: look.heading }]}>{sub.local.text}</Text>
      <Text style={[styles.gloss, { color: look.caption }]}>{sub.english}</Text>
    </View>
  );
}

const panelLook = {
  [BandStatus.Green]: {
    background: statusColor.green.panel,
    heading: statusColor.green.heading,
    caption: statusColor.green.caption,
  },
  [BandStatus.Yellow]: {
    background: statusColor.yellow.panel,
    heading: color.text,
    caption: statusColor.yellow.caption,
  },
  [BandStatus.Red]: {
    background: statusColor.red.fill,
    heading: color.surface,
    caption: color.surface,
  },
  [BandStatus.Grey]: {
    background: statusColor.grey.panel,
    heading: color.text,
    caption: color.textMuted,
  },
};

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.panel,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 42,
    fontFamily: fontFamily.heading,
    textAlign: 'center',
  },
  action: {
    marginTop: 10,
    fontSize: 19,
    lineHeight: 26,
    fontFamily: fontFamily.bodySemiBold,
    textAlign: 'center',
  },
  gloss: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    textAlign: 'center',
  },
});
