import { useState } from 'react';

import { istDate, visitSchedule, type BabyInfo, type Facility, type MotherInfo, type Sex, type Village } from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';

import { invalidate, useApi } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { AssignBand } from '@/components/assign-band';
import { BrandHeader } from '@/components/brand-header';
import { Body, Button, Card, Choice, Field, H1, H2, Line, Muted, Row, Screen, Strong, YesNo, useT } from '@/components/ui';

/**
 * A4 register mother → A5 register baby (makes the visit schedule) → A6 band →
 * done. The mother then logs in with her number; consent (A7) is done
 * together on her phone. No Aadhaar or other ID is collected.
 */
export default function Register() {
  const { t } = useT();
  const [step, setStep] = useState<'mother' | 'baby' | 'band' | 'done'>('mother');
  const [mother, setMother] = useState<MotherInfo | null>(null);
  const [baby, setBaby] = useState<BabyInfo | null>(null);
  const [bandId, setBandId] = useState<string | null>(null);

  const reset = () => {
    setStep('mother');
    setMother(null);
    setBaby(null);
    setBandId(null);
  };

  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('reg.title')}</H1>
      <Choice
        options={(['mother', 'baby', 'band'] as const).map((s) => ({ value: s, label: t(`reg.${s}` as Key) }))}
        value={step === 'done' ? null : step}
        onChange={() => undefined}
      />
      {step === 'mother' && (
        <MotherForm
          onSaved={(m) => {
            setMother(m);
            setStep('baby');
          }}
        />
      )}
      {step === 'baby' && mother && (
        <BabyForm
          mother={mother}
          onSaved={(b) => {
            setBaby(b);
            setStep('band');
          }}
        />
      )}
      {step === 'band' && baby && (
        <AssignBand
          babyId={baby.id}
          onDone={(id) => {
            setBandId(id);
            setStep('done');
          }}
          onLater={() => setStep('done')}
        />
      )}
      {step === 'done' && mother && baby && <Done mother={mother} baby={baby} bandId={bandId} onAnother={reset} />}
    </Screen>
  );
}

function useErr() {
  const { t } = useT();
  return (e: unknown) => {
    const err = e as ApiError;
    if (err.offline) return t('common.needsInternet');
    const key = `reg.error.${err.code}` as Key;
    return ['phone_taken', 'not_your_village', 'invalid', 'facility_required', 'discharge_required'].includes(err.code) ? t(key) : t('common.error');
  };
}

