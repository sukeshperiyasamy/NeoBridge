import { router } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus, ReadingFlag } from '@neobridge/ble-protocol';
import { KMC_TARGET_HOURS, type KmcHolder } from '@neobridge/domain';
import { t as tRaw, type Key } from '@neobridge/i18n';
import { color, radius, size, status as statusColor } from '@neobridge/tokens';

import { bandStatusOf, type BandPhase } from '@/ble/band-controller';
import { useBand } from '@/ble/use-band';
import { BrandHeader } from '@/components/brand-header';
import { CallButton } from '@/components/call-button';
import { sendRedSms, useRedSmsBody } from '@/components/red-alert';
import { StatusPanel } from '@/components/status-panel';
import { TempNowCard } from '@/components/temp-trend';
import { Button, Card, Choice, Line, Muted, Row, Strong, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { dial } from '@/dial';
import { useSettings } from '@/language';
import { getMotherBridge } from '@/mother/bridge';
import { useDangerCheckDone, useHousehold } from '@/mother/household';
import { getKmc } from '@/mother/kmc';
import { playChime, say } from '@/sound';

const chipKey: Record<BandPhase, Key> = {
  loading: 'band.state.connecting',
  unpaired: 'band.homeUnpaired',
  connecting: 'band.state.connecting',
  connected: 'band.linked',
  reconnecting: 'band.state.reconnecting',
};

const holders: KmcHolder[] = ['mother', 'father', 'grandmother', 'other'];

const fmt = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * M1 / M2 Home. Status comes from the status rules (packages/rules) on the
 * band's live readings. Under it, the baby's temperature on a level gauge
 * (live from the band, or the last reading), then KMC and two quick actions.
 * An open red stays red until the ASHA or a doctor closes it.
 */
export default function MotherHome() {
  const { t, bi, lang } = useT();
  const [settings] = useSettings();
  const [band] = useBand();
  const bridge = useSyncExternalStore(getMotherBridge().subscribe, getMotherBridge().getState);
  const kmc = useSyncExternalStore(getKmc().subscribe, getKmc().getState);
  const { baby, phones } = useHousehold();
  const dangerDone = useDangerCheckDone();
  const [now, setNow] = useState(Date.now);
  const status = bandStatusOf(band.rules.status);
  const ep = band.episode;
  const smsBody = useRedSmsBody(ep?.trigger ?? 'dangerSign');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // yellow: chime and the voice line when it starts; other changes: the voice line
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current === status) return;
    lastStatus.current = status;
    if (status === BandStatus.Yellow) void playChime();
    if (settings.voice && status !== BandStatus.Red) {
      const line = { [BandStatus.Green]: 'status.green.title', [BandStatus.Yellow]: 'status.yellow.title', [BandStatus.Grey]: 'status.grey.title' }[
        status as 0 | 1 | 3
      ] as Key;
      say(tRaw(lang, line), lang);
    }
  }, [status, settings.voice, lang]);

  const chip = bi(chipKey[band.phase]);
  const unpaired = band.phase === 'unpaired';
  const goodContact =
    band.lastReading !== null &&
    (band.lastReading.flags & ReadingFlag.NoContact) === 0 &&
    band.lastReading.contactPct >= 60 &&
    band.lastSeen !== null &&
    now - band.lastSeen < 90_000;
  const askKmc = !kmc.running && goodContact && status === BandStatus.Green && now > kmc.askSnoozedUntil;
  const todayKmc = getKmc().todayHours(now);
  // the rules' adjusted median when there is one, else the raw reading
  const raw = band.lastReading;
  const liveC = band.rules.skinC ?? (raw && raw.skinTempC !== null && (raw.flags & ReadingFlag.NoContact) === 0 ? raw.skinTempC : null);

  function listen() {
    const line = {
      [BandStatus.Green]: ['status.green.title', 'status.green.action'],
      [BandStatus.Yellow]: ['status.yellow.title', 'home.step.skin', 'home.step.cover', 'home.step.feed'],
      [BandStatus.Red]: ['status.red.title', 'status.red.skinToSkin'],
      [BandStatus.Grey]: ['status.grey.title', 'status.grey.action'],
    }[status] as Key[];
    say(line.map((k) => tRaw(lang, k)).join('. '), lang);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/mother/band')}
            style={[styles.chip, unpaired && styles.chipUnpaired]}>
            <Text style={[styles.chipText, unpaired && { color: color.surface }]}>
              {unpaired ? '' : band.phase === 'connected' ? '● ' : '○ '}
              {chip.text}
            </Text>
            {chip.gloss && <Text style={[styles.chipSub, unpaired && { color: color.actionOnDark }]}>{chip.gloss}</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.listen')}
            onPress={listen}
            style={({ pressed }) => [styles.listen, pressed && { opacity: 0.6 }]}>
            <Text style={styles.listenText}>🔊 {t('home.listen')}</Text>
          </Pressable>
        </Row>

        <StatusPanel status={status} lang={lang} />

        {status === BandStatus.Yellow && (
          <Card tint={statusColor.yellow.panel}>
            {(['home.step.skin', 'home.step.cover', 'home.step.feed'] as Key[]).map((k, i) => (
              <Row key={k}>
                <Text style={styles.stepNo}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Line value={bi(k)} style={styles.step} />
                </View>
              </Row>
            ))}
            {band.recheckAt && (
              <Strong>
                {band.recheckAt > now ? t('home.recheckIn', { time: fmt(band.recheckAt - now) }) : t('home.recheckNow')}
              </Strong>
            )}
          </Card>
        )}

        {status === BandStatus.Red && ep && (
          <Card tint={statusColor.red.soft}>
            {bridge.staffAck ? (
              <>
                <Line value={bi('home.ashaComing', { name: bridge.staffAck.name.split(' ')[0] })} style={styles.alertTitle} />
                <Line value={bi('home.ashaComingSub')} />
              </>
            ) : (
              <>
                <Line value={bi('home.waitingAsha')} style={styles.alertTitle} />
                <Line value={bi('home.waitingAshaSub')} />
              </>
            )}
            <CallButton label={bi('status.red.fallback')} phone={phones.transport} tone="danger" />
            <Button kind="secondary" label={t('home.sms')} onPress={() => void sendRedSms(phones.asha, smsBody)} />
          </Card>
        )}

        {status === BandStatus.Grey && !unpaired && (
          <Button kind="secondary" label={t('home.checkBand')} onPress={() => router.navigate('/mother/band')} />
        )}

        <TempNowCard babyId={baby?.id ?? null} liveC={liveC} liveAt={band.lastSeen} />

        {/* M12: KMC session */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.cardTitle}>KMC</Text>
            <Muted>
              {t('kmc.today')} · {t('kmc.target', { h: todayKmc.toFixed(1) })}
            </Muted>
          </Row>
          <View style={styles.kmcTrack}>
            <View style={[styles.kmcFill, { width: `${Math.min(100, (todayKmc / KMC_TARGET_HOURS) * 100)}%` }]} />
          </View>
          {kmc.running ? (
            <>
              <Strong>{t('kmc.running', { time: fmt(now - kmc.running.startedAt) })}</Strong>
              <Choice
                label={t('kmc.who')}
                options={holders.map((h) => ({ value: h, label: t(`kmc.holder.${h}` as Key) }))}
                value={kmc.running.holder}
                onChange={(h) => getKmc().setHolder(h)}
              />
              <Button kind="dangerSolid" label={bi('kmc.stop')} onPress={() => getKmc().stop()} />
            </>
          ) : askKmc ? (
            <>
              <Line value={bi('home.kmcAsk')} style={styles.ask} />
              <Row>
                <Button label={t('home.kmcAskYes')} onPress={() => baby && getKmc().start(baby.id, 'mother')} style={{ flex: 1 }} />
                <Button kind="secondary" label={t('home.kmcAskNo')} onPress={() => getKmc().snoozeAsk()} style={{ flex: 1 }} />
              </Row>
            </>
          ) : (
            <Button label={bi('kmc.start')} onPress={() => baby && getKmc().start(baby.id, 'mother')} disabled={!baby} />
          )}
        </Card>

        {/* quick actions */}
        <Row gap={10} style={{ alignItems: 'stretch' }}>
          <Tile
            icon={dangerDone ? '✓' : '📋'}
            label={dangerDone ? t('home.dangerShortDone') : t('home.dangerShort')}
            sub={dangerDone ? t('home.dangerDone') : t('home.dangerCheck')}
            done={dangerDone}
            onPress={() => router.push('/danger-check')}
          />
          {phones.asha && (
            <Tile
              icon="📞"
              label={t('home.callAshaShort', { name: phones.ashaName })}
              sub={phones.asha}
              onPress={() => void dial(phones.asha!)}
            />
          )}
        </Row>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ icon, label, sub, onPress, done }: { icon: string; label: string; sub: string; onPress: () => void; done?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, done && styles.tileDone, pressed && { opacity: 0.7 }]}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.tileSub} numberOfLines={2}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  body: { gap: 12, paddingBottom: 24 },
  chip: {
    flexShrink: 1,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.chip,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipUnpaired: { backgroundColor: color.action, borderColor: color.action },
  chipText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.text },
  chipSub: { fontFamily: fontFamily.body, fontSize: 11, color: color.textMuted },
  stepNo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: statusColor.yellow.fill,
    textAlign: 'center',
    lineHeight: 32,
    fontFamily: fontFamily.heading,
    fontSize: 17,
    color: color.text,
  },
  step: { fontFamily: fontFamily.bodySemiBold, fontSize: 18 },
  alertTitle: { fontFamily: fontFamily.heading, fontSize: 21, lineHeight: 28 },
  listen: {
    flexShrink: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  listenText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.action },
  ask: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, lineHeight: 24 },
  cardTitle: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 26, color: color.text },
  tile: {
    flex: 1,
    minHeight: 104,
    gap: 2,
    padding: 14,
    borderRadius: radius.panel,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  tileDone: { backgroundColor: statusColor.green.panel, borderColor: statusColor.green.panel },
  tileIcon: { fontSize: 22, lineHeight: 28 },
  tileLabel: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 21, color: color.text },
  tileSub: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
  kmcTrack: { height: 12, borderRadius: 6, backgroundColor: color.track, overflow: 'hidden' },
  kmcFill: { height: 12, borderRadius: 6, backgroundColor: statusColor.green.fill },
});
