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
