import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { anyDangerSign, type BabyDetail, type EpisodeDto } from '@neobridge/domain';
import { ago, type Key } from '@neobridge/i18n';
import { status as statusColor } from '@neobridge/tokens';

import { invalidate, useApi } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { adviceText } from '@/components/advice-text';
import { AssignBand } from '@/components/assign-band';
import { KmcBars, WeightChart } from '@/components/charts';
import { AiSummaryCard } from '@/components/ai';
import { TempTrendCard } from '@/components/temp-trend';
import { villageName } from '@/components/staff';
import { Body, Button, Card, Field, H1, H2, Muted, QueryView, Row, Screen, StatusChip, Strong, useT } from '@/components/ui';
import { dial } from '@/dial';
import { useSession } from '@/session';

/**
 * A8 (ASHA) and D5 (doctor) baby detail: header, status and the open alert,
 * skin temperature with the rule lines and episodes shaded, KMC hours against
 * 8 h, weight with g/kg/day, then alert log, visits, danger checks, notes.
 */
export default function BabyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const q = useApi<BabyDetail>(`/v1/babies/${id}`, { pollMs: 30_000 });
  const doctor = me?.profile.role === 'doctor' || me?.profile.role === 'admin';
  return (
    <Screen back>
      <QueryView q={q}>{(d) => <Detail d={d} doctor={doctor} />}</QueryView>
    </Screen>
  );
}

