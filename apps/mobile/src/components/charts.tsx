import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Path, Rect, Text as SvgText } from 'react-native-svg';

import { KMC_TARGET_HOURS, istMidnight, type EpisodeDto, type Status, type StatusChangeDto } from '@neobridge/domain';
import { defaultConfig } from '@neobridge/rules';
import { color, status as statusColor } from '@neobridge/tokens';

import { useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';

/*
 * Charts. One look for all of them: light gridlines, a labelled axis on the
 * left, the temperature zones shaded behind and named on the right, the last
 * value marked, and a legend underneath that says what each mark means.
 */

const fill: Record<Status, string> = {
  green: statusColor.green.fill,
  yellow: statusColor.yellow.fill,
  red: statusColor.red.fill,
  grey: statusColor.grey.fill,
};

const AXIS = color.textMuted;
const GRID = '#ebe8e3';
const LINE = color.action;
const FONT = 10;
/** room at the right of temperature charts for the zone names */
const GUTTER = 56;

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(220, Math.floor(e.nativeEvent.layout.width)))];
}

const dm = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ---- legend ---------------------------------------------------------------------------

type Swatch = 'line' | 'dashed' | 'box' | 'dot' | 'bar';

export function Legend({ items }: { items: { swatch: Swatch; color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          {i.swatch === 'line' && <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: i.color }} />}
          {i.swatch === 'dashed' && (
            <View style={{ width: 18, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: i.color }} />
          )}
          {i.swatch === 'box' && <View style={{ width: 14, height: 12, borderRadius: 3, backgroundColor: i.color }} />}
          {i.swatch === 'bar' && <View style={{ width: 6, height: 14, borderRadius: 3, backgroundColor: i.color }} />}
          {i.swatch === 'dot' && (
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.surface, borderWidth: 2, borderColor: i.color }} />
          )}
          <Text style={styles.legendText}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ---- temperature zones ------------------------------------------------------------------

export type TempZone = 'veryCold' | 'cold' | 'normal' | 'hot';

export function zoneOf(c: number): TempZone {
  if (c < defaultConfig.veryColdC) return 'veryCold';
  if (c < defaultConfig.coldC) return 'cold';
  if (c > defaultConfig.hotC) return 'hot';
  return 'normal';
}

export const zoneColor: Record<TempZone, string> = {
  veryCold: statusColor.red.fill,
  cold: statusColor.yellow.fill,
  normal: statusColor.green.fill,
  hot: statusColor.red.fill,
};

/** Readable text colour on top of a zone colour. */
export const zoneInk: Record<TempZone, string> = {
  veryCold: color.surface,
  cold: color.text,
  normal: color.surface,
  hot: color.surface,
};

const zoneTint: Record<TempZone, string> = {
  veryCold: statusColor.red.soft,
  cold: statusColor.yellow.panel,
  normal: statusColor.green.panel,
  hot: statusColor.red.soft,
};

function useZoneNames(): Record<TempZone, string> {
  const { t } = useT();
  return { veryCold: t('temp.zone.veryCold'), cold: t('temp.zone.cold'), normal: t('temp.zone.normal'), hot: t('temp.zone.hot') };
}

/** The four zones as bands across a temperature chart, named at the right edge. */
function ZoneBands({ x0, x1, y, lo, hi, names }: { x0: number; x1: number; y: (c: number) => number; lo: number; hi: number; names: Record<TempZone, string> }) {
  const bands: { zone: TempZone; from: number; to: number }[] = [
    { zone: 'veryCold', from: lo, to: defaultConfig.veryColdC },
    { zone: 'cold', from: defaultConfig.veryColdC, to: defaultConfig.coldC },
    { zone: 'normal', from: defaultConfig.coldC, to: defaultConfig.hotC },
    { zone: 'hot', from: defaultConfig.hotC, to: hi },
  ];
  return (
    <G>
      {bands.map((b) => {
        const a = Math.max(lo, b.from);
        const z = Math.min(hi, b.to);
        if (z <= a) return null;
        const top = y(z);
        const h = y(a) - top;
        return (
          <G key={b.zone}>
            <Rect x={x0} y={top} width={x1 - x0} height={h} fill={zoneTint[b.zone]} />
            <Rect x={x1} y={top} width={3} height={h} fill={zoneColor[b.zone]} />
            {h >= 11 && (
              <SvgText x={x1 + 7} y={top + h / 2 + 3.5} fontSize={9} fontWeight="600" fill={b.zone === 'cold' ? statusColor.yellow.strong : zoneColor[b.zone]} textAnchor="start">
                {names[b.zone]}
              </SvgText>
            )}
          </G>
        );
      })}
    </G>
  );
}

