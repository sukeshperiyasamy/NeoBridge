import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { istDate, type EpisodeDto } from '@neobridge/domain';
import { ago } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { useApi } from '@/api/cache';
import { ApiError } from '@/api/client';
import { exportBabyData, type ExportKind } from '@/api/export';
import { ChartBlock, TempChart, TempGauge, TempRangeChart, zoneColor, zoneInk, zoneOf, type TempDay, type TempZone } from '@/components/charts';
import { Button, Card, Choice, H2, IconLine, Muted, Row, Success, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { Icon } from '@/components/icon';
import { useNow } from '@/use-now';

export interface TempDaysDto {
  last: { at: string; skinC: number } | null;
  days: (TempDay & { readings: number; minAt: string | null; maxAt: string | null })[];
  range: { minC: number; maxC: number } | null;
}

export function useTempDays(babyId: string | null | undefined) {
  return useApi<TempDaysDto>(babyId ? `/v1/babies/${babyId}/temp-days?days=15` : null, { pollMs: 5 * 60_000 });
}

function useZoneLabels(): Record<TempZone, string> & { now: string } {
  const { t } = useT();
  return {
    veryCold: t('temp.zone.veryCold'),
    cold: t('temp.zone.cold'),
    normal: t('temp.zone.normal'),
    hot: t('temp.zone.hot'),
    now: t('temp.now'),
  };
}

const fmtC = (c: number) => `${c.toFixed(1)}°C`;

/**
 * Home: the baby's temperature now, on the level gauge, with today's low and
 * high. Live from the band when it is talking; otherwise the last reading the
 * server has.
 */
export function TempNowCard({ babyId, liveC, liveAt }: { babyId: string | null; liveC: number | null; liveAt: number | null }) {
  const { t, lang } = useT();
  const now = useNow(15_000);
  const q = useTempDays(babyId);
  const labels = useZoneLabels();
  const live = liveC !== null && liveAt !== null && now - liveAt < 90_000;
  const lastAt = q.data?.last ? Date.parse(q.data.last.at) : null;
  const value = live ? liveC : (q.data?.last?.skinC ?? null);
  const today = q.data?.days.find((d) => d.date === istDate(now)) ?? null;
  const low = today ? Math.min(today.minC, live ? liveC! : Infinity) : live ? liveC : null;
  const high = today ? Math.max(today.maxC, live ? liveC! : -Infinity) : live ? liveC : null;
  const zone = value === null ? null : zoneOf(value);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{t('home.temp.title')}</Text>
          <Row gap={6}>
            {live && <Icon name="dot" size={12} color={statusColor.green.fill} />}
            <Muted>
              {value === null
                ? t('home.temp.none')
                : live
                  ? t('home.temp.live')
                  : lastAt
                    ? t('home.temp.last', { ago: ago(lang, lastAt) })
                    : ''}
            </Muted>
          </Row>
        </View>
        {value !== null && zone && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.value, { color: zone === 'normal' ? statusColor.green.heading : zoneColor[zone] }]}>{fmtC(value)}</Text>
            <Text style={[s.zoneChip, { backgroundColor: zoneColor[zone], color: zoneInk[zone] }]}>{labels[zone]}</Text>
          </View>
        )}
      </Row>
      <TempGauge value={value} low={low} high={high} labels={labels} />
      {low !== null && high !== null && (
        <Row gap={8}>
          <Stat label={t('home.temp.todayLow')} value={fmtC(low)} tone={zoneColor[zoneOf(low)]} />
          <Stat label={t('home.temp.todayHigh')} value={fmtC(high)} tone={zoneColor[zoneOf(high)]} />
        </Row>
      )}
      <Pressable accessibilityRole="link" onPress={() => router.navigate('/mother/baby')} style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
        <Row gap={6}>
          <Text style={s.linkText}>{t('home.temp.trend')}</Text>
          <Icon name="arrowForward" size={18} color={color.action} />
        </Row>
      </Pressable>
    </Card>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <View style={[s.stat, { borderLeftColor: tone }]}>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.statValue} numberOfLines={1}>
        {value}
      </Text>
      {sub && (
        <Text style={s.statLabel} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </View>
  );
}

type Range = '24' | '168' | '360';

/**
 * The trend: the temperature line over 24 h / 7 / 15 days, the lowest and
 * highest over 15 days, and each day's low-to-high. Mother's baby tab and the
 * staff baby page.
 */
