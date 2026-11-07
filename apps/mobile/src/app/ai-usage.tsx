import { StyleSheet, Text, View } from 'react-native';

import { ago, type Key } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { useApi } from '@/api/cache';
import { AI_COLOR, AiTag } from '@/components/ai';
import { Icon } from '@/components/icon';
import { Card, H1, H2, Muted, QueryView, Row, Screen, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';

interface Usage {
  demo: boolean;
  model: string;
  totals: {
    calls: number;
    modelCalls: number;
    cachedCalls: number;
    ruleCalls: number;
    inputTokens: number;
    outputTokens: number;
    avgMs: number;
    babies: number;
    costUsd: number;
  };
  byFeature: { feature: string; calls: number; modelCalls: number; tokens: number }[];
  daily: { date: string; calls: number; tokens: number }[];
  recent: { feature: string; lang: string; source: string; model: string | null; cached: boolean; tokens: number; ms: number; at: string }[];
}

const FEATURES = ['summary', 'visit_plan'] as const;
const fmtN = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-IN'));

/** "AI in NeoBridge": where AI is used, how much (calls, tokens, cost) and how it is kept safe. */
export default function AiUsageScreen() {
  const { t, lang } = useT();
  const q = useApi<Usage>('/v1/ai/usage', { pollMs: 30_000 });

  return (
    <Screen back>
      <Row gap={8}>
        <Icon name="sparkle" size={26} color={AI_COLOR} />
        <H1>{t('ai.usage.title')}</H1>
      </Row>
      <QueryView q={q}>
        {(u) => {
          const maxCalls = Math.max(1, ...u.daily.map((d) => d.calls));
          return (
            <>
              <View style={[s.status, { backgroundColor: u.demo ? '#efedfb' : statusColor.yellow.panel }]}>
                <Icon name={u.demo ? 'sparkle' : 'circle'} size={18} color={u.demo ? AI_COLOR : statusColor.yellow.strong} />
                <Text style={s.statusText}>{u.demo ? t('ai.usage.demo', { model: u.model }) : t('ai.usage.off')}</Text>
              </View>

              <View style={s.grid}>
                <Tile label={t('ai.usage.calls')} value={fmtN(u.totals.calls)} />
                <Tile label={t('ai.usage.modelCalls')} value={fmtN(u.totals.modelCalls)} />
                <Tile label={t('ai.usage.tokens')} value={fmtN(u.totals.inputTokens + u.totals.outputTokens)} />
                <Tile label={t('ai.usage.cost')} value={`$${u.totals.costUsd.toFixed(u.totals.costUsd < 1 ? 3 : 2)}`} />
                <Tile label={t('ai.usage.speed')} value={u.totals.avgMs ? `${(u.totals.avgMs / 1000).toFixed(1)} s` : '–'} />
              </View>
              {u.totals.cachedCalls > 0 && <Muted>{t('ai.usage.saved', { n: u.totals.cachedCalls })}</Muted>}

              <Card>
                <H2>{t('ai.usage.where')}</H2>
                {FEATURES.map((f) => {
                  const row = u.byFeature.find((x) => x.feature === f);
                  return (
                    <View key={f} style={s.feature}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={s.featureName}>{t(`ai.usage.f.${f}` as Key)}</Text>
                        <AiTag label={t('ai.brand')} />
                      </Row>
                      <Muted>{t(`ai.usage.f.${f}Hint` as Key)}</Muted>
                      <Text style={s.featureCount}>
                        {t('ai.usage.fCount', { n: row?.calls ?? 0, c: row?.modelCalls ?? 0, tk: fmtN(row?.tokens ?? 0) })}
                      </Text>
                    </View>
                  );
                })}
              </Card>

              <Card>
                <H2>{t('ai.usage.week')}</H2>
                {u.daily.length === 0 ? (
                  <Muted>{t('ai.usage.none')}</Muted>
                ) : (
                  <View style={s.bars}>
                    {u.daily.map((d) => (
                      <View key={d.date} style={s.barCol}>
                        <Text style={s.barValue}>{d.calls}</Text>
                        <View style={[s.bar, { height: 8 + (d.calls / maxCalls) * 80 }]} />
                        <Text style={s.barLabel}>{d.date.slice(8)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              {u.recent.length > 0 && (
                <Card>
                  <H2>{t('ai.usage.recent')}</H2>
                  {u.recent.map((r, i) => (
                    <Row key={i} style={s.recent}>
                      <Icon
                        name={r.source === 'rules' ? 'checklist' : 'sparkle'}
                        size={16}
                        color={r.source === 'rules' ? color.textMuted : AI_COLOR}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.recentTitle}>
                          {t(`ai.usage.f.${r.feature}` as Key)} · {r.lang.toUpperCase()}
                        </Text>
                        <Muted style={{ fontSize: 12 }}>
                          {r.cached ? t('ai.cached') : r.source === 'rules' ? 'rules' : `${r.model ?? ''} · ${fmtN(r.tokens)} tokens · ${(r.ms / 1000).toFixed(1)} s`}
                          {' · '}
                          {ago(lang, Date.parse(r.at))}
                        </Muted>
                      </View>
                    </Row>
                  ))}
                </Card>
              )}

              <Card>
                <Row gap={8}>
                  <Icon name="shield" size={20} color={statusColor.green.fill} />
                  <H2>{t('ai.usage.safe')}</H2>
                </Row>
                {(['ai.usage.safe1', 'ai.usage.safe2', 'ai.usage.safe3', 'ai.usage.safe4'] as Key[]).map((k) => (
                  <Row key={k} gap={8} style={{ alignItems: 'flex-start' }}>
                    <Icon name="check" size={18} color={statusColor.green.fill} />
                    <Text style={s.safe}>{t(k)}</Text>
                  </Row>
                ))}
              </Card>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.panel },
  statusText: { flex: 1, fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 14,
    borderRadius: radius.panel,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: 2,
  },
  tileValue: { fontFamily: fontFamily.heading, fontSize: 24, color: AI_COLOR },
  tileLabel: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  feature: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: color.border },
  featureName: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, color: color.text },
  featureCount: { fontFamily: fontFamily.bodySemiBold, fontSize: 13, color: AI_COLOR },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, paddingTop: 8 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 4, backgroundColor: AI_COLOR },
  barValue: { fontFamily: fontFamily.bodySemiBold, fontSize: 12, color: color.text },
  barLabel: { fontFamily: fontFamily.body, fontSize: 11, color: color.textMuted },
  recent: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: color.border },
  recentTitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.text },
  safe: { flex: 1, fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20, color: color.text },
});
