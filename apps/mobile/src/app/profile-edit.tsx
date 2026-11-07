import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { Sex, Village } from '@neobridge/domain';
import { type Key } from '@neobridge/i18n';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { Button, Card, Choice, Field, H1, H2, IconLine, Muted, Screen, Success, useT } from '@/components/ui';
import { useHousehold } from '@/mother/household';
import { useSession } from '@/session';

type Section = 'me' | 'baby' | 'weight';

/**
 * Edit profile. Everyone: name and mobile number. A mother also: age, family
 * phone, village and MCP card number; her baby's details; and a weight taken
 * at home or at the clinic. Opened from Profile and settings, or the baby tab.
 */
export default function ProfileEdit() {
  const params = useLocalSearchParams<{ section?: Section }>();
  const { me } = useSession();
  const { t } = useT();
  const mother = me?.profile.role === 'mother';
  const section: Section = mother ? (params.section ?? 'me') : 'me';
  const [tab, setTab] = useState<Section>(section);

  return (
    <Screen back>
      <H1>{t('profile.edit')}</H1>
      {mother && (
        <Choice
          options={[
            { value: 'me', label: t('profile.mine') },
            { value: 'baby', label: t('profile.baby') },
            { value: 'weight', label: t('profile.weight') },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {tab === 'me' && <MyDetails />}
      {tab === 'baby' && mother && <BabyDetails />}
      {tab === 'weight' && mother && <AddWeight />}
    </Screen>
  );
}

function useSave() {
  const { t } = useT();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, done = t('profile.saved')) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await refresh();
      invalidate('/v1/');
      setMessage({ ok: true, text: done });
      return true;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setMessage({
        ok: false,
        text: code === 'phone_taken' ? t('profile.phoneTaken') : code === 'invalid' ? t('profile.invalid') : t('profile.failed'),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run };
}

function Result({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return message.ok ? (
    <Success style={{ color: statusColor.green.heading }}>{message.text}</Success>
  ) : (
    <IconLine icon="cancel" color={statusColor.red.text}>
      {message.text}
    </IconLine>
  );
}

const digits = (v: string) => v.replace(/\D/g, '').slice(-10);

function MyDetails() {
  const { t, lang } = useT();
  const { me } = useSession();
  const p = me?.profile;
  const m = me?.mother ?? null;
  const villages = useApi<{ villages: Village[] }>(m ? '/v1/villages' : null);
  const [name, setName] = useState(p?.name ?? '');
  const [phone, setPhone] = useState(p?.phone ?? '');
  const [age, setAge] = useState(m ? String(m.age) : '');
  const [familyPhone, setFamilyPhone] = useState(m?.familyPhone ?? '');
  const [villageId, setVillageId] = useState<string | null>(m?.village?.id ?? null);
  const [mcp, setMcp] = useState(m?.mcpNumber ?? '');
  const { busy, message, run } = useSave();

  const phoneOk = /^[6-9]\d{9}$/.test(digits(phone));
  const familyOk = familyPhone.trim() === '' || /^\d{10}$/.test(digits(familyPhone));
  const ageN = Number(age);
  const ageOk = !m || (Number.isInteger(ageN) && ageN >= 12 && ageN <= 60);
  const nameOk = name.trim().length >= 2;

  function save() {
    const body: Record<string, unknown> = {};
    if (name.trim() !== p?.name) body.name = name.trim();
    if (digits(phone) !== p?.phone) body.phone = digits(phone);
    if (m) {
      if (ageN !== m.age) body.age = ageN;
      const fam = familyPhone.trim() ? digits(familyPhone) : null;
      if (fam !== m.familyPhone) body.familyPhone = fam;
      if (villageId && villageId !== m.village?.id) body.villageId = villageId;
      if ((mcp.trim() || null) !== m.mcpNumber) body.mcpNumber = mcp.trim() || null;
    }
    if (Object.keys(body).length === 0) return;
    void run(() => api('PATCH', '/v1/me', body));
  }

  return (
    <Card>
      <H2>{t('profile.mine')}</H2>
      <Field label={t('reg.name')} value={name} onChangeText={setName} error={nameOk ? null : t('profile.invalid')} maxLength={80} />
      <Field
        label={t('otp.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={14}
        error={phoneOk ? null : t('otp.invalidPhone')}
        hint={t('profile.phoneNote')}
      />
      {m && (
        <>
          <Field label={t('reg.age')} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} error={ageOk ? null : t('profile.invalid')} />
          <Field
            label={t('profile.familyPhone')}
            value={familyPhone}
            onChangeText={setFamilyPhone}
            keyboardType="phone-pad"
            maxLength={14}
            error={familyOk ? null : t('otp.invalidPhone')}
          />
          {villages.data && (
            <Choice
              label={t('reg.village')}
              options={villages.data.villages.map((v) => ({ value: v.id, label: lang === 'hi' ? v.nameHi : v.name }))}
              value={villageId}
              onChange={setVillageId}
            />
          )}
          <Field label={t('profile.mcp')} value={mcp} onChangeText={setMcp} maxLength={40} />
        </>
      )}
      <Result message={message} />
      <Button label={t('profile.save')} busy={busy} disabled={!nameOk || !phoneOk || !familyOk || !ageOk} onPress={save} />
    </Card>
  );
}

function BabyDetails() {
  const { t } = useT();
  const { baby } = useHousehold();
  const [name, setName] = useState(baby?.name ?? '');
  const [sex, setSex] = useState<Sex>(baby?.sex ?? 'female');
  const [birthKg, setBirthKg] = useState(baby ? (baby.birthWeightG / 1000).toFixed(2) : '');
  const [weeks, setWeeks] = useState(baby ? String(baby.gestationWeeks) : '');
  const { busy, message, run } = useSave();
  if (!baby) return <Muted>{t('common.loading')}</Muted>;

  const grams = Math.round(Number(birthKg.replace(',', '.')) * 1000);
  const gramsOk = grams >= 500 && grams <= 6000;
  const w = Number(weeks);
  const weeksOk = Number.isInteger(w) && w >= 24 && w <= 44;
  const nameOk = name.trim().length >= 2;

  function save() {
    if (!baby) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== baby.name) body.name = name.trim();
    if (sex !== baby.sex) body.sex = sex;
    if (grams !== baby.birthWeightG) body.birthWeightG = grams;
    if (w !== baby.gestationWeeks) body.gestationWeeks = w;
    if (Object.keys(body).length === 0) return;
    void run(() => api('PATCH', `/v1/babies/${baby.id}`, body));
  }

  return (
    <Card>
      <H2>{t('profile.baby')}</H2>
      <Field label={t('reg.name')} value={name} onChangeText={setName} maxLength={80} error={nameOk ? null : t('profile.invalid')} />
      <Choice
        label={t('reg.sex')}
        options={(['female', 'male'] as const).map((v) => ({ value: v, label: t(`baby.sex.${v}` as Key) }))}
        value={sex === 'female' || sex === 'male' ? sex : null}
        onChange={setSex}
      />
      <Field
        label={t('profile.birthWeightKg')}
        value={birthKg}
        onChangeText={setBirthKg}
        keyboardType="decimal-pad"
        maxLength={5}
        error={gramsOk ? null : t('profile.invalid')}
      />
      <Field label={t('profile.gestationWeeks')} value={weeks} onChangeText={setWeeks} keyboardType="number-pad" maxLength={2} error={weeksOk ? null : t('profile.invalid')} />
      <Result message={message} />
      <Button label={t('profile.save')} busy={busy} disabled={!nameOk || !gramsOk || !weeksOk} onPress={save} />
    </Card>
  );
}

function AddWeight() {
  const { t } = useT();
  const { baby, detail } = useHousehold();
  const [kg, setKg] = useState('');
  const { busy, message, run } = useSave();
  const latest = detail?.weights.at(-1);
  const grams = Math.round(Number(kg.replace(',', '.')) * 1000);
  const ok = grams >= 500 && grams <= 8000;

  return (
    <Card>
      <H2>{t('profile.weight')}</H2>
      <Muted>{t('profile.weightHint')}</Muted>
      {latest && (
        <Muted>
          {t('baby.measurements')}: {(latest.grams / 1000).toFixed(2)} kg · {latest.at}
        </Muted>
      )}
      <Field label={t('profile.weightKg')} value={kg} onChangeText={setKg} keyboardType="decimal-pad" maxLength={5} placeholder="2.45" />
      <Result message={message} />
      <Button
        label={t('profile.save')}
        busy={busy}
        disabled={!ok || !baby}
        onPress={() =>
          baby &&
          void run(() => api('POST', `/v1/babies/${baby.id}/weights`, { grams }), t('profile.weightAdded')).then((saved) => {
            if (saved) setKg('');
          })
        }
      />
      <Button kind="secondary" label={t('common.back')} onPress={() => router.back()} />
    </Card>
  );
}
