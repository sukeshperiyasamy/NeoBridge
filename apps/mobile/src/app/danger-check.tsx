import { router } from 'expo-router';
import { useState } from 'react';

import { anyDangerSign, dangerSigns, type DangerAnswers, type DangerSign } from '@neobridge/domain';

import { clientId } from '@/api/client';
import { getOutbox } from '@/api/outbox';
import { getBandController } from '@/ble/band-controller';
import { Button, Card, H1, Line, Muted, Screen, YesNo, useT } from '@/components/ui';
import { saveDangerCheck, useHousehold } from '@/mother/household';

/**
 * M3 (W4): five picture cards, yes or no each. Any yes sets red with the
 * trigger "danger sign", whatever the band shows.
 * TODO: picture cards from Figma; text stands in for now.
 */
export default function DangerCheck() {
  const { t, bi } = useT();
  const { baby } = useHousehold();
  const [answers, setAnswers] = useState<DangerAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'clear' | 'danger' | null>(null);

  function submit() {
    if (dangerSigns.some((k) => answers[k] === undefined)) return setError(t('danger.answerAll'));
    if (!baby) return;
    const yes = anyDangerSign(answers);
    const id = clientId('dc');
    void getOutbox().push({
      id,
      method: 'POST',
      path: '/v1/danger-checks',
      body: { id, babyId: baby.id, at: Date.now(), answers },
      label: 'Danger check',
    });
    saveDangerCheck(yes);
    if (yes) getBandController().reportDangerSign(Date.now());
    setResult(yes ? 'danger' : 'clear');
    if (yes) router.replace('/mother');
  }

  if (result === 'clear') {
    return (
      <Screen back>
        <Card>
          <Line value={bi('danger.allNo')} />
          <Button label={bi('common.done')} onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back>
      <H1>{t('danger.title')}</H1>
      <Line value={bi('danger.sub')} />
      {dangerSigns.map((k: DangerSign) => (
        <Card key={k}>
          <YesNo label={bi(`danger.${k}`)} value={answers[k] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [k]: v }))} />
        </Card>
      ))}
      {error && <Muted style={{ color: '#a82820' }}>{error}</Muted>}
      <Button label={bi('danger.submit')} onPress={submit} />
    </Screen>
  );
}