function MotherForm({ onSaved }: { onSaved: (m: MotherInfo) => void }) {
  const { t, lang } = useT();
  const errText = useErr();
  const villages = useApi<{ villages: Village[] }>('/v1/villages');
  const facilities = useApi<{ facilities: Facility[] }>('/v1/facilities');
  const [f, setF] = useState(() => ({
    name: '',
    age: '',
    phone: '',
    villageId: '',
    familyPhone: '',
    deliveryPlace: 'facility' as 'home' | 'facility',
    deliveryFacilityId: '',
    deliveryDate: istDate(Date.now()),
    mcpNumber: '',
    language: 'hi' as 'hi' | 'en',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  async function save() {
    const e: Record<string, string> = {};
    const req = t('common.required');
    if (f.name.trim().length < 2) e.name = req;
    const age = Number(f.age);
    if (!(age >= 12 && age <= 60)) e.age = req;
    if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10))) e.phone = t('otp.invalidPhone');
    if (!f.villageId) e.villageId = req;
    if (f.familyPhone && !/^\d{10}$/.test(f.familyPhone.replace(/\D/g, '').slice(-10))) e.familyPhone = t('otp.invalidPhone');
    if (f.deliveryPlace === 'facility' && !f.deliveryFacilityId) e.deliveryFacilityId = req;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.deliveryDate) || f.deliveryDate > istDate(Date.now())) e.deliveryDate = req;
    setErrors(e);
    if (Object.keys(e).length) return setError(t('reg.error.invalid'));
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mother: MotherInfo }>('POST', '/v1/mothers', {
        name: f.name.trim(),
        age,
        phone: f.phone,
        villageId: f.villageId,
        familyPhone: f.familyPhone || null,
        deliveryPlace: f.deliveryPlace,
        deliveryFacilityId: f.deliveryPlace === 'facility' ? f.deliveryFacilityId : null,
        deliveryDate: f.deliveryDate,
        mcpNumber: f.mcpNumber.trim() || null,
        language: f.language,
      });
      invalidate('/v1/');
      onSaved(res.mother);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <H2>{t('reg.mother')}</H2>
      <Field label={t('reg.name')} value={f.name} onChangeText={(name) => set({ name })} error={errors.name} />
      <Field label={t('reg.age')} value={f.age} onChangeText={(age) => set({ age: age.replace(/\D/g, '') })} keyboardType="number-pad" error={errors.age} maxLength={2} />
      <Field label={t('reg.phone')} value={f.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" error={errors.phone} maxLength={14} />
      <Choice
        label={t('reg.village')}
        options={(villages.data?.villages ?? []).map((v) => ({ value: v.id, label: lang === 'hi' ? v.nameHi : v.name }))}
        value={f.villageId || null}
        onChange={(villageId) => set({ villageId })}
      />
      {errors.villageId && <Muted style={{ color: '#a82820' }}>{errors.villageId}</Muted>}
      <Field
        label={`${t('reg.familyPhone')} (${t('common.optional')})`}
        value={f.familyPhone}
        onChangeText={(familyPhone) => set({ familyPhone })}
        keyboardType="phone-pad"
        error={errors.familyPhone}
      />
      <Choice
        label={t('reg.deliveryPlace')}
        options={[
          { value: 'home', label: t('reg.home') },
          { value: 'facility', label: t('reg.facility') },
        ]}
        value={f.deliveryPlace}
        onChange={(deliveryPlace) => set({ deliveryPlace })}
      />
      {f.deliveryPlace === 'facility' && (
        <>
          <Choice
            label={t('reg.deliveryFacility')}
            options={(facilities.data?.facilities ?? []).map((x) => ({ value: x.id, label: x.name }))}
            value={f.deliveryFacilityId || null}
            onChange={(deliveryFacilityId) => set({ deliveryFacilityId })}
          />
          {errors.deliveryFacilityId && <Muted style={{ color: '#a82820' }}>{errors.deliveryFacilityId}</Muted>}
        </>
      )}
      <Field label={t('reg.deliveryDate')} value={f.deliveryDate} onChangeText={(deliveryDate) => set({ deliveryDate })} error={errors.deliveryDate} maxLength={10} />
      <Field label={`${t('reg.mcp')} (${t('common.optional')})`} value={f.mcpNumber} onChangeText={(mcpNumber) => set({ mcpNumber })} />
      <Choice
        label={t('reg.language')}
        options={[
          { value: 'hi', label: 'हिन्दी' },
          { value: 'en', label: 'English' },
        ]}
        value={f.language}
        onChange={(language) => set({ language })}
      />
      {error && <Muted style={{ color: '#a82820' }}>{error}</Muted>}
      <Button label={t('reg.saveMother')} onPress={save} busy={busy} />
    </Card>
  );
}