export function TempTrendCard({ babyId, episodes, title }: { babyId: string; episodes: EpisodeDto[]; title?: string }) {
  const { t } = useT();
  const [range, setRange] = useState<Range>('24');
  const now = useNow(60_000);
  const temps = useApi<{ points: { t: number; skinC: number }[] }>(`/v1/babies/${babyId}/temps?hours=${range}`, { pollMs: 5 * 60_000 });
  const days = useTempDays(babyId);
  const d = days.data;
  const lowDay = d?.days.reduce<TempDaysDto['days'][number] | null>((a, b) => (!a || b.minC < a.minC ? b : a), null);
  const highDay = d?.days.reduce<TempDaysDto['days'][number] | null>((a, b) => (!a || b.maxC > a.maxC ? b : a), null);
  const avg = d && d.days.length ? d.days.reduce((s, x) => s + x.avgC, 0) / d.days.length : null;
  const n = d?.days.length ?? 0;
  const dayLabel = (date: string) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;

  return (
    <Card>
      <H2>{title ?? t('temp.trend.title')}</H2>
      {n > 0 && <Muted>{t('temp.trend.period', { n })}</Muted>}

      {lowDay && highDay && (
        <Row gap={8} style={{ alignItems: 'stretch' }}>
          <Stat label={t('temp.trend.low')} value={fmtC(lowDay.minC)} sub={dayLabel(lowDay.date)} tone={zoneColor[zoneOf(lowDay.minC)]} />
          <Stat label={t('temp.trend.high')} value={fmtC(highDay.maxC)} sub={dayLabel(highDay.date)} tone={zoneColor[zoneOf(highDay.maxC)]} />
          {avg !== null && <Stat label={t('temp.trend.average')} value={fmtC(avg)} sub={t('temp.trend.allDays')} tone={zoneColor[zoneOf(avg)]} />}
        </Row>
      )}

      <View style={s.divider} />
      <ChartBlock title={t('chart.lineTitle')} hint={t('chart.lineHint')}>
        <Choice
          options={[
            { value: '24', label: t('detail.24h') },
            { value: '168', label: t('detail.7d') },
            { value: '360', label: t('detail.15d') },
          ]}
          value={range}
          onChange={setRange}
        />
        <View style={{ marginTop: 8 }}>
          {temps.data && temps.data.points.length > 0 ? (
            <TempChart points={temps.data.points} episodes={episodes} from={now - Number(range) * 3_600_000} to={now} />
          ) : (
            <Muted>{temps.loading ? t('common.loading') : t('temp.trend.none')}</Muted>
          )}
        </View>
      </ChartBlock>

      {d && d.days.length > 0 && (
        <>
          <View style={s.divider} />
          <ChartBlock title={t('temp.trend.daily')} hint={t('chart.rangeHint')}>
            <TempRangeChart days={d.days} />
          </ChartBlock>
        </>
      )}

      <View style={s.divider} />
      <ExportData babyId={babyId} />
    </Card>
  );
}

/** Download the band data as a CSV file (Excel, Google Sheets). */
export function ExportData({ babyId }: { babyId: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(kind: ExportKind) {
    setBusy(kind);
    setResult(null);
    try {
      const name = await exportBabyData(babyId, kind, 15);
      setResult({ ok: true, text: t('export.done', { name }) });
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiError && e.offline ? t('export.offline') : t('export.failed') });
    } finally {
      setBusy(null);
    }
  }
  return (
    <ChartBlock title={t('export.title')} hint={t('export.hint')}>
      <View style={{ gap: 8 }}>
        <Button kind="secondary" icon="download" label={t('export.readings')} busy={busy === 'readings'} disabled={busy !== null} onPress={() => void run('readings')} />
        <Button kind="secondary" icon="download" label={t('export.daily')} busy={busy === 'daily'} disabled={busy !== null} onPress={() => void run('daily')} />
        {result &&
          (result.ok ? (
            <Success>{result.text}</Success>
          ) : (
            <IconLine icon="cancel" color={statusColor.red.text}>
              {result.text}
            </IconLine>
          ))}
      </View>
    </ChartBlock>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 26, color: color.text },
  value: { fontFamily: fontFamily.heading, fontSize: 34, lineHeight: 40 },
  zoneChip: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    color: color.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.chip,
    overflow: 'hidden',
  },
  stat: {
    flex: 1,
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    backgroundColor: color.background,
  },
  statValue: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, lineHeight: 24, color: color.text },
  statLabel: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16, color: color.textMuted },
  sub: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.text },
  divider: { height: 1, backgroundColor: color.border, marginVertical: 4 },
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: color.action },
});
