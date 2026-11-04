import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AMBULANCE } from '@neobridge/demo';
import type { BabyDetail, Facility } from '@neobridge/domain';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { clientId } from '@/api/client';
import { getOutbox } from '@/api/outbox';
import { CallButton } from '@/components/call-button';
import { villageName } from '@/components/staff';
import { dial } from '@/dial';
import { Body, Button, Card, Choice, Field, H1, H2, Muted, QueryView, Row, Screen, StatusChip, Strong, useT } from '@/components/ui';

/**
 * A10 (W6): pick the facility, the reason comes from the visit's findings,
 * call 102, and show the referral card with the baby's details and last
 * readings for the facility.
 */
export default function Refer() {
  const { babyId, reason } = useLocalSearchParams<{ babyId: string; reason?: string }>();
  const q = useApi<BabyDetail>(`/v1/babies/${babyId}`);
  return (
    <Screen back>
      <QueryView q={q}>{(d) => <ReferForm d={d} initialReason={reason ?? ''} />}</QueryView>
    </Screen>
  );
}

function ReferForm({ d, initialReason }: { d: BabyDetail; initialReason: string }) {
  const { t, bi, lang } = useT();
  const facilities = useApi<{ facilities: Facility[] }>('/v1/facilities');
  const list = facilities.data?.facilities ?? [];
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [reason, setReason] = useState(initialReason);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = list.find((f) => f.id === (facilityId ?? list.find((x) => x.level === 'SNCU')?.id));
  const lastVisit = [...d.visits].filter((v) => v.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!))[0];
  const lastWeight = d.weights[d.weights.length - 1];

  function save() {
    if (!chosen || reason.trim().length < 2) return setError(t('common.required'));
    const id = clientId('ref');
    void getOutbox().push({
      id,
      method: 'POST',
      path: '/v1/referrals',
      label: 'Referral',
      body: { clientId: id, babyId: d.baby.id, facilityId: chosen.id, reason: reason.trim() },
    });
    invalidate('/v1/');
    setSaved(true);
  }

  return (
    <>
      <H1>{t('refer.title')}</H1>
      <Card>
        <Choice
          label={t('refer.facility')}
          options={list.map((f) => ({ value: f.id, label: `${f.name} (${f.level})` }))}
          value={chosen?.id ?? null}
          onChange={setFacilityId}
        />
        <Field label={t('refer.reason')} value={reason} onChangeText={setReason} multiline error={error} />
        {!saved ? <Button label={t('refer.save')} onPress={save} /> : <Strong>✓ {t('refer.saved')}</Strong>}
        <CallButton label={bi('refer.call102')} phone={AMBULANCE} tone="danger" />
        {chosen?.phone && <Button kind="secondary" label={`${t('common.call')} ${chosen.name}`} onPress={() => void dial(chosen.phone!)} />}
      </Card>

      {/* the card the family carries to the facility */}
      <Card tint={statusColor.red.soft}>
        <H2>{t('refer.card')}</H2>
        <Strong>{d.baby.name}</Strong>
        <Row style={{ flexWrap: 'wrap' }}>
          <StatusChip status={d.baby.status} small />
          <Muted>
            {t('baby.dayOfLife', { n: d.dayOfLife })} · {t('baby.gestation', { w: d.baby.gestationWeeks })}
          </Muted>
        </Row>
        <Body>
          {t('baby.birthWeight')}: {d.baby.birthWeightG} g{lastWeight ? ` · ${t('baby.weightLatest')}: ${lastWeight.grams} g` : ''}
        </Body>
        <Body>
          {t('baby.mother')}: {d.mother.name} · {d.mother.phone} · {villageName(d.mother.village, lang)}
        </Body>
        {d.mother.asha && (
          <Body>
            {t('baby.asha')}: {d.mother.asha.name} · {d.mother.asha.phone}
          </Body>
        )}
        <Strong>{t('refer.lastReadings')}</Strong>
        {lastVisit ? (
          <Body>
            {lastVisit.doneAt!.slice(0, 16).replace('T', ' ')} · {lastVisit.axillaryTempC ?? '–'} °C {lastVisit.weightG ? `· ${lastVisit.weightG} g` : ''}
          </Body>
        ) : (
          <Muted>{t('common.empty')}</Muted>
        )}
        {reason.trim() !== '' && (
          <Body>
            {t('refer.reason')}: {reason}
          </Body>
        )}
        {chosen && (
          <Body>
            → {chosen.name}
            {chosen.phone ? ` · ${chosen.phone}` : ''}
          </Body>
        )}
      </Card>
      {saved && <Button kind="secondary" label={t('common.done')} onPress={() => router.back()} />}
    </>
  );
}
