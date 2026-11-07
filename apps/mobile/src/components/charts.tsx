import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line as SvgLine, Polyline, Rect, Circle, Text as SvgText } from 'react-native-svg';

import { KMC_TARGET_HOURS, istMidnight, type EpisodeDto, type Status, type StatusChangeDto } from '@neobridge/domain';
import { defaultConfig } from '@neobridge/rules';
import { color, status as statusColor } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';

const fill: Record<Status, string> = {
  green: statusColor.green.fill,
  yellow: statusColor.yellow.fill,
  red: statusColor.red.fill,
  grey: statusColor.grey.fill,
};

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(200, Math.floor(e.nativeEvent.layout.width)))];
}

/** M4: a strip of today's statuses, midnight to now. */
export function StatusStrip({ changes, date, now }: { changes: StatusChangeDto[]; date: string; now: number }) {
  const start = istMidnight(date);
  const end = Math.min(now, start + 86_400_000);
  const span = Math.max(1, end - start);
  const before = [...changes].filter((c) => Date.parse(c.at) < start).pop();
  const today = changes.filter((c) => Date.parse(c.at) >= start && Date.parse(c.at) <= end);
  const points = [{ at: start, status: before?.status ?? 'grey' }, ...today.map((c) => ({ at: Date.parse(c.at), status: c.status }))];
  return (
    <View>
      <View style={styles.strip}>
        {points.map((p, i) => {
          const next = points[i + 1]?.at ?? end;
          const pct = ((next - p.at) / span) * 100;
          return <View key={i} style={{ width: `${pct}%`, backgroundColor: fill[p.status as Status] }} />;
        })}
      </View>
      <View style={styles.stripAxis}>
        <Text style={styles.axis}>0:00</Text>
        <Text style={styles.axis}>{new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </View>
  );
}

/** KMC hours per day against the 8-hour line (M13, D5). */
export function KmcBars({ days, height = 120 }: { days: { date: string; hours: number }[]; height?: number }) {
  const [w, onLayout] = useWidth();
  const max = Math.max(KMC_TARGET_HOURS + 2, ...days.map((d) => d.hours));
  const pad = 22;
  const bw = (w - pad) / Math.max(1, days.length);
  const y = (h: number) => height - 18 - (h / max) * (height - 26);
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        {days.map((d, i) => (
          <G key={d.date}>
            <Rect
              x={pad + i * bw + bw * 0.18}
              y={y(d.hours)}
              width={bw * 0.64}
              height={Math.max(1, height - 18 - y(d.hours))}
              rx={4}
              fill={d.hours >= KMC_TARGET_HOURS ? statusColor.green.fill : statusColor.yellow.fill}
            />
            <SvgText x={pad + i * bw + bw / 2} y={height - 4} fontSize={10} fill={color.textMuted} textAnchor="middle">
              {d.date.slice(8)}
            </SvgText>
            <SvgText x={pad + i * bw + bw / 2} y={y(d.hours) - 3} fontSize={10} fill={color.text} textAnchor="middle">
              {d.hours.toFixed(1)}
            </SvgText>
          </G>
        ))}
        <SvgLine x1={pad} x2={w} y1={y(KMC_TARGET_HOURS)} y2={y(KMC_TARGET_HOURS)} stroke={color.text} strokeDasharray="4 4" strokeWidth={1} />
        <SvgText x={2} y={y(KMC_TARGET_HOURS) + 4} fontSize={10} fill={color.text}>
          8h
        </SvgText>
      </Svg>
    </View>
  );
}

/**
 * D5: skin temperature medians with the rule set's lines drawn across and
 * status episodes shaded behind.
 */
