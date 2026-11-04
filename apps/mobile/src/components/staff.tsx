import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BabyListItem, EpisodeDto, Village } from '@neobridge/domain';
import { ago, t as tRaw, type Key } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { api } from '@/api/client';
import { CallIconButton } from '@/components/call-icon-button';
import { Button, Muted, Row, StatusChip, Strong, rowTint, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { dial } from '@/dial';
import { alarmNow } from '@/notify';
import { startAlarm, stopAlarm } from '@/sound';

export interface AlertEpisode extends EpisodeDto {
  babyName: string;
  motherName: string;
  motherPhone: string;
  village: Village | null;
  dayOfLife: number | null;
}

export const villageName = (v: Village | null | undefined, lang: 'en' | 'hi') => (v ? (lang === 'hi' ? v.nameHi : v.name) : '');

/** A1 / D4 row: status chip, baby and mother, village, day of life, yesterday's KMC, last sync. */
export function BabyRow({ item, onPress, showAsha }: { item: BabyListItem; onPress: () => void; showAsha?: boolean }) {
  const { t, lang } = useT();
  const b = item.baby;
  const visit = item.nextVisit;
  return (
    <View style={[styles.row, { backgroundColor: rowTint[b.status] }]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ flex: 1, gap: 3 }, pressed && { opacity: 0.7 }]}>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <StatusChip status={b.status} small />
          {item.openEpisode && (
            <Muted style={{ color: item.openEpisode.staffAcknowledgedAt ? color.textMuted : statusColor.red.text }}>
              {item.openEpisode.staffAcknowledgedAt ? t('asha.acked') : t('asha.notAcked')}
            </Muted>
          )}
        </Row>
        <Strong>
          {b.name} <Muted>· {item.mother.name}</Muted>
        </Strong>
        <Muted>
          {villageName(item.mother.village, lang)} · {t('day', { n: item.dayOfLife })} · {t('asha.kmcYesterday', { h: item.kmcHoursYesterday.toFixed(1) })}
          {showAsha && item.mother.asha ? ` · ${item.mother.asha.name}` : ''}
        </Muted>
        {visit && (visit.state === 'overdue' || visit.state === 'due') && (
          <Muted style={{ color: visit.state === 'overdue' ? statusColor.red.text : color.text }}>
            {visit.day === null
              ? `${t('visits.extra')} · ${t(visit.state === 'overdue' ? 'visits.overdue' : 'visits.today')}`
              : t(visit.state === 'overdue' ? 'asha.visitOverdue' : 'asha.visitDue', { d: visit.day })}
          </Muted>
        )}
        <Muted>{b.lastSyncAt ? t('asha.synced', { ago: ago(lang, Date.parse(b.lastSyncAt)) }) : t('asha.neverSynced')}</Muted>
      </Pressable>
      <CallIconButton phone={item.mother.phone} label={t('detail.callFamily')} />
    </View>
  );
}

/**
 * Watches for red alerts nobody on this phone has seen yet (polls every 15 s,
 * PRD: red reaches the ASHA within 1 minute). Rings with the alarm channel.
 */
export function useRedAlerts(): { alert: AlertEpisode | null; dismiss: (id: string) => void; acknowledge: (id: string) => Promise<void> } {
  const q = useApi<{ episodes: AlertEpisode[] }>('/v1/episodes?open=1&kind=red', { pollMs: 15_000 });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const rung = useRef(new Set<string>());
  const { lang } = useT();
  const pending = (q.data?.episodes ?? []).filter((e) => !e.staffAcknowledgedAt && !dismissed.has(e.id));
  const alert = pending[0] ?? null;

  useEffect(() => {
    for (const e of pending) {
      if (rung.current.has(e.id)) continue;
      rung.current.add(e.id);
      void alarmNow(tRaw(lang, 'alert.title'), `${e.babyName} · ${e.motherName}`).catch(() => undefined);
    }
  }, [pending, lang]);

  return {
    alert,
    dismiss: (id) => setDismissed((s) => new Set(s).add(id)),
    acknowledge: async (id) => {
      await api('POST', `/v1/episodes/${encodeURIComponent(id)}/ack`).catch(() => undefined);
      setDismissed((s) => new Set(s).add(id));
      invalidate('/v1/');
    },
  };
}

/** A12: full screen, rings on silent. Acknowledge stops the ringing and tells the mother's phone "ASHA is coming". */
export function StaffRedAlert({
  alert,
  onAck,
  onDismiss,
}: {
  alert: AlertEpisode;
  onAck: () => Promise<void>;
  onDismiss: () => void;
}) {
  const { t, bi, lang } = useT();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void startAlarm();
    return () => stopAlarm();
  }, [alert.id]);

  const title = bi('alert.title');
  return (
    <SafeAreaView style={styles.alert} edges={['top', 'bottom']}>
      <View style={{ gap: 6, paddingTop: 24 }}>
        <Text style={styles.alertTitle}>{title.text}</Text>
        {title.gloss && <Text style={styles.alertGloss}>{title.gloss}</Text>}
        <Text style={styles.alertBaby}>{alert.babyName}</Text>
        <Text style={styles.alertLine}>
          {alert.motherName} · {villageName(alert.village, lang)}
          {alert.dayOfLife ? ` · ${t('day', { n: alert.dayOfLife })}` : ''}
        </Text>
        <Text style={styles.alertLine}>
          {t(`red.reason.${alert.trigger}` as Key)} · {ago(lang, Date.parse(alert.startedAt))}
        </Text>
      </View>
      <View style={{ gap: 12, paddingBottom: 12 }}>
        <Button
          kind="secondary"
          style={{ minHeight: 72, borderColor: color.surface }}
          label={bi('alert.ack')}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            stopAlarm();
            await onAck();
            setBusy(false);
          }}
        />
        <Button label={bi('alert.callFamily')} onPress={() => void dial(alert.motherPhone)} />
        <Button
          label={bi('alert.startVisit')}
          onPress={async () => {
            stopAlarm();
            await onAck();
            router.push({ pathname: '/visit/[babyId]', params: { babyId: alert.babyId } });
          }}
        />
        <Pressable accessibilityRole="button" onPress={onDismiss} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={styles.alertLine}>{t('alert.later')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: color.border,
  },
  alert: { flex: 1, backgroundColor: statusColor.red.fill, paddingHorizontal: 16, justifyContent: 'space-between' },
  alertTitle: { fontFamily: fontFamily.headingHeavy, fontSize: 36, lineHeight: 48, color: color.surface },
  alertGloss: { fontFamily: fontFamily.body, fontSize: 14, color: color.surface },
  alertBaby: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.surface, marginTop: 16 },
  alertLine: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, color: color.surface },
});
