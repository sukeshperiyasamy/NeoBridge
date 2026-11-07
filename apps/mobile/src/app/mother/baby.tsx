import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { istDate, weightTrend } from '@neobridge/domain';
import { ago, type Key } from '@neobridge/i18n';

import { adviceText } from '@/components/advice-text';
import { BrandHeader } from '@/components/brand-header';
import { KmcBars, StatusStrip } from '@/components/charts';
import { Icon } from '@/components/icon';
import { TempTrendCard } from '@/components/temp-trend';
import { Body, Button, Card, H1, H2, Line, Loading, Muted, Row, Screen, StatusChip, Strong, useT } from '@/components/ui';
import { useHousehold } from '@/mother/household';
import { getKmc } from '@/mother/kmc';
import { useNow } from '@/use-now';

const arrow = { up: 'arrowUp', flat: 'arrowForward', down: 'arrowDown' } as const;

/**
 * Baby tab: the temperature trend (15 days, each day's low and high), M10
 * baby profile, M9 mother profile, M4 baby's day, M13 history, M14
 * measurements, M15 alerts, M18 advice. Both profiles can be edited.
 */
export default function BabyTab() {
  const { t, bi, lang } = useT();
  const { mother, baby, detail } = useHousehold();
  useSyncExternalStore(getKmc().subscribe, getKmc().getState);
  const now = useNow();
  const today = istDate(now);

  if (!baby) return <Screen header={<BrandHeader />}>{<Loading />}</Screen>;

  // KMC: the phone's own log is freshest; the server has what other phones logged
  const days = (detail?.kmcByDay ?? Array.from({ length: 7 }, (_, i) => ({ date: istDate(now - (6 - i) * 86_400_000), hours: 0 }))).map((d) => ({
    date: d.date,
    hours: Math.max(d.hours, getKmc().hoursOn(d.date, now)),
  }));
  const weights = detail?.weights ?? [];
  const latest = weights[weights.length - 1];
  const trend = weightTrend(weights);
  const alerts = (detail?.episodes ?? []).slice(0, 15);
  const advice = detail?.advice ?? [];
  const nextFollowUp = advice.map((a) => a.followUpDate).filter((d): d is string => !!d && d >= today).sort()[0];

  return (
    <Screen header={<BrandHeader />}>
      <H1>{baby.name}</H1>
      <Muted>{t('baby.dayOfLife', { n: detail?.dayOfLife ?? '–' })}</Muted>

      <TempTrendCard babyId={baby.id} episodes={detail?.episodes ?? []} />

      {/* M4 */}
      <Card>
        <H2>{t('baby.day')}</H2>
        <Strong>
          {t('kmc.today')} · {t('kmc.target', { h: getKmc().todayHours(now).toFixed(1) })}
        </Strong>
        <Muted>{t('baby.statusStrip')}</Muted>
        <StatusStrip changes={detail?.statusChanges ?? []} date={today} now={now} />
      </Card>

      {/* M13 */}
      <Card>
        <H2>{t('baby.history')}</H2>
        <Muted>{t('detail.kmc')}</Muted>
        <KmcBars days={days} />
        <Muted>{t('baby.episodes', { n: alerts.filter((e) => Date.parse(e.startedAt) > now - 7 * 86_400_000).length })}</Muted>
      </Card>

      {/* M14 */}
      <Card>
        <H2>{t('baby.measurements')}</H2>
        {latest ? (
          <Row>
            <Strong style={{ fontSize: 26, lineHeight: 34 }}>{(latest.grams / 1000).toFixed(2)} kg</Strong>
            {trend && (
              <Line
                value={bi(`baby.weight.${trend}` as Key)}
                style={{ fontSize: 18 }}
              />
            )}
            {trend && <Icon name={arrow[trend]} size={26} />}
          </Row>
        ) : (
          <Muted>{t('common.empty')}</Muted>
        )}
        <Button kind="secondary" icon="add" label={t('profile.weight')} onPress={() => router.push({ pathname: '/profile-edit', params: { section: 'weight' } })} />
      </Card>

      {/* M18 */}
      <Card>
        <H2>{t('baby.advice')}</H2>
        {nextFollowUp && <Strong>{t('baby.followUp', { date: nextFollowUp })}</Strong>}
        {advice.length === 0 && <Muted>{t('baby.noAdvice')}</Muted>}
        {advice.slice(0, 5).map((a) => (
          <Card key={a.id} tint="#f5f4f2">
            <Body>{adviceText(a, lang)}</Body>
            <Muted>
              {a.doctorName} · {ago(lang, Date.parse(a.createdAt))}
            </Muted>
          </Card>
        ))}
      </Card>

      {/* M15 */}
      <Card>
        <H2>{t('baby.alerts')}</H2>
        {alerts.length === 0 && <Muted>{t('baby.noAlerts')}</Muted>}
        {alerts.map((e) => (
          <Row key={e.id} style={{ alignItems: 'flex-start' }}>
            <StatusChip status={e.kind === 'red' ? 'red' : 'yellow'} small />
            <View style={{ flex: 1 }}>
              <Body>
                {t(`red.reason.${e.trigger}` as Key)} · {ago(lang, Date.parse(e.startedAt))}
              </Body>
              {e.staffAcknowledgedBy && <Muted>{t('baby.respondedBy', { name: e.staffAcknowledgedBy.name })}</Muted>}
              {e.closedBy && <Muted>{t('baby.closedBy', { name: e.closedBy.name })}</Muted>}
            </View>
          </Row>
        ))}
      </Card>

      {/* M10 */}
      <Card>
        <H2>{t('baby.profile')}</H2>
        <Info label={t('baby.born')} value={new Date(baby.bornAt).toLocaleString()} />
        <Info label={t('reg.sex')} value={t(`baby.sex.${baby.sex}` as Key)} />
        <Info label={t('baby.birthWeight')} value={`${(baby.birthWeightG / 1000).toFixed(2)} kg`} />
        <Info label={t('reg.gestation')} value={t('baby.gestation', { w: baby.gestationWeeks })} />
        {baby.sncuAdmitted && baby.dischargeDate && (
          <Info
            label={t('baby.discharge')}
            value={`${baby.dischargeDate}${baby.dischargeWeightG ? ` · ${(baby.dischargeWeightG / 1000).toFixed(2)} kg` : ''}`}
          />
        )}
        {baby.facility && <Info label={t('baby.facility')} value={baby.facility.name} />}
        <Button kind="secondary" icon="edit" label={t('profile.editBaby')} onPress={() => router.push({ pathname: '/profile-edit', params: { section: 'baby' } })} />
      </Card>

      {/* M9 */}
      {mother && (
        <Card>
          <H2>{t('baby.mother')}</H2>
          <Info label={t('reg.name')} value={mother.name} />
          <Info label={t('reg.age')} value={String(mother.age)} />
          <Info label={t('settings.phone')} value={mother.phone} />
          {mother.village && <Info label={t('baby.village')} value={lang === 'hi' ? mother.village.nameHi : mother.village.name} />}
          {mother.asha && <Info label={t('baby.asha')} value={`${mother.asha.name} · ${mother.asha.phone}`} />}
          {mother.deliveryFacility && <Info label={t('reg.deliveryFacility')} value={mother.deliveryFacility.name} />}
          {mother.familyPhone && <Info label={t('baby.emergency')} value={mother.familyPhone} />}
          {mother.mcpNumber && <Info label={t('profile.mcp')} value={mother.mcpNumber} />}
          <Button kind="secondary" icon="edit" label={t('profile.edit')} onPress={() => router.push({ pathname: '/profile-edit', params: { section: 'me' } })} />
        </Card>
      )}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Muted>{label}</Muted>
      <Body style={{ flex: 1, textAlign: 'right' }}>{value}</Body>
    </Row>
  );
}