/** Whole and half degrees that fit between lo and hi. */
function tempTicks(lo: number, hi: number): number[] {
  const step = hi - lo > 4 ? 1 : 0.5;
  const out: number[] = [];
  for (let c = Math.ceil(lo / step) * step; c <= hi + 1e-9; c += step) out.push(Math.round(c * 10) / 10);
  return out;
}

// ---- status strip -----------------------------------------------------------------------

/** M4: a strip of today's statuses, midnight to now, with hour marks and a key. */
export function StatusStrip({ changes, date, now }: { changes: StatusChangeDto[]; date: string; now: number }) {
  const { t } = useT();
  const start = istMidnight(date);
  const end = Math.min(now, start + 86_400_000);
  const span = Math.max(1, end - start);
  const before = [...changes].filter((c) => Date.parse(c.at) < start).pop();
  const today = changes.filter((c) => Date.parse(c.at) >= start && Date.parse(c.at) <= end);
  const points = [{ at: start, status: before?.status ?? 'grey' }, ...today.map((c) => ({ at: Date.parse(c.at), status: c.status }))];
  const marks = [0, 6, 12, 18].map((h) => start + h * 3_600_000).filter((m) => m < end);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.strip}>
        {points.map((p, i) => {
          const next = points[i + 1]?.at ?? end;
          return <View key={i} style={{ width: `${((next - p.at) / span) * 100}%`, backgroundColor: fill[p.status as Status] }} />;
        })}
      </View>
      <View style={{ height: 14 }}>
        {marks.map((m) => (
          <Text key={m} style={[styles.axis, { position: 'absolute', left: `${((m - start) / span) * 100}%` }]}>
            {String(new Date(m).getHours()).padStart(2, '0')}:00
          </Text>
        ))}
        <Text style={[styles.axis, { position: 'absolute', right: 0 }]}>{hm(end)}</Text>
      </View>
      <Legend
        items={[
          { swatch: 'box', color: statusColor.green.fill, label: t('status.green.title') },
          { swatch: 'box', color: statusColor.yellow.fill, label: t('status.yellow.title') },
          { swatch: 'box', color: statusColor.red.fill, label: t('status.red.title') },
          { swatch: 'box', color: statusColor.grey.fill, label: t('status.grey.title') },
        ]}
      />
    </View>
  );
}

// ---- KMC -------------------------------------------------------------------------------

/** KMC hours per day against the 8-hour target (M13, D5). */
export function KmcBars({ days, height = 170 }: { days: { date: string; hours: number }[]; height?: number }) {
  const { t } = useT();
  const [w, onLayout] = useWidth();
  const max = Math.max(KMC_TARGET_HOURS + 2, Math.ceil(Math.max(0, ...days.map((d) => d.hours))));
  const left = 28;
  const top = 14;
  const bottom = 20;
  const plotH = height - top - bottom;
  const bw = (w - left) / Math.max(1, days.length);
  const y = (h: number) => top + plotH - (h / max) * plotH;
  const ticks = [0, 4, 8, 12, 16, 20, 24].filter((h) => h <= max);
  return (
    <View onLayout={onLayout} style={{ gap: 6 }}>
      <Svg width={w} height={height}>
        {ticks.map((h) => (
          <G key={h}>
            <SvgLine x1={left} x2={w} y1={y(h)} y2={y(h)} stroke={GRID} strokeWidth={1} />
            <SvgText x={left - 6} y={y(h) + 3.5} fontSize={FONT} fill={AXIS} textAnchor="end">
              {h}h
            </SvgText>
          </G>
        ))}
        {days.map((d, i) => {
          const met = d.hours >= KMC_TARGET_HOURS;
          const barW = Math.min(28, bw * 0.6);
          const cx = left + i * bw + bw / 2;
          return (
            <G key={d.date}>
              <Rect x={cx - barW / 2} y={y(d.hours)} width={barW} height={Math.max(2, y(0) - y(d.hours))} rx={4} fill={met ? statusColor.green.fill : statusColor.yellow.fill} />
              {d.hours > 0 && (
                <SvgText x={cx} y={y(d.hours) - 4} fontSize={FONT} fontWeight="600" fill={color.text} textAnchor="middle">
                  {d.hours.toFixed(1)}
                </SvgText>
              )}
              <SvgText x={cx} y={height - 5} fontSize={FONT} fill={AXIS} textAnchor="middle">
                {`${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}`}
              </SvgText>
            </G>
          );
        })}
        <SvgLine x1={left} x2={w} y1={y(KMC_TARGET_HOURS)} y2={y(KMC_TARGET_HOURS)} stroke={color.text} strokeDasharray="5 4" strokeWidth={1.5} />
      </Svg>
      <Legend
        items={[
          { swatch: 'box', color: statusColor.green.fill, label: t('chart.kmcMet') },
          { swatch: 'box', color: statusColor.yellow.fill, label: t('chart.kmcShort') },
          { swatch: 'dashed', color: color.text, label: t('chart.kmcTarget') },
        ]}
      />
    </View>
  );
}