function Detail({ d, doctor }: { d: BabyDetail; doctor: boolean }) {
  const { t, lang } = useT();
  const [assigning, setAssigning] = useState(false);
  const open = d.episodes.find((e) => e.kind === 'red' && !e.closedAt) ?? null;
  const reds = d.episodes.filter((e) => e.kind === 'red');
  const since = d.baby.statusSince ? ago(lang, Date.parse(d.baby.statusSince)) : '';

  return (
    <>
      <H1>{d.baby.name}</H1>
      <Muted>
        {t('baby.dayOfLife', { n: d.dayOfLife })} · {t('baby.gestation', { w: d.baby.gestationWeeks })} · {(d.baby.birthWeightG / 1000).toFixed(2)} kg
      </Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        <StatusChip status={d.baby.status} />
        {since && <Muted>{t('detail.since', { time: since })}</Muted>}
      </Row>
      <Card>
        <Strong>
          {d.mother.name} · {villageName(d.mother.village, lang)}
        </Strong>
        <Muted>
          {t('doc.mothersPhone')}: {d.mother.phone}
          {d.mother.asha ? ` · ${t('baby.asha')}: ${d.mother.asha.name}` : ''}
        </Muted>
        <Muted>
          {d.baby.bandId ? `${t('reg.band')}: ${d.baby.bandId}` : t('detail.noBand')}
          {d.baby.lastSyncAt ? ` · ${t('asha.synced', { ago: ago(lang, Date.parse(d.baby.lastSyncAt)) })}` : ''}
        </Muted>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button kind="secondary" label={t('detail.callFamily')} onPress={() => void dial(d.mother.phone)} style={{ flex: 1 }} />
          {!doctor && (
            <Button
              kind="secondary"
              label={t('detail.startVisit')}
              onPress={() => router.push({ pathname: '/visit/[babyId]', params: { babyId: d.baby.id } })}
              style={{ flex: 1 }}
            />
          )}
          {doctor && (
            <Button
              kind="secondary"
              label={t('detail.writeAdvice')}
              onPress={() => router.push({ pathname: '/advice/[babyId]', params: { babyId: d.baby.id } })}
              style={{ flex: 1 }}
            />
          )}
        </Row>
        {!doctor && (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button kind="secondary" label={t('detail.assignBand')} onPress={() => setAssigning((a) => !a)} style={{ flex: 1 }} />
            <Button
              kind="secondary"
              label={t('visit.refer')}
              onPress={() => router.push({ pathname: '/refer/[babyId]', params: { babyId: d.baby.id } })}
              style={{ flex: 1 }}
            />
          </Row>
        )}
      </Card>

      {assigning && <AssignBand babyId={d.baby.id} onDone={() => setAssigning(false)} onLater={() => setAssigning(false)} />}
      {open && <OpenRed e={open} />}

      <AiSummaryCard babyId={d.baby.id} audience={doctor ? 'doctor' : 'asha'} />

      <TempTrendCard babyId={d.baby.id} episodes={d.episodes} title={t('detail.skin')} />

      <Card>
        <H2>{t('detail.kmc')}</H2>
        <KmcBars days={d.kmcByDay} />
      </Card>

      <Card>
        <H2>{t('detail.weight')}</H2>
        <WeightChart weights={d.weights} />
        {d.weights.slice(1).map((w) => (
          <Row key={w.at} style={{ justifyContent: 'space-between' }}>
            <Muted>{w.at}</Muted>
            <Body>
              {w.grams} g{w.gainGPerKgDay !== null ? ` · ${t('detail.gain', { g: w.gainGPerKgDay })}` : ''}
            </Body>
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('detail.alertLog')}</H2>
        {reds.length === 0 && <Muted>{t('baby.noAlerts')}</Muted>}
        {reds.map((e) => {
          const ack = e.staffAcknowledgedAt ? Math.round((Date.parse(e.staffAcknowledgedAt) - Date.parse(e.startedAt)) / 60_000) : null;
          return (
            <Card key={e.id} tint="#f5f4f2">
              <Strong>
                {t(`red.reason.${e.trigger}` as Key)} · {new Date(e.startedAt).toLocaleString()}
              </Strong>
              {e.staffAcknowledgedBy && <Muted>{t('alerts.ackedBy', { name: e.staffAcknowledgedBy.name, min: ack ?? 0 })}</Muted>}
              {e.closedBy && (
                <Muted>
                  {t('baby.closedBy', { name: e.closedBy.name })}
                  {e.closeReason ? ` · ${e.closeReason}` : ''}
                </Muted>
              )}
            </Card>
          );
        })}
      </Card>

      <Card>
        <H2>{t('detail.visits')}</H2>
        {[...d.visits]
          .sort((a, b) => (b.doneAt ?? b.dueDate).localeCompare(a.doneAt ?? a.dueDate))
          .map((v) => (
            <Row key={v.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Body style={{ flex: 1 }}>
                {v.day ? t('visit.title', { d: v.day }) : t('visits.extra')}
                {v.doneAt
                  ? ` · ${v.axillaryTempC ?? '–'} °C${v.weightG ? ` · ${v.weightG} g` : ''}${v.outcome === 'refer' ? ` · ${t('visit.refer')}` : ''}`
                  : ''}
              </Body>
              <Muted style={{ color: !v.doneAt && v.dueDate < new Date().toISOString().slice(0, 10) ? statusColor.red.text : undefined }}>
                {v.doneAt ? `${t('detail.done')} ${v.doneAt.slice(0, 10)}` : `${t('detail.planned')} ${v.dueDate}`}
              </Muted>
            </Row>
          ))}
      </Card>

      {d.referrals.length > 0 && (
        <Card>
          <H2>{t('detail.referrals')}</H2>
          {d.referrals.map((r) => (
            <Body key={r.id}>
              {r.facility.name} · {r.reason} · {ago(lang, Date.parse(r.createdAt))}
            </Body>
          ))}
        </Card>
      )}

      <Card>
        <H2>{t('detail.dangerChecks')}</H2>
        {d.dangerChecks.length === 0 && <Muted>{t('common.empty')}</Muted>}
        {d.dangerChecks.slice(0, 7).map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <Body style={{ color: anyDangerSign(c.answers) ? statusColor.red.text : undefined }}>
              {anyDangerSign(c.answers)
                ? `${t('detail.anySign')}: ${Object.entries(c.answers)
                    .filter(([, v]) => v)
                    .map(([k]) => t(`danger.${k}` as Key))
                    .join(', ')}`
                : t('detail.noSigns')}
            </Body>
            <Muted>{ago(lang, Date.parse(c.at))}</Muted>
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('detail.notes')}</H2>
        {d.advice.length === 0 && <Muted>{t('baby.noAdvice')}</Muted>}
        {d.advice.map((a) => (
          <Card key={a.id} tint={a.kind === 'clinical' ? '#eceafb' : '#f5f4f2'}>
            <Body>{adviceText(a, lang)}</Body>
            <Muted>
              {a.kind === 'clinical' ? t('advice.clinical') : t('advice.family')} · {a.doctorName} · {ago(lang, Date.parse(a.createdAt))}
              {a.followUpDate ? ` · ${t('baby.followUp', { date: a.followUpDate })}` : ''}
            </Muted>
          </Card>
        ))}
      </Card>
    </>
  );
}

/** The open red: acknowledge, or close after a phone check with a written reason. */
function OpenRed({ e }: { e: EpisodeDto }) {
  const { t, lang } = useT();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function close() {
    if (reason.trim().length < 5) return setError(t('alerts.closeNeedsReason'));
    setBusy(true);
    try {
      await api('POST', `/v1/episodes/${encodeURIComponent(e.id)}/close`, { reason: reason.trim() });
      invalidate('/v1/');
    } catch (err) {
      setError((err as ApiError).offline ? t('common.needsInternet') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tint={statusColor.red.soft}>
      <Strong>
        {t('alert.title')} · {t(`red.reason.${e.trigger}` as Key)} · {ago(lang, Date.parse(e.startedAt))}
      </Strong>
      {e.staffAcknowledgedBy ? (
        <Muted>{t('baby.respondedBy', { name: e.staffAcknowledgedBy.name })}</Muted>
      ) : (
        <Button
          label={t('alert.ack')}
          onPress={async () => {
            await api('POST', `/v1/episodes/${encodeURIComponent(e.id)}/ack`).catch(() => undefined);
            invalidate('/v1/');
          }}
        />
      )}
      <Field label={t('alerts.closeReason')} value={reason} onChangeText={setReason} multiline error={error} />
      <Button kind="danger" label={t('detail.closeRed')} onPress={close} busy={busy} />
    </Card>
  );
}
