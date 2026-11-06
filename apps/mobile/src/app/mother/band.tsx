import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ago, bi, t, type Bilingual, type Key, type UiLanguage } from '@neobridge/i18n';
import { color, radius, size, status as statusColor } from '@neobridge/tokens';

import {
  DEMO_BAND_ALLOWED,
  LOW_BATTERY,
  checkOrder,
  type BandPhase,
  type BandState,
  type CheckKey,
  type CheckResult,
} from '@/ble/band-controller';
import { simScenarios, type SimScenario } from '@/ble/sim-band';
import { useBand } from '@/ble/use-band';
import { BrandHeader } from '@/components/brand-header';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';
import { useSync } from '@/sync/use-sync';

const phaseKey: Record<BandPhase, Key> = {
  loading: 'band.state.connecting',
  unpaired: 'band.state.unpaired',
  connecting: 'band.state.connecting',
  connected: 'band.state.connected',
  reconnecting: 'band.state.reconnecting',
};

const phaseColor: Record<BandPhase, string> = {
  loading: statusColor.grey.fill,
  unpaired: statusColor.grey.fill,
  connecting: statusColor.yellow.strong,
  connected: statusColor.green.fill,
  reconnecting: statusColor.yellow.strong,
};

// Figma: Band tab. Pair the band, keep it paired, and fix it when it can't read.
export default function BandScreen() {
  const [lang] = useLanguage();
  const [band, controller] = useBand();
  const [confirmForget, setConfirmForget] = useState(false);
  const paired = band.paired !== null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t(lang, 'band.title')}</Text>
        <Text style={styles.muted}>{t(lang, 'band.sub')}</Text>

        <ConnectionCard band={band} lang={lang} onReconnect={() => controller.reconnectNow()} />

        {!paired && (
          <PairCard band={band} lang={lang} onScan={() => controller.startScan()} onPair={(b) => controller.pair(b)} />
        )}

        {!paired && DEMO_BAND_ALLOWED && (
          <View style={styles.card}>
            <Line value={bi(lang, 'band.useDemoHint')} style={styles.body} />
            <SecondaryButton label={t(lang, 'band.useDemo')} onPress={() => void controller.useDemoBand()} />
          </View>
        )}

        {paired && band.phase === 'connected' && <BuzzCard lang={lang} onBuzz={() => controller.testBuzz()} />}

        {paired && controller.isDemoBand() && (
          <DemoCard
            band={band}
            lang={lang}
            onScenario={(s) => controller.setScenario(s)}
            onDemoMode={(on) => void controller.setDemoMode(on)}
          />
        )}

        {paired && <DataCard lang={lang} />}

        {paired && (
          <FixCard band={band} lang={lang} onRun={() => controller.runChecks()} />
        )}

        {paired && (
          <View style={styles.card}>
            {confirmForget ? (
              <>
                <Line value={bi(lang, 'band.forgetConfirm')} style={styles.rowTitle} />
                <View style={styles.buttons}>
                  <SecondaryButton label={t(lang, 'cancel')} onPress={() => setConfirmForget(false)} />
                  <SecondaryButton
                    label={t(lang, 'band.remove')}
                    danger
                    onPress={() => {
                      setConfirmForget(false);
                      void controller.forget();
                    }}
                  />
                </View>
              </>
            ) : (
              <SecondaryButton label={t(lang, 'band.forget')} onPress={() => setConfirmForget(true)} />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConnectionCard({
  band,
  lang,
  onReconnect,
}: {
  band: BandState;
  lang: UiLanguage;
  onReconnect: () => void;
}) {
  const busy = band.phase === 'connecting' || band.phase === 'loading';
  const batteryKey: Key =
    band.battery === null ? 'band.batteryUnknown' : band.battery < LOW_BATTERY ? 'band.batteryLow' : 'band.batteryOk';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: phaseColor[band.phase] }]} />
        <View style={{ flex: 1 }}>
          <Line value={bi(lang, phaseKey[band.phase])} style={styles.rowTitle} />
          {band.paired && <Text style={styles.muted}>{band.paired.name}</Text>}
        </View>
        {busy && <ActivityIndicator color={color.action} />}
      </View>

      {band.paired && (
        <>
          <View style={styles.battery}>
            <Text style={styles.body}>
              {t(lang, 'band.battery')} · {t(lang, batteryKey)}
            </Text>
            {/* bars, never a percentage: families don't see numbers */}
            <View style={styles.bars}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    band.battery !== null && band.battery > i * 25 && {
                      backgroundColor: band.battery < LOW_BATTERY ? statusColor.red.fill : statusColor.green.fill,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          <Line value={bi(lang, 'band.keepPaired')} style={styles.muted} />
          {band.phase === 'reconnecting' && (
            <SecondaryButton label={t(lang, 'band.scanAgain')} onPress={onReconnect} />
          )}
        </>
      )}
    </View>
  );
}

function PairCard({
  band,
  lang,
  onScan,
  onPair,
}: {
  band: BandState;
  lang: UiLanguage;
  onScan: () => void;
  onPair: (b: BandState['found'][number]) => void;
}) {
  const searched = !band.scanning && band.found.length === 0;
  const [tried, setTried] = useState(false);

  return (
    <View style={styles.card}>
      <Line value={bi(lang, 'band.pairHint')} style={styles.body} />

      <PrimaryButton
        label={bi(lang, band.scanning ? 'band.state.scanning' : tried ? 'band.scanAgain' : 'band.pair')}
        disabled={band.scanning}
        onPress={() => {
          setTried(true);
          onScan();
        }}
      />

      {band.found.length > 0 && (
        <>
          <Text style={[styles.rowTitle, { marginTop: 6 }]}>{t(lang, 'band.found')}</Text>
          {band.found.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.found, pressed && { opacity: 0.8 }]}
              onPress={() => onPair(b)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{b.name}</Text>
                <Text style={styles.muted}>{t(lang, 'band.tapToPair')}</Text>
              </View>
              <SignalBars rssi={b.rssi} />
            </Pressable>
          ))}
          <Line value={bi(lang, 'band.systemPrompt')} style={styles.muted} />
        </>
      )}

      {tried && searched && <Line value={bi(lang, 'band.noneFound')} style={styles.warn} />}
    </View>
  );
}

