import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { ESCALATE_AFTER_MS } from '@neobridge/domain';
import { ago, type Key } from '@neobridge/i18n';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { BrandHeader } from '@/components/brand-header';
import { villageName, type AlertEpisode } from '@/components/staff';
import { useNow } from '@/use-now';
import { Button, Card, Choice, Field, H1, Muted, QueryView, Row, Screen, StatusChip, Strong, IconLine, useT } from '@/components/ui';

/** A13 (ASHA) and D6 (doctor): open and closed red alerts, who acknowledged, how fast. */
export function AlertsList({ doctor }: { doctor?: boolean }) {
  const { t } = useT();
  const q = useApi<{ episodes: AlertEpisode[] }>('/v1/episodes?kind=red', { pollMs: 15_000 });
  const [tab, setTab] = useState<'open' | 'closed'>('open');

  return (
    <Screen header={<BrandHeader />}>
      <H1>{doctor ? t('doc.alertLog') : t('alerts.title')}</H1>
      <Choice
        options={[
          { value: 'open', label: t('alerts.open') },
          { value: 'closed', label: t('alerts.closed') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryView q={q}>
        {({ episodes }) => {
          const list = episodes.filter((e) => (tab === 'open' ? !e.closedAt : !!e.closedAt));
          if (list.length === 0) return <Muted>{t('alerts.none')}</Muted>;
          return (
            <>
              {list.map((e) => (
                <AlertCard key={e.id} e={e} />
              ))}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function AlertCard({ e }: { e: AlertEpisode }) {
  const { t, lang } = useT();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = Date.parse(e.startedAt);
  const ackMin = e.staffAcknowledgedAt ? Math.round((Date.parse(e.staffAcknowledgedAt) - started) / 60_000) : null;
  const now = useNow();
  const openMin = Math.floor((now - started) / 60_000);
  const flagged = !e.staffAcknowledgedAt && !e.closedAt && now - started > ESCALATE_AFTER_MS;

  async function close() {
    if (reason.trim().length < 5) return setError(t('alerts.closeNeedsReason'));
    setBusy(true);
    try {
      await api('POST', `/v1/episodes/${encodeURIComponent(e.id)}/close`, { reason: reason.trim() });
      invalidate('/v1/');
      setClosing(false);
    } catch (err) {
      setError((err as ApiError).offline ? t('common.needsInternet') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tint={e.closedAt ? undefined : statusColor.red.soft}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/baby/[id]', params: { id: e.babyId } })} style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <StatusChip status="red" small />
          <Muted>{ago(lang, started)}</Muted>
        </Row>
        <Strong>
          {e.babyName} <Muted>· {e.motherName} · {villageName(e.village, lang)}</Muted>
        </Strong>
        <Muted>{t(`red.reason.${e.trigger}` as Key)}</Muted>
        {e.staffAcknowledgedBy ? (
          <Muted>{t('alerts.ackedBy', { name: e.staffAcknowledgedBy.name, min: ackMin ?? 0 })}</Muted>
        ) : (
          !e.closedAt && <Muted style={{ color: statusColor.red.text }}>{t('alerts.unacked', { min: openMin })}</Muted>
        )}
        {flagged && <IconLine icon="flag" color={statusColor.red.text}>
            {t('alerts.flagged')}
          </IconLine>}
        {e.closedBy && (
          <Muted>
            {t('baby.closedBy', { name: e.closedBy.name })}
            {e.closeReason ? ` · ${e.closeReason}` : ''}
          </Muted>
        )}
      </Pressable>
      {!e.closedAt && !closing && (
        <Row>
          {!e.staffAcknowledgedAt && (
            <Button
              kind="secondary"
              label={t('alert.ack')}
              onPress={async () => {
                await api('POST', `/v1/episodes/${encodeURIComponent(e.id)}/ack`).catch(() => undefined);
                invalidate('/v1/');
              }}
              style={{ flex: 1 }}
            />
          )}
          <Button kind="secondary" label={t('alerts.closeTitle')} onPress={() => setClosing(true)} style={{ flex: 1 }} />
        </Row>
      )}
      {closing && (
        <>
          <Field label={t('alerts.closeReason')} value={reason} onChangeText={setReason} multiline error={error} />
          <Row>
            <Button kind="secondary" label={t('cancel')} onPress={() => setClosing(false)} style={{ flex: 1 }} />
            <Button label={t('alerts.close')} onPress={close} busy={busy} style={{ flex: 1 }} />
          </Row>
        </>
      )}
    </Card>
  );
}
