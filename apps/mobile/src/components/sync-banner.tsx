import { Pressable, StyleSheet, Text } from 'react-native';

import { ago } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { useStore } from '@/api/cache';
import { getOutbox } from '@/api/outbox';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';
import { getSyncEngine } from '@/sync/sync-engine';

import { useT } from './ui';

/**
 * C9: "Offline, 4 items waiting" and the last synced time. Counts queued
 * actions and band readings not yet uploaded. Tapping retries.
 */
export function SyncBanner({ always }: { always?: boolean }) {
  const { t } = useT();
  const [lang] = useLanguage();
  const outbox = useStore(getOutbox());
  const readings = useStore(getSyncEngine());
  const waiting = outbox.pending + (readings.pending > 0 ? 1 : 0);
  const offline = !outbox.online || !readings.online;

  if (!offline && waiting === 0 && !always) return null;

  const main = offline
    ? waiting > 0
      ? t('sync.banner.offline', { n: waiting })
      : t('sync.banner.offlineNone')
    : waiting > 0
      ? t('sync.banner.waiting', { n: waiting })
      : null;
  const last = outbox.lastSyncAt ? t('sync.banner.last', { ago: ago(lang, outbox.lastSyncAt) }) : t('sync.banner.never');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        getOutbox().retryNow();
        getSyncEngine().uploadNow();
      }}
      style={[styles.banner, offline && styles.offline]}>
      {main && <Text style={styles.main}>{main}</Text>}
      <Text style={styles.sub}>{last}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.tile,
    backgroundColor: color.actionSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  offline: { backgroundColor: statusColor.yellow.panel },
  main: { fontFamily: fontFamily.bodyBold, fontSize: 14, color: color.text },
  sub: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
});
