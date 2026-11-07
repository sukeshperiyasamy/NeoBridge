import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BabyListItem } from '@neobridge/domain';
import { ago, type Key } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { useApi } from '@/api/cache';
import { Icon } from '@/components/icon';
import { Card, Muted, Row, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { say } from '@/sound';

/** AI notes from the API (apps/api/src/ai.ts): AI explains the data; the rules still decide alerts. */

export type Audience = 'mother' | 'asha' | 'doctor';

export interface AiMeta {
  source: 'demo' | 'rules';
  model: string | null;
  cached: boolean;
  generatedAt: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

interface SummaryRes {
  audience: Audience;
  summary: { headline: string; points: string[]; action: string; tone: 'green' | 'watch' | 'act' };
  meta: AiMeta;
}

interface PlanRes {
  plan: { overview: string; items: { babyId: string; why: string; todo: string }[] };
  meta: AiMeta;
}

export const AI_COLOR = '#5b4fc4';
const AI_SOFT = '#efedfb';

const toneColor = {
  green: statusColor.green.fill,
  watch: statusColor.yellow.strong,
  act: statusColor.red.fill,
};

/** The small "AI" tag shown on every AI-written block. */
export function AiTag({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <View style={s.tag}>
      <Icon name="sparkle" size={13} color={AI_COLOR} />
      <Text style={s.tagText}>{label ?? t('ai.badge')}</Text>
    </View>
  );
}

function Footer({ meta }: { meta: AiMeta }) {
  const { t, lang } = useT();
  const when = ago(lang, Date.parse(meta.generatedAt));
  const model = meta.model ?? '';
  return (
    <View style={{ gap: 4 }}>
      <Muted style={s.small}>
        {meta.source === 'demo' ? t('ai.byDemo', { model, ago: when }) : t('ai.byRules', { ago: when })}
        {meta.cached ? ` · ${t('ai.cached')}` : ''}
      </Muted>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Icon name="shield" size={13} color={color.textMuted} />
        <Muted style={[s.small, { flex: 1 }]}>{t('ai.safety')}</Muted>
      </Row>
      <Pressable accessibilityRole="link" onPress={() => router.push('/ai-usage')} hitSlop={8}>
        <Text style={s.link}>{t('ai.howUsed')} ›</Text>
      </Pressable>
    </View>
  );
}

function Loading() {
  const { t } = useT();
  return (
    <Row gap={8}>
      <ActivityIndicator color={AI_COLOR} />
      <Muted style={{ flex: 1 }}>{t('ai.reading')}</Muted>
    </Row>
  );
}

/**
 * The AI summary of a baby's last days. Mothers get "Today's update" in
 * simple words with a Listen button; ASHAs a pre-visit brief; doctors a
 * clinical summary.
 */
export function AiSummaryCard({ babyId, audience }: { babyId: string | null | undefined; audience: Audience }) {
  const { t, lang } = useT();
  const q = useApi<SummaryRes>(babyId ? `/v1/babies/${babyId}/ai-summary?audience=${audience}&lang=${lang}` : null, {
    pollMs: 30 * 60_000,
  });
  const title = t(`ai.summary.${audience}` as Key);
  const d = q.data;
  const tone = d ? toneColor[d.summary.tone] : AI_COLOR;

  function listen() {
    if (!d) return;
    say([d.summary.headline, ...d.summary.points, d.summary.action].join('. '), lang);
  }

  return (
    <Card style={[s.card, { borderLeftColor: tone }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8} style={{ flex: 1 }}>
          <View style={s.spark}>
            <Icon name="sparkle" size={18} color={AI_COLOR} />
          </View>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
        </Row>
        <Row gap={6}>
          {d && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('home.listen')} onPress={listen} hitSlop={8} style={s.iconBtn}>
              <Icon name="volume" size={18} color={AI_COLOR} />
            </Pressable>
          )}
          <AiTag label={d?.meta.source === 'rules' ? t('ai.badge') : t('ai.brand')} />
        </Row>
      </Row>

      {!d && q.loading && <Loading />}
      {!d && !q.loading && q.error && <Muted>{t('ai.failed')}</Muted>}
      {d && (
        <>
          <Text style={s.headline}>{d.summary.headline}</Text>
          <View style={{ gap: 6 }}>
            {d.summary.points.map((p, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={[s.bullet, { backgroundColor: tone }]} />
                <Text style={s.point}>{p}</Text>
              </Row>
            ))}
          </View>
          <View style={[s.action, { borderColor: tone }]}>
            <Text style={[s.actionLabel, { color: tone }]}>{t('ai.next')}</Text>
            <Text style={s.actionText}>{d.summary.action}</Text>
          </View>
          <Footer meta={d.meta} />
        </>
      )}
    </Card>
  );
}

/** ASHA list: today's visits in the rules' order, each with an AI-written why and to-do. */
export function VisitPlanCard({ babies }: { babies: BabyListItem[] }) {
  const { t, lang } = useT();
  const q = useApi<PlanRes>(`/v1/ai/visit-plan?lang=${lang}`, { pollMs: 30 * 60_000 });
  const [all, setAll] = useState(false);
  const byId = new Map(babies.map((b) => [b.baby.id, b]));
  const items = q.data?.plan.items ?? [];
  const shown = all ? items : items.slice(0, 3);

  return (
    <Card style={[s.card, { borderLeftColor: AI_COLOR }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8} style={{ flex: 1 }}>
          <View style={s.spark}>
            <Icon name="sparkle" size={18} color={AI_COLOR} />
          </View>
          <Text style={s.title} numberOfLines={1}>
            {t('ai.plan.title')}
          </Text>
        </Row>
        <AiTag label={q.data?.meta.source === 'rules' ? t('ai.badge') : t('ai.brand')} />
      </Row>
      <Muted style={s.small}>{t('ai.plan.hint')}</Muted>
      {!q.data && q.loading && <Loading />}
      {!q.data && !q.loading && q.error && <Muted>{t('ai.failed')}</Muted>}
      {q.data && (
        <>
          <Text style={s.point}>{q.data.plan.overview}</Text>
          {shown.map((it, i) => {
            const b = byId.get(it.babyId);
            const st = b?.baby.status ?? 'green';
            return (
              <Pressable
                key={it.babyId}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/baby/[id]', params: { id: it.babyId } })}
                style={({ pressed }) => [s.planRow, pressed && { opacity: 0.7 }]}>
                <View style={[s.planNo, { backgroundColor: statusColor[st].fill }]}>
                  <Text style={[s.planNoText, st === 'yellow' && { color: color.text }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.planName}>{b ? `${b.baby.name} · ${b.mother.name}` : ''}</Text>
                  <Text style={s.planLine}>
                    <Text style={s.planKey}>{t('ai.plan.why')}: </Text>
                    {it.why}
                  </Text>
                  <Text style={s.planLine}>
                    <Text style={s.planKey}>{t('ai.plan.todo')}: </Text>
                    {it.todo}
                  </Text>
                </View>
                <Icon name="arrowForward" size={18} color={color.textMuted} />
              </Pressable>
            );
          })}
          {items.length > 3 && (
            <Pressable accessibilityRole="button" onPress={() => setAll((a) => !a)} hitSlop={8}>
              <Text style={s.link}>{all ? t('ai.plan.less') : t('ai.plan.more', { n: items.length })}</Text>
            </Pressable>
          )}
          <Footer meta={q.data.meta} />
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { borderLeftWidth: 4, gap: 10 },
  spark: { width: 32, height: 32, borderRadius: 16, backgroundColor: AI_SOFT, alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1, fontFamily: fontFamily.heading, fontSize: 18, lineHeight: 24, color: color.text },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: AI_SOFT,
  },
  tagText: { fontFamily: fontFamily.bodySemiBold, fontSize: 12, color: AI_COLOR },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: AI_SOFT },
  headline: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, lineHeight: 24, color: color.text },
  bullet: { width: 7, height: 7, borderRadius: 4, marginTop: 8 },
  point: { flex: 1, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22, color: color.text },
  action: { borderWidth: 1, borderRadius: radius.panel, padding: 10, gap: 2, backgroundColor: color.surface },
  actionLabel: { fontFamily: fontFamily.bodySemiBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionText: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 22, color: color.text },
  small: { fontSize: 12, lineHeight: 17 },
  link: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: AI_COLOR },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  planNo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  planNoText: { fontFamily: fontFamily.heading, fontSize: 14, color: color.surface },
  planName: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: color.text },
  planLine: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 19, color: color.text },
  planKey: { fontFamily: fontFamily.bodySemiBold, color: color.textMuted },
});