/** M7: buzz once so the family knows which band is theirs. */
function BuzzCard({ lang, onBuzz }: { lang: UiLanguage; onBuzz: () => Promise<boolean> }) {
  const [buzzed, setBuzzed] = useState(false);
  return (
    <View style={styles.card}>
      <SecondaryButton
        label={t(lang, 'band.testBuzz')}
        onPress={() => {
          void onBuzz().then((ok) => {
            setBuzzed(ok);
            if (ok) setTimeout(() => setBuzzed(false), 4000);
          });
        }}
      />
      {buzzed && <Line value={bi(lang, 'band.testBuzzDone')} style={styles.muted} />}
    </View>
  );
}

const scenarioKey: Record<SimScenario, Key> = {
  normal: 'demo.scenario.normal',
  cooling: 'demo.scenario.cooling',
  veryCold: 'demo.scenario.veryCold',
  hot: 'demo.scenario.hot',
  offBody: 'demo.scenario.offBody',
  lowBattery: 'demo.scenario.lowBattery',
};

/** Only with the demo band: pick what it acts out, and the short demo timings. */
function DemoCard({
  band,
  lang,
  onScenario,
  onDemoMode,
}: {
  band: BandState;
  lang: UiLanguage;
  onScenario: (s: SimScenario) => void;
  onDemoMode: (on: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>{t(lang, 'demo.title')}</Text>
      <Text style={styles.rowTitle}>{t(lang, 'demo.scenario')}</Text>
      <View style={styles.chips}>
        {simScenarios.map((s) => {
          const on = band.scenario === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onScenario(s)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && { color: color.surface }]}>{t(lang, scenarioKey[s])}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[styles.body, { flex: 1 }]}>{t(lang, 'demo.mode')}</Text>
        <Switch value={band.demoMode} onValueChange={onDemoMode} trackColor={{ true: color.action }} />
      </View>
    </View>
  );
}

/** Band → phone → server. Shows whether readings are safely uploaded or waiting on the phone. */
function DataCard({ lang }: { lang: UiLanguage }) {
  const [sync, engine] = useSync();
  const connection: Key = !sync.online ? 'sync.offline' : sync.problem === 'server' ? 'sync.server' : 'sync.online';
  const ok = sync.online && sync.problem === null;

  return (
    <View style={styles.card}>
      <Text style={styles.section}>{t(lang, 'sync.title')}</Text>

      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: ok ? statusColor.green.fill : statusColor.yellow.strong }]} />
        <View style={{ flex: 1 }}>
          <Line value={bi(lang, connection)} style={styles.rowTitle} />
        </View>
        {sync.uploading && <ActivityIndicator color={color.action} />}
      </View>

      <Line
        value={
          sync.uploading
            ? bi(lang, 'sync.uploading')
            : sync.pending === 0
              ? bi(lang, 'sync.allUploaded')
              : bi(lang, 'sync.waiting', { n: sync.pending })
        }
        style={styles.body}
      />
      <Text style={styles.muted}>
        {sync.lastUploadAt
          ? t(lang, 'sync.lastUpload', { ago: ago(lang, sync.lastUploadAt) })
          : t(lang, 'sync.never')}
      </Text>

      {sync.pending > 0 && sync.online && !sync.uploading && (
        <SecondaryButton label={t(lang, 'sync.uploadNow')} onPress={() => engine.uploadNow()} />
      )}
    </View>
  );
}

