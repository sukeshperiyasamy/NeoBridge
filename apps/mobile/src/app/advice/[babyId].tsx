import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { adviceTemplates, adviceTemplateText, istDate, type AdviceKind, type AdviceTemplate, type BabyDetail } from '@neobridge/domain';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { Button, Card, Choice, Field, H1, Line, Muted, QueryView, Screen, Strong, Success, useT } from '@/components/ui';

/**
 * D8 advice note. Family advice shows on the mother's phone (M18); a clinical
 * note only staff see. Templates are shown to the family in Hindi. A follow-up
 * date creates a reminder on the mother's phone and a visit on the ASHA's list.
 */
export default function AdviceNote() {
  const { babyId } = useLocalSearchParams<{ babyId: string }>();
  const q = useApi<BabyDetail>(`/v1/babies/${babyId}`);
  return (
    <Screen back>
      <QueryView q={q}>{(d) => <Form d={d} />}</QueryView>
    </Screen>
  );
}

function Form({ d }: { d: BabyDetail }) {
  const { t, bi, lang } = useT();
  const [kind, setKind] = useState<AdviceKind>('family');
  const [template, setTemplate] = useState<AdviceTemplate | null>(null);
  const [body, setBody] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setError(null);
    if (!template && body.trim().length < 2) return setError(t('advice.needText'));
    if (template === 'opd' && !followUp) return setError(t('advice.needDate'));
    if (followUp && (!/^\d{4}-\d{2}-\d{2}$/.test(followUp) || followUp < istDate(Date.now()))) return setError(t('common.required'));
    setBusy(true);
    try {
      await api('POST', '/v1/advice', {
        babyId: d.baby.id,
        kind,
        template: kind === 'family' ? template : null,
        body: body.trim() || undefined,
        followUpDate: followUp || null,
      });
      invalidate('/v1/');
      setSent(true);
    } catch (e) {
      setError((e as ApiError).offline ? t('common.needsInternet') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <Success>{t('advice.sent')}</Success>
        <Button label={t('common.done')} onPress={() => router.back()} />
      </Card>
    );
  }

  return (
    <>
      <H1>{t('advice.title')}</H1>
      <Muted>
        {d.baby.name} · {d.mother.name}
      </Muted>
      <Card>
        <Choice
          label={t('advice.kind')}
          options={[
            { value: 'family', label: t('advice.family') },
            { value: 'clinical', label: t('advice.clinical') },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === 'family' && (
          <Choice
            label={t('advice.template')}
            options={adviceTemplates.map((k) => ({ value: k, label: adviceTemplateText[k][lang].replace('{date}', followUp || '…') }))}
            value={template}
            onChange={(k) => setTemplate((cur) => (cur === k ? null : k))}
          />
        )}
        {template && <Muted>हिन्दी: {adviceTemplateText[template].hi.replace('{date}', followUp || '…')}</Muted>}
        <Field label={t('advice.freeText')} value={body} onChangeText={setBody} multiline />
        <Field label={t('advice.followUp')} value={followUp} onChangeText={setFollowUp} hint={t('advice.followUpHint')} maxLength={10} />
        {error && <Line value={{ text: error, gloss: null }} style={{ color: statusColor.red.text }} />}
        <Button label={bi('advice.send')} onPress={send} busy={busy} />
      </Card>
    </>
  );
}