// ---- temperature line -------------------------------------------------------------------

/**
 * Skin temperature over time: the zones shaded behind, °C on the left, alert
 * periods marked, and the latest reading labelled at the end of the line.
 */
export function TempChart({
  points,
  episodes,
  from,
  to,
  height = 220,
}: {
  points: { t: number; skinC: number }[];
  episodes: EpisodeDto[];
  from: number;
  to: number;
  height?: number;
}) {
  const { t } = useT();
  const names = useZoneNames();
  const [w, onLayout] = useWidth();
  const vals = points.map((p) => p.skinC);
  const lo = Math.floor((Math.min(defaultConfig.veryColdC - 0.5, ...vals) - 0.2) * 2) / 2;
  const hi = Math.ceil((Math.max(defaultConfig.hotC + 0.4, ...vals) + 0.2) * 2) / 2;
  const left = 34;
  const right = GUTTER;
  const top = 10;
  const bottom = 22;
  const x = (tm: number) => left + ((tm - from) / Math.max(1, to - from)) * (w - left - right);
  const y = (c: number) => top + ((hi - Math.min(hi, Math.max(lo, c))) / (hi - lo)) * (height - top - bottom);

  // break the line where readings stop for more than 3 buckets
  const gap = points.length > 1 ? Math.max(20 * 60_000, (points[1].t - points[0].t) * 3) : 20 * 60_000;
  const segments: { t: number; skinC: number }[][] = [];
  for (const p of points) {
    const seg = segments[segments.length - 1];
    if (!seg || p.t - seg[seg.length - 1].t > gap) segments.push([p]);
    else seg.push(p);
  }
  const path = (seg: { t: number; skinC: number }[]) => seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.skinC).toFixed(1)}`).join(' ');

  const hours = (to - from) / 3_600_000;
  const xTicks = hours > 30 ? Math.min(7, Math.round(hours / 48) + 3) : 4;
  const last = points[points.length - 1];
  const alerts = episodes.filter((e) => {
    const a = Date.parse(e.startedAt);
    const b = e.closedAt ? Date.parse(e.closedAt) : to;
    return b > from && a < to;
  });

  return (
    <View onLayout={onLayout} style={{ gap: 6 }}>
      <Svg width={w} height={height}>
        <ZoneBands x0={left} x1={w - right} y={y} lo={lo} hi={hi} names={names} />
        {tempTicks(lo, hi).map((c) => (
          <G key={c}>
            <SvgLine x1={left} x2={w - right} y1={y(c)} y2={y(c)} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1} />
            <SvgText x={left - 6} y={y(c) + 3.5} fontSize={FONT} fill={AXIS} textAnchor="end">
              {Number.isInteger(c) ? `${c}°` : ''}
            </SvgText>
          </G>
        ))}
        {alerts.map((e) => {
          const a = Math.max(from, Date.parse(e.startedAt));
          const b = Math.min(to, e.closedAt ? Date.parse(e.closedAt) : to);
          return (
            <G key={e.id}>
              <Rect x={x(a)} y={top} width={Math.max(3, x(b) - x(a))} height={height - top - bottom} fill={e.kind === 'red' ? statusColor.red.fill : statusColor.yellow.fill} opacity={0.18} />
              <Rect x={x(a)} y={top} width={Math.max(3, x(b) - x(a))} height={3} fill={e.kind === 'red' ? statusColor.red.fill : statusColor.yellow.fill} />
            </G>
          );
        })}
        {segments.map((seg, i) =>
          seg.length === 1 ? (
            <Circle key={i} cx={x(seg[0].t)} cy={y(seg[0].skinC)} r={2.5} fill={LINE} />
          ) : (
            <G key={i}>
              <Path d={path(seg)} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            </G>
          ),
        )}
        {last && (
          <G>
            <Circle cx={x(last.t)} cy={y(last.skinC)} r={5} fill={color.surface} stroke={LINE} strokeWidth={2.5} />
            <Rect x={Math.max(left, Math.min(x(last.t) - 50, w - right - 50))} y={Math.max(top, y(last.skinC) - 26)} width={42} height={18} rx={9} fill={LINE} />
            <SvgText x={Math.max(left, Math.min(x(last.t) - 50, w - right - 50)) + 21} y={Math.max(top, y(last.skinC) - 26) + 12.5} fontSize={10} fontWeight="700" fill={color.surface} textAnchor="middle">
              {`${last.skinC.toFixed(1)}°`}
            </SvgText>
          </G>
        )}
        <SvgLine x1={left} x2={w - right} y1={height - bottom} y2={height - bottom} stroke={color.border} strokeWidth={1} />
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const tm = from + ((to - from) * i) / xTicks;
          return (
            <SvgText
              key={i}
              x={x(tm)}
              y={height - 6}
              fontSize={FONT}
              fill={AXIS}
              textAnchor={i === 0 ? 'start' : i === xTicks ? 'end' : 'middle'}>
              {hours > 30 ? dm(tm) : hm(tm)}
            </SvgText>
          );
        })}
      </Svg>
      <Legend
        items={[
          { swatch: 'line', color: LINE, label: t('chart.skin') },
          { swatch: 'box', color: statusColor.green.panel, label: t('chart.normalRange') },
          ...(alerts.length ? [{ swatch: 'box' as const, color: '#f6c9c5', label: t('chart.alertPeriod') }] : []),
        ]}
      />
    </View>
  );
}

// ---- weight ----------------------------------------------------------------------------

/** D5 / M14: weight in kg over time, with the gain between points (g/kg/day). */
export function WeightChart({ weights, height = 180 }: { weights: { at: string; grams: number; gainGPerKgDay: number | null }[]; height?: number }) {
  const { t } = useT();
  const [w, onLayout] = useWidth();
  if (weights.length === 0) return null;
  const kg = weights.map((p) => p.grams / 1000);
  const lo = Math.floor((Math.min(...kg) - 0.1) * 10) / 10;
  const hi = Math.ceil((Math.max(...kg) + 0.1) * 10) / 10;
  const t0 = Date.parse(weights[0].at);
  const t1 = Math.max(t0 + 86_400_000, Date.parse(weights[weights.length - 1].at));
  const left = 38;
  const right = 18;
  const top = 22;
  const bottom = 34;
  const x = (at: string) => left + ((Date.parse(at) - t0) / (t1 - t0)) * (w - left - right);
  const y = (k: number) => top + ((hi - k) / Math.max(0.1, hi - lo)) * (height - top - bottom);
  const step = hi - lo > 1 ? 0.5 : hi - lo > 0.4 ? 0.2 : 0.1;
  const ticks: number[] = [];
  for (let k = Math.ceil(lo / step) * step; k <= hi + 1e-9; k += step) ticks.push(Math.round(k * 10) / 10);
  const line = weights.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.grams / 1000).toFixed(1)}`).join(' ');
  return (
    <View onLayout={onLayout} style={{ gap: 6 }}>
      <Svg width={w} height={height}>
        {ticks.map((k) => (
          <G key={k}>
            <SvgLine x1={left} x2={w - right} y1={y(k)} y2={y(k)} stroke={GRID} strokeWidth={1} />
            <SvgText x={left - 6} y={y(k) + 3.5} fontSize={FONT} fill={AXIS} textAnchor="end">
              {k.toFixed(1)}
            </SvgText>
          </G>
        ))}
        <SvgText x={0} y={10} fontSize={FONT} fill={AXIS}>
          kg
        </SvgText>
        <Path d={line} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" />
        {weights.map((p, i) => (
          <G key={i}>
            <Circle cx={x(p.at)} cy={y(p.grams / 1000)} r={5} fill={color.surface} stroke={LINE} strokeWidth={2.5} />
            <SvgText x={x(p.at)} y={y(p.grams / 1000) - 10} fontSize={FONT} fontWeight="700" fill={color.text} textAnchor="middle">
              {(p.grams / 1000).toFixed(2)}
            </SvgText>
            <SvgText x={x(p.at)} y={height - 20} fontSize={FONT} fill={AXIS} textAnchor="middle">
              {dm(Date.parse(p.at))}
            </SvgText>
            {p.gainGPerKgDay !== null && (
              <SvgText
                x={x(p.at)}
                y={height - 5}
                fontSize={9}
                fontWeight="600"
                fill={p.gainGPerKgDay < 5 ? statusColor.red.text : statusColor.green.fill}
                textAnchor="middle">
                {`${p.gainGPerKgDay > 0 ? '+' : ''}${p.gainGPerKgDay}`}
              </SvgText>
            )}
          </G>
        ))}
      </Svg>
      <Legend
        items={[
          { swatch: 'dot', color: LINE, label: t('chart.weight') },
          { swatch: 'box', color: statusColor.green.fill, label: t('chart.gainGood') },
          { swatch: 'box', color: statusColor.red.text, label: t('chart.gainLow') },
        ]}
      />
    </View>
  );
}