const checkLabel: Record<CheckKey, { ok: Key; fix: Key }> = {
  bluetooth: { ok: 'fix.bluetooth', fix: 'fix.bluetooth.fix' },
  permission: { ok: 'fix.permission', fix: 'fix.permission.fix' },
  nearby: { ok: 'fix.nearby', fix: 'fix.nearby.fix' },
  connect: { ok: 'fix.connect', fix: 'fix.connect.fix' },
  battery: { ok: 'fix.battery', fix: 'fix.battery.fix' },
  contact: { ok: 'fix.contact', fix: 'fix.contact.fix' },
};

const resultMark: Record<CheckResult, string> = {
  pending: '○',
  checking: '…',
  pass: '✓',
  fail: '✕',
  skipped: '–',
};

function FixCard({ band, lang, onRun }: { band: BandState; lang: UiLanguage; onRun: () => void }) {
  const checks = band.checks;
  const running = checks !== null && checkOrder.some((k) => checks[k] === 'checking' || checks[k] === 'pending');
  const allGood = checks !== null && checkOrder.every((k) => checks[k] === 'pass');

  return (
    <View style={styles.card}>
      <Text style={styles.section}>{t(lang, 'fix.title')}</Text>

      {checks &&
        checkOrder.map((key) => {
          const result = checks[key];
          return (
            <View key={key} style={styles.check}>
              <Text
                style={[
                  styles.mark,
                  result === 'pass' && { color: statusColor.green.fill },
                  result === 'fail' && { color: statusColor.red.fill },
                ]}>
                {resultMark[result]}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, result === 'skipped' && styles.muted]}>
                  {t(lang, checkLabel[key].ok)}
                  {result === 'skipped' ? ` · ${t(lang, 'fix.notChecked')}` : ''}
                </Text>
                {result === 'fail' && <Line value={bi(lang, checkLabel[key].fix)} style={styles.warn} />}
              </View>
            </View>
          );
        })}

      {allGood && <Line value={bi(lang, 'fix.allGood')} style={[styles.rowTitle, { color: statusColor.green.fill }]} />}

      <PrimaryButton
        label={bi(lang, running ? 'fix.checking' : checks ? 'fix.run' : 'fix.title')}
        disabled={running}
        onPress={onRun}
      />
    </View>
  );
}

function SignalBars({ rssi }: { rssi: number | null }) {
  // -50 dBm or better is very close; -90 is the edge of range
  const level = rssi === null ? 0 : Math.max(1, Math.min(3, Math.round((rssi + 100) / 15)));
  return (
    <View style={styles.signal}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[styles.signalBar, { height: 6 + i * 5 }, i <= level && { backgroundColor: color.action }]}
        />
      ))}
    </View>
  );
}

function Line({ value, style }: { value: Bilingual; style: object | object[] }) {
  return (
    <View>
      <Text style={style}>{value.text}</Text>
      {value.gloss && <Text style={styles.gloss}>{value.gloss}</Text>}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: Bilingual;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, (pressed || disabled) && { opacity: 0.7 }]}>
      <Text style={styles.primaryText}>{label.text}</Text>
      {label.gloss && <Text style={styles.primaryGloss}>{label.gloss}</Text>}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, danger && styles.secondaryDanger, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.secondaryText, danger && { color: statusColor.red.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  content: { gap: 12, paddingBottom: 24 },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  section: { fontFamily: fontFamily.heading, fontSize: 20, lineHeight: 28, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  gloss: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
  body: { fontFamily: fontFamily.body, fontSize: 15, color: color.text },
  warn: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: statusColor.red.text },
  rowTitle: { fontFamily: fontFamily.bodyBold, fontSize: 17, color: color.text },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  battery: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { width: 12, height: 18, borderRadius: 3, backgroundColor: color.track },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: size.touchMin + 16,
    padding: 14,
    borderRadius: radius.tile,
    backgroundColor: color.actionSoft,
  },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  signalBar: { width: 6, borderRadius: 2, backgroundColor: color.border },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 22, fontFamily: fontFamily.bodyBold, fontSize: 18, lineHeight: 22, color: color.textMuted },
  buttons: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: size.touchMin,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.action },
  chipText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.action },
  primary: {
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: color.action,
  },
  primaryText: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 26, color: color.surface },
  primaryGloss: { fontFamily: fontFamily.body, fontSize: 12, color: color.actionOnDark },
  secondary: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  secondaryDanger: { borderColor: statusColor.red.fill },
  secondaryText: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.action },
});
