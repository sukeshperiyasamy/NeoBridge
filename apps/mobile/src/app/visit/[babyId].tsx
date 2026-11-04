import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import {
  addDays,
  anyDangerSign,
  axillaryOutOfRange,
  dangerSigns,
  istDate,
  type BabyDetail,
  type DangerAnswers,
  type VisitOutcome,
} from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { clientId } from '@/api/client';
import { getOutbox } from '@/api/outbox';
import { useNow } from '@/use-now';
import { Button, Card, Check, Choice, Field, H1, H2, Line, Muted, QueryView, Screen, Strong, YesNo, useT } from '@/components/ui';

/**
 * A9 visit form. Date, time and visit day fill themselves in. Axillary
 * temperature is required; weight is required on scheduled visits; KMC hours
 * come from the band log for the ASHA to confirm. Any danger sign, or a reading
 * outside the lines, pre-selects Refer. Saved on the phone, synced when online.
 */
export default function VisitForm() {
  const { babyId, visitId } = useLocalSearchParams<{ babyId: string; visitId?: string }>();
  const q = useApi<BabyDetail>(`/v1/babies/${babyId}`);
  return (
    <Screen back>
      <QueryView q={q}>{(d) => <Form d={d} visitId={visitId ?? null} />}</QueryView>
    </Screen>
  );
}

function Form({ d, visitId }: { d: BabyDetail; visitId: string | null }) {
  const { t, bi } = useT();
  const today = istDate(useNow(60_000));
  const pending = d.visits.filter((v) => !v.doneAt);
  const visit =
    (visitId && pending.find((v) => v.id === visitId)) ||
    pending.filter((v) => v.dueDate <= today).sort((a, b) => Number(b.kind === 'extra') - Number(a.kind === 'extra') || a.dueDate.localeCompare(b.dueDate))[0] ||
    null;
  const scheduled = visit?.kind === 'scheduled';
  const yesterday = d.kmcByDay.find((k) => k.date === addDays(today, -1))?.hours ?? 0;

  const [axillary, setAxillary] = useState('');
  const [weight, setWeight] = useState('');
  const [feeding, setFeeding] = useState<boolean | null>(null);
  const [kmc, setKmc] = useState(yesterday.toFixed(1));
  const [signs, setSigns] = useState<DangerAnswers>({});
  const [bandCheck, setBandCheck] = useState({ fit: true, skin: true, battery: true });
  const [chosenOutcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const temp = Number(axillary.replace(',', '.'));
  const tempOk = axillary !== '' && temp >= 30 && temp <= 43;
  const suggestRefer = anyDangerSign(signs) || (tempOk && axillaryOutOfRange(temp));

  // a danger sign or a reading outside the lines pre-selects Refer until the ASHA picks
  const outcome = chosenOutcome ?? (suggestRefer ? 'refer' : tempOk ? 'home_care' : null);

  function save() {
    const e: Record<string, string> = {};
    const req = t('common.required');
    if (!tempOk) e.axillary = req;
    const w = Number(weight);
    if (scheduled && !(w >= 400 && w <= 8000)) e.weight = t('visit.weightRequired');
    if (weight && !(w >= 400 && w <= 8000)) e.weight = req;
    if (dangerSigns.some((k) => signs[k] === undefined)) e.signs = t('danger.answerAll');
    if (!outcome) e.outcome = req;
    setErrors(e);
    if (Object.keys(e).length) return;

    const id = clientId('visit');
    void getOutbox().push({
      id,
      method: 'POST',
      path: '/v1/visits',
      label: 'Visit',
      body: {
        clientId: id,
        babyId: d.baby.id,
        visitId: visit?.id ?? null,
        doneAt: Date.now(),
        axillaryTempC: temp,
        weightG: weight ? w : null,
        breastfeedingWell: feeding,
        kmcHours: Number(kmc) || 0,
        dangerSigns: signs,
        bandCheck,
        outcome,
        notes: notes.trim() || null,
      },
    });
    invalidate('/v1/');
    const findings = [
      ...dangerSigns.filter((k) => signs[k]).map((k) => t(`danger.${k}` as Key)),
      ...(tempOk && axillaryOutOfRange(temp) ? [`${temp} °C`] : []),
    ].join(', ');
    if (outcome === 'refer') router.replace({ pathname: '/refer/[babyId]', params: { babyId: d.baby.id, reason: findings } });
    else router.back();
  }

  return (
    <>
      <H1>{visit?.day ? t('visit.title', { d: visit.day }) : t('visit.titleExtra')}</H1>
      <Muted>
        {d.baby.name} · {d.mother.name} · {today} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
        {t('baby.dayOfLife', { n: d.dayOfLife })}
      </Muted>

      <Card>
        <Field label={t('visit.axillary')} value={axillary} onChangeText={setAxillary} keyboardType="decimal-pad" error={errors.axillary} maxLength={4} />
        <Field
          label={`${t('visit.weight')}${scheduled ? '' : ` (${t('common.optional')})`}`}
          value={weight}
          onChangeText={(v) => setWeight(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          error={errors.weight}
          maxLength={4}
        />
        <YesNo label={t('visit.breastfeeding')} value={feeding} onChange={setFeeding} />
        <Field label={t('visit.kmcHours')} value={kmc} onChangeText={setKmc} keyboardType="decimal-pad" hint={t('visit.kmcFromBand')} maxLength={4} />
      </Card>

      <Card>
        <H2>{t('visit.dangerSigns')}</H2>
        {dangerSigns.map((k) => (
          <YesNo key={k} label={bi(`danger.${k}`)} value={signs[k] ?? null} onChange={(v) => setSigns((s) => ({ ...s, [k]: v }))} />
        ))}
        {errors.signs && <Muted style={{ color: statusColor.red.text }}>{errors.signs}</Muted>}
      </Card>

      <Card>
        <H2>{t('visit.bandCheck')}</H2>
        <Check label={t('visit.bandFit')} value={bandCheck.fit} onChange={(fit) => setBandCheck((b) => ({ ...b, fit }))} />
        <Check label={t('visit.bandSkin')} value={bandCheck.skin} onChange={(skin) => setBandCheck((b) => ({ ...b, skin }))} />
        <Check label={t('visit.bandBattery')} value={bandCheck.battery} onChange={(battery) => setBandCheck((b) => ({ ...b, battery }))} />
      </Card>

      <Card>
        <H2>{t('visit.outcome')}</H2>
        {suggestRefer && <Line value={bi('visit.referSuggested')} style={{ color: statusColor.red.text }} />}
        <Choice
          options={[
            { value: 'home_care', label: t('visit.homeCare') },
            { value: 'refer', label: t('visit.refer') },
          ]}
          value={outcome}
          onChange={setOutcome}
        />
        {errors.outcome && <Muted style={{ color: statusColor.red.text }}>{errors.outcome}</Muted>}
        <Field label={t('visit.notes')} value={notes} onChangeText={setNotes} multiline />
      </Card>

      {Object.keys(errors).length > 0 && <Strong style={{ color: statusColor.red.text }}>{t('reg.error.invalid')}</Strong>}
      <Button label={bi('visit.save')} onPress={save} />
      <Muted>{t('common.offlineSaved')}</Muted>
    </>
  );
}