// ---- temperature level gauge ------------------------------------------------------------

/** The scale the gauge shows: below and above anything a newborn's skin reads. */
export const GAUGE_MIN_C = 32;
export const GAUGE_MAX_C = 40;

const gaugePct = (c: number) =>
  ((Math.min(GAUGE_MAX_C, Math.max(GAUGE_MIN_C, c)) - GAUGE_MIN_C) / (GAUGE_MAX_C - GAUGE_MIN_C)) * 100;

/**
 * A level indicator: the scale from 32 to 40 °C in its four zones (very cold,
 * cold, normal, too warm, from the status rules), a marker at the current
 * reading, and ticks at today's low and high.
 */
export function TempGauge({
  value,
  low,
  high,
  labels,
}: {
  value: number | null;
  low?: number | null;
  high?: number | null;
  labels: Record<TempZone, string> & { now: string };
}) {
  const cuts = [GAUGE_MIN_C, defaultConfig.veryColdC, defaultConfig.coldC, defaultConfig.hotC, GAUGE_MAX_C];
  const zones: TempZone[] = ['veryCold', 'cold', 'normal', 'hot'];
  const zone = value === null ? null : zoneOf(value);
  return (
    <View style={{ paddingTop: 30 }}>
      {value !== null && zone && (
        <View style={[g.markerWrap, { left: `${gaugePct(value)}%` }]} pointerEvents="none">
          <Text style={[g.markerText, { backgroundColor: zoneColor[zone], color: zoneInk[zone] }]}>{labels.now}</Text>
          <View style={[g.markerArrow, { borderTopColor: zoneColor[zone] }]} />
        </View>
      )}
      <View style={g.bar}>
        {zones.map((z, i) => (
          <View key={z} style={{ width: `${gaugePct(cuts[i + 1]) - gaugePct(cuts[i])}%`, backgroundColor: zoneColor[z], opacity: 0.85 }} />
        ))}
      </View>
      {low != null && high != null && (
        <View style={[g.range, { left: `${gaugePct(low)}%`, width: `${Math.max(1, gaugePct(high) - gaugePct(low))}%` }]} />
      )}
      {value !== null && <View style={[g.needle, { left: `${gaugePct(value)}%` }]} />}
      <View style={g.cutRow}>
        {cuts.map((c, i) => (
          <Text
            key={c}
            style={[
              g.cut,
              { left: `${gaugePct(c)}%` },
              i === 0 ? { marginLeft: 0, textAlign: 'left' } : i === cuts.length - 1 ? { marginLeft: -30, textAlign: 'right' } : null,
            ]}>
            {c.toFixed(c % 1 ? 1 : 0)}°
          </Text>
        ))}
      </View>
      <View style={g.zoneRow}>
        {zones.map((z, i) => (
          <Text
            key={z}
            numberOfLines={2}
            style={[g.zone, { width: `${gaugePct(cuts[i + 1]) - gaugePct(cuts[i])}%`, color: z === 'normal' ? statusColor.green.heading : color.textMuted }]}>
            {labels[z]}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---- daily low / high -------------------------------------------------------------------

export interface TempDay {
  date: string;
  minC: number;
  maxC: number;
  avgC: number;
}

/** Each day from its lowest to its highest reading, the average marked, zones behind. */
export function TempRangeChart({ days, height = 220 }: { days: TempDay[]; height?: number }) {
  const { t } = useT();
  const names = useZoneNames();
  const [w, onLayout] = useWidth();
  if (days.length === 0) return null;
  const lo = Math.floor((Math.min(defaultConfig.veryColdC - 0.5, ...days.map((d) => d.minC)) - 0.2) * 2) / 2;
  const hi = Math.ceil((Math.max(defaultConfig.hotC + 0.4, ...days.map((d) => d.maxC)) + 0.2) * 2) / 2;
  const left = 34;
  const right = GUTTER;
  const top = 10;
  const bottom = 22;
  const bw = (w - left - right) / days.length;
  const y = (c: number) => top + ((hi - c) / (hi - lo)) * (height - top - bottom);
  const every = days.length > 10 ? 2 : 1;
  const barW = Math.max(6, Math.min(16, bw * 0.55));
  return (
    <View onLayout={onLayout} style={{ gap: 6 }}>
      <Svg width={w} height={height}>
        <ZoneBands x0={left} x1={w - right} y={y} lo={lo} hi={hi} names={names} />
        {tempTicks(lo, hi).map((c) => (
          <G key={c}>
            <SvgLine x1={left} x2={w - right} y1={y(c)} y2={y(c)} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1} />
            <SvgText x={left - 6} y={y(c) + 3.5} fontSize={FONT} fill={AXIS} textAnchor="end">
              {Number.isInteger(c) ? `${c}°` : ''}
            </SvgText>
          </G>
        ))}
        {days.map((d, i) => {
          const cx = left + i * bw + bw / 2;
          const worst = d.minC < defaultConfig.coldC ? zoneOf(d.minC) : zoneOf(d.maxC);
          return (
            <G key={d.date}>
              <Rect x={cx - barW / 2} y={y(d.maxC)} width={barW} height={Math.max(4, y(d.minC) - y(d.maxC))} rx={barW / 2} fill={zoneColor[worst]} />
              <Circle cx={cx} cy={y(d.avgC)} r={barW / 2 - 1.5} fill={color.surface} />
              {(i % every === (days.length - 1) % every || i === days.length - 1) && (
                <SvgText x={cx} y={height - 6} fontSize={FONT} fill={AXIS} textAnchor="middle">
                  {`${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}`}
                </SvgText>
              )}
            </G>
          );
        })}
        <SvgLine x1={left} x2={w - right} y1={height - bottom} y2={height - bottom} stroke={color.border} strokeWidth={1} />
      </Svg>
      <Legend
        items={[
          { swatch: 'bar', color: statusColor.green.fill, label: t('chart.lowHigh') },
          { swatch: 'dot', color: statusColor.green.fill, label: t('temp.trend.average') },
          { swatch: 'bar', color: statusColor.yellow.fill, label: t('chart.dayCold') },
          { swatch: 'bar', color: statusColor.red.fill, label: t('chart.dayAlert') },
        ]}
      />
    </View>
  );
}

/** A titled block for a chart: heading, one-line explanation, then the chart. */
export function ChartBlock({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.blockTitle}>{title}</Text>
      {hint && <Text style={styles.blockHint}>{hint}</Text>}
      <View style={{ marginTop: 4 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', height: 22, borderRadius: 8, overflow: 'hidden', backgroundColor: color.track },
  axis: { fontFamily: fontFamily.body, fontSize: 11, color: AXIS },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
  blockTitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: color.text },
  blockHint: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
});

const g = StyleSheet.create({
  bar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden' },
  markerWrap: { position: 'absolute', top: 0, width: 60, marginLeft: -30, alignItems: 'center' },
  markerText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  range: { position: 'absolute', top: 36, height: 4, borderRadius: 2, backgroundColor: color.text, opacity: 0.55 },
  needle: { position: 'absolute', top: 28, width: 4, height: 20, marginLeft: -2, borderRadius: 2, backgroundColor: color.text },
  cutRow: { height: 16, marginTop: 4 },
  cut: { position: 'absolute', width: 30, marginLeft: -15, textAlign: 'center', fontFamily: fontFamily.body, fontSize: 10, color: color.textMuted },
  zoneRow: { flexDirection: 'row', marginTop: 2 },
  zone: { fontFamily: fontFamily.body, fontSize: 10, textAlign: 'center' },
});