export function TempChart({
  points,
  episodes,
  from,
  to,
  height = 180,
}: {
  points: { t: number; skinC: number }[];
  episodes: EpisodeDto[];
  from: number;
  to: number;
  height?: number;
}) {
  const [w, onLayout] = useWidth();
  const lo = 33.5;
  const hi = 39;
  const left = 30;
  const x = (t: number) => left + ((t - from) / Math.max(1, to - from)) * (w - left - 4);
  const y = (c: number) => 6 + ((hi - Math.min(hi, Math.max(lo, c))) / (hi - lo)) * (height - 24);
  const lines = [
    { c: defaultConfig.hotC, label: 'hot', stroke: statusColor.red.fill },
    { c: defaultConfig.coldC, label: 'cold', stroke: statusColor.yellow.strong },
    { c: defaultConfig.veryColdC, label: 'v.cold', stroke: statusColor.red.fill },
  ];
  // break the line where readings stop for more than 20 minutes
  const segments: { t: number; skinC: number }[][] = [];
  for (const p of points) {
    const seg = segments[segments.length - 1];
    if (!seg || p.t - seg[seg.length - 1].t > 20 * 60_000) segments.push([p]);
    else seg.push(p);
  }
  const hours = (to - from) / 3_600_000;
  const ticks = hours > 30 ? 7 : 4;
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        {episodes.map((e) => {
          const a = Math.max(from, Date.parse(e.startedAt));
          const b = Math.min(to, e.closedAt ? Date.parse(e.closedAt) : to);
          if (b <= from || a >= to) return null;
          return (
            <Rect
              key={e.id}
              x={x(a)}
              y={0}
              width={Math.max(2, x(b) - x(a))}
              height={height - 18}
              fill={e.kind === 'red' ? statusColor.red.soft : statusColor.yellow.panel}
            />
          );
        })}
        {lines.map((l) => (
          <G key={l.label}>
            <SvgLine x1={left} x2={w} y1={y(l.c)} y2={y(l.c)} stroke={l.stroke} strokeDasharray="5 4" strokeWidth={1} />
            <SvgText x={0} y={y(l.c) + 3} fontSize={9} fill={l.stroke}>
              {l.c.toFixed(1)}
            </SvgText>
          </G>
        ))}
        {segments.map((seg, i) =>
          seg.length === 1 ? (
            <Circle key={i} cx={x(seg[0].t)} cy={y(seg[0].skinC)} r={2} fill={color.action} />
          ) : (
            <Polyline
              key={i}
              points={seg.map((p) => `${x(p.t)},${y(p.skinC)}`).join(' ')}
              fill="none"
              stroke={color.action}
              strokeWidth={2}
            />
          ),
        )}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const t = from + ((to - from) * i) / ticks;
          const d = new Date(t);
          const label = hours > 30 ? `${d.getDate()}/${d.getMonth() + 1}` : `${String(d.getHours()).padStart(2, '0')}:00`;
          return (
            <SvgText key={i} x={x(t)} y={height - 4} fontSize={9} fill={color.textMuted} textAnchor={i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}>
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/** D5: one point per weight, with the gain between visits. */
export function WeightChart({ weights, height = 140 }: { weights: { at: string; grams: number; gainGPerKgDay: number | null }[]; height?: number }) {
  const [w, onLayout] = useWidth();
  if (weights.length === 0) return null;
  const min = Math.min(...weights.map((p) => p.grams)) - 100;
  const max = Math.max(...weights.map((p) => p.grams)) + 100;
  const t0 = Date.parse(weights[0].at);
  const t1 = Math.max(t0 + 86_400_000, Date.parse(weights[weights.length - 1].at));
  const left = 40;
  const x = (at: string) => left + ((Date.parse(at) - t0) / (t1 - t0)) * (w - left - 16);
  const y = (g: number) => 8 + ((max - g) / (max - min)) * (height - 30);
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Polyline points={weights.map((p) => `${x(p.at)},${y(p.grams)}`).join(' ')} fill="none" stroke={color.action} strokeWidth={2} />
        {weights.map((p, i) => (
          <G key={i}>
            <Circle cx={x(p.at)} cy={y(p.grams)} r={4} fill={color.action} />
            <SvgText x={x(p.at)} y={y(p.grams) - 8} fontSize={10} fill={color.text} textAnchor="middle">
              {p.grams}
            </SvgText>
            {p.gainGPerKgDay !== null && (
              <SvgText
                x={x(p.at)}
                y={height - 4}
                fontSize={9}
                fill={p.gainGPerKgDay < 5 ? statusColor.red.text : statusColor.green.fill}
                textAnchor="middle">
                {p.gainGPerKgDay > 0 ? '+' : ''}
                {p.gainGPerKgDay}
              </SvgText>
            )}
          </G>
        ))}
        <SvgText x={0} y={12} fontSize={9} fill={color.textMuted}>
          g
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', height: 22, borderRadius: 8, overflow: 'hidden', backgroundColor: color.track },
  stripAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axis: { fontFamily: fontFamily.body, fontSize: 11, color: color.textMuted },
});

// ---- temperature level and trend ---------------------------------------------------

/** The scale the gauge shows: below and above anything a newborn's skin reads. */
export const GAUGE_MIN_C = 32;
export const GAUGE_MAX_C = 40;

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
  return (
    <View style={{ paddingTop: 30 }}>
      {value !== null && (
        <View style={[g.markerWrap, { left: `${gaugePct(value)}%` }]} pointerEvents="none">
          <Text style={[g.markerText, { backgroundColor: zoneColor[zoneOf(value)] }]}>{labels.now}</Text>
          <View style={[g.markerArrow, { borderTopColor: zoneColor[zoneOf(value)] }]} />
        </View>
      )}
      <View style={g.bar}>
        {zones.map((z, i) => (
          <View key={z} style={{ width: `${gaugePct(cuts[i + 1]) - gaugePct(cuts[i])}%`, backgroundColor: zoneColor[z], opacity: 0.85 }} />
        ))}
      </View>
      {[low, high].map((c, i) =>
        c == null ? null : <View key={i} style={[g.tick, { left: `${gaugePct(c)}%` }]} />,
      )}
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

export interface TempDay {
  date: string;
  minC: number;
  maxC: number;
  avgC: number;
}

/** Each day's low-to-high band with its average, against the status lines. */
export function TempRangeChart({ days, height = 190 }: { days: TempDay[]; height?: number }) {
  const [w, onLayout] = useWidth();
  if (days.length === 0) return null;
  const lo = Math.min(34, ...days.map((d) => d.minC)) - 0.2;
  const hi = Math.max(38, ...days.map((d) => d.maxC)) + 0.2;
  const left = 32;
  const bottom = 18;
  const bw = (w - left - 4) / days.length;
  const y = (c: number) => 6 + ((hi - c) / (hi - lo)) * (height - bottom - 10);
  const every = days.length > 10 ? 2 : 1;
  const lines = [
    { c: defaultConfig.hotC, stroke: statusColor.red.fill },
    { c: defaultConfig.coldC, stroke: statusColor.yellow.strong },
    { c: defaultConfig.veryColdC, stroke: statusColor.red.fill },
  ];
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Rect x={left} y={y(defaultConfig.hotC)} width={w - left} height={y(defaultConfig.coldC) - y(defaultConfig.hotC)} fill={statusColor.green.panel} />
        {lines.map((l) => (
          <G key={l.c}>
            <SvgLine x1={left} x2={w} y1={y(l.c)} y2={y(l.c)} stroke={l.stroke} strokeDasharray="5 4" strokeWidth={1} />
            <SvgText x={0} y={y(l.c) + 3} fontSize={9} fill={l.stroke}>
              {l.c.toFixed(1)}
            </SvgText>
          </G>
        ))}
        {days.map((d, i) => {
          const cx = left + i * bw + bw / 2;
          const worst = d.minC < defaultConfig.coldC ? zoneOf(d.minC) : zoneOf(d.maxC);
          const barW = Math.max(4, Math.min(14, bw * 0.5));
          return (
            <G key={d.date}>
              <Rect
                x={cx - barW / 2}
                y={y(d.maxC)}
                width={barW}
                height={Math.max(3, y(d.minC) - y(d.maxC))}
                rx={barW / 2}
                fill={zoneColor[worst]}
              />
              <Circle cx={cx} cy={y(d.avgC)} r={Math.max(2, barW / 3)} fill={color.surface} stroke={color.text} strokeWidth={1} />
              {(i % every === 0 || i === days.length - 1) && (
                <SvgText x={cx} y={height - 4} fontSize={9} fill={color.textMuted} textAnchor="middle">
                  {`${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}`}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const g = StyleSheet.create({
  bar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden' },
  markerWrap: { position: 'absolute', top: 0, width: 60, marginLeft: -30, alignItems: 'center' },
  markerText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11,
    color: color.surface,
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
  tick: { position: 'absolute', top: 26, width: 3, height: 24, marginLeft: -1.5, borderRadius: 2, backgroundColor: color.text },
  cutRow: { height: 16, marginTop: 4 },
  cut: { position: 'absolute', width: 30, marginLeft: -15, textAlign: 'center', fontFamily: fontFamily.body, fontSize: 10, color: color.textMuted },
  zoneRow: { flexDirection: 'row', marginTop: 2 },
  zone: { fontFamily: fontFamily.body, fontSize: 10, textAlign: 'center' },
});
