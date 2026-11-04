import { router } from 'expo-router';
import { useState } from 'react';

import { ApiError, api } from '@/api/client';
import { Button, Card, Check, H1, Line, Muted, Screen, useT } from '@/components/ui';
import { useSession } from '@/session';
import { say, stopSpeaking } from '@/sound';

/** M8 / A7: consent played aloud and shown as text; the ASHA ticks that she witnessed it. */
export default function ConsentScreen() {
  const { t, bi, lang } = useT();
  const { me, refresh } = useSession();
  const [witnessed, setWitnessed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motherId = me?.mother?.id;

  async function agree() {
    if (!witnessed) return setError(t('consent.needed'));
    if (!motherId) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/v1/mothers/${motherId}/consent`, { witnessed: true });
      await refresh();
      stopSpeaking();
      router.replace('/mother');
    } catch (e) {
      setError((e as ApiError).offline ? t('common.needsInternet') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <H1>{t('consent.title')}</H1>
      <Card>
        <Line value={bi('consent.body')} />
        <Button kind="secondary" label={bi('consent.play')} onPress={() => say(t('consent.body'), lang)} />
      </Card>
      <Card>
        <Check label={t('consent.witness')} value={witnessed} onChange={setWitnessed} />
        {error && <Muted style={{ color: '#a82820' }}>{error}</Muted>}
        <Button label={bi('consent.agree')} onPress={agree} busy={busy} disabled={!witnessed} />
      </Card>
    </Screen>
  );
}
