import { useState } from 'react';
import { Pressable } from 'react-native';

import { color } from '@neobridge/tokens';

import { invalidate } from '@/api/cache';
import { ApiError, api } from '@/api/client';
import { DEMO_BAND_ALLOWED, getBandController } from '@/ble/band-controller';
import { SIM_BAND } from '@/ble/sim-band';
import { useBand } from '@/ble/use-band';
import { Button, Card, Field, H2, Muted, Row, Strong, useT } from '@/components/ui';

/** A6: scan, pick the nearest NeoBridge band (or the demo band), record it against the baby. */
export function AssignBand({ babyId, onDone, onLater }: { babyId: string; onDone: (bandId: string) => void; onLater?: () => void }) {
  const { t, bi } = useT();
  const [band] = useBand();
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(bandId: string) {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/v1/babies/${babyId}/band`, { bandId, serial: bandId === SIM_BAND.id ? 'DEMO' : bandId.toUpperCase() });
      invalidate('/v1/');
      onDone(bandId);
    } catch (e) {
      setError((e as ApiError).offline ? t('common.needsInternet') : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <H2>{t('reg.band')}</H2>
      <Button kind="secondary" label={band.scanning ? t('band.state.scanning') : t('reg.bandScan')} onPress={() => void getBandController().startScan()} disabled={band.scanning} />
      {band.found.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          onPress={() => void assign(b.id)}
          style={({ pressed }) => [{ padding: 12, borderRadius: 16, backgroundColor: color.actionSoft }, pressed && { opacity: 0.8 }]}>
          <Strong>{b.name}</Strong>
          <Muted>
            {b.id} · {b.rssi ?? '–'} dBm
          </Muted>
        </Pressable>
      ))}
      {DEMO_BAND_ALLOWED && <Button label={bi('reg.bandUseDemo')} onPress={() => void assign(SIM_BAND.id)} busy={busy} />}
      <Field label={t('reg.bandSerial')} value={serial} onChangeText={setSerial} />
      {serial.trim().length >= 3 && <Button kind="secondary" label={t('reg.bandAssign')} onPress={() => void assign(serial.trim())} busy={busy} />}
      {error && <Muted style={{ color: '#a82820' }}>{error}</Muted>}
      {onLater && (
        <Row>
          <Button kind="secondary" label={t('reg.bandLater')} onPress={onLater} style={{ flex: 1 }} />
        </Row>
      )}
    </Card>
  );
}