function BabyForm({ mother, onSaved }: { mother: MotherInfo; onSaved: (b: BabyInfo) => void }) {
  const { t } = useT();
  const errText = useErr();
  const [f, setF] = useState({
    name: '',
    sex: null as Sex | null,
    time: '10:00',
    birthWeightG: '',
    gestationWeeks: '',
    sncu: null as boolean | null,
    dischargeDate: '',
    dischargeWeightG: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  async function save() {
    const e: Record<string, string> = {};
    const req = t('common.required');
    if (!f.sex) e.sex = req;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) e.time = req;
    const w = Number(f.birthWeightG);
    if (!(w >= 400 && w <= 6000)) e.birthWeightG = req;
    const g = Number(f.gestationWeeks);
    if (!(g >= 22 && g <= 44)) e.gestationWeeks = req;
    if (f.sncu === null) e.sncu = req;
    if (f.sncu) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dischargeDate)) e.dischargeDate = req;
      const dw = Number(f.dischargeWeightG);
      if (!(dw >= 400 && dw <= 6000)) e.dischargeWeightG = req;
    }
    setErrors(e);
    if (Object.keys(e).length) return setError(t('reg.error.invalid'));
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ baby: BabyInfo }>('POST', '/v1/babies', {
        motherId: mother.id,
        name: f.name.trim() || null,
        sex: f.sex,
        bornAt: `${mother.deliveryDate}T${f.time}:00+05:30`,
        birthWeightG: w,
        gestationWeeks: g,
        sncuAdmitted: f.sncu,
        dischargeDate: f.sncu ? f.dischargeDate : null,
        dischargeWeightG: f.sncu ? Number(f.dischargeWeightG) : null,
      });
      invalidate('/v1/');
      onSaved(res.baby);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <H2>{t('reg.baby')}</H2>
      <Muted>
        {mother.name} · {mother.deliveryDate}
      </Muted>
      <Field label={t('reg.babyName')} value={f.name} onChangeText={(name) => set({ name })} hint={t('reg.babyNameHint')} />
      <Choice
        label={t('reg.sex')}
        options={(['female', 'male', 'other'] as Sex[]).map((s) => ({ value: s, label: t(`baby.sex.${s}` as Key) }))}
        value={f.sex}
        onChange={(sex) => set({ sex })}
      />
      {errors.sex && <Muted style={{ color: '#a82820' }}>{errors.sex}</Muted>}
      <Field label={t('reg.bornAt')} value={f.time} onChangeText={(time) => set({ time })} error={errors.time} maxLength={5} />
      <Field
        label={t('reg.birthWeight')}
        value={f.birthWeightG}
        onChangeText={(v) => set({ birthWeightG: v.replace(/\D/g, '') })}
        keyboardType="number-pad"
        error={errors.birthWeightG}
        maxLength={4}
      />
      <Field
        label={t('reg.gestation')}
        value={f.gestationWeeks}
        onChangeText={(v) => set({ gestationWeeks: v.replace(/\D/g, '') })}
        keyboardType="number-pad"
        error={errors.gestationWeeks}
        maxLength={2}
      />
      <YesNo label={t('reg.sncu')} value={f.sncu} onChange={(sncu) => set({ sncu })} />
      {errors.sncu && <Muted style={{ color: '#a82820' }}>{errors.sncu}</Muted>}
      {f.sncu && (
        <>
          <Field label={t('reg.dischargeDate')} value={f.dischargeDate} onChangeText={(dischargeDate) => set({ dischargeDate })} error={errors.dischargeDate} maxLength={10} />
          <Field
            label={t('reg.dischargeWeight')}
            value={f.dischargeWeightG}
            onChangeText={(v) => set({ dischargeWeightG: v.replace(/\D/g, '') })}
            keyboardType="number-pad"
            error={errors.dischargeWeightG}
            maxLength={4}
          />
        </>
      )}
      {error && <Muted style={{ color: '#a82820' }}>{error}</Muted>}
      <Button label={t('reg.saveBaby')} onPress={save} busy={busy} />
    </Card>
  );
}

function Done({ mother, baby, bandId, onAnother }: { mother: MotherInfo; baby: BabyInfo; bandId: string | null; onAnother: () => void }) {
  const { t, bi } = useT();
  const plan = visitSchedule({
    deliveryPlace: mother.deliveryPlace,
    birthDate: istDate(Date.parse(baby.bornAt)),
    sncuAdmitted: baby.sncuAdmitted,
    dischargeDate: baby.dischargeDate,
  });
  return (
    <Card>
      <H2>✓ {t('reg.done')}</H2>
      <Line value={bi('reg.doneSub', { mother: mother.name, phone: mother.phone })} />
      <Strong>{baby.name}</Strong>
      {bandId && (
        <Muted>
          {t('reg.band')}: {bandId}
        </Muted>
      )}
      <H2>{t('reg.visitPlan')}</H2>
      {plan.map((v) => (
        <Row key={v.day} style={{ justifyContent: 'space-between' }}>
          <Body>{t('visit.title', { d: v.day })}</Body>
          <Muted>{v.dueDate}</Muted>
        </Row>
      ))}
      <Button kind="secondary" label={t('reg.another')} onPress={onAnother} />
    </Card>
  );
}
