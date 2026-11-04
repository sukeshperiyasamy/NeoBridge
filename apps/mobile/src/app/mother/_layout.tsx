import { Redirect } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { t } from '@neobridge/i18n';

import { getOutbox } from '@/api/outbox';
import { getBandController } from '@/ble/band-controller';
import { SIM_BAND } from '@/ble/sim-band';
import { useBand } from '@/ble/use-band';
import AppTabs from '@/components/app-tabs';
import { RedAlertScreen } from '@/components/red-alert';
import { motherTabs } from '@/components/tab-defs';
import { useLanguage } from '@/language';
import { notifyNow } from '@/notify';
import { getMotherBridge } from '@/mother/bridge';
import { useHousehold } from '@/mother/household';
import { getKmc } from '@/mother/kmc';
import { getReminders } from '@/mother/reminders';
import { useSession } from '@/session';

export default function MotherLayout() {
  const { status, me } = useSession();
  const [lang] = useLanguage();
  const [band] = useBand();
  const { baby, detail } = useHousehold();
  const consented = !!me?.mother?.consentAt;
  const reminderVersion = useSyncExternalStore(getReminders().subscribe, getReminders().getVersion);

  // the phone ↔ server bridge runs while the mother is signed in
  useEffect(() => {
    if (!baby || !consented) return;
    getMotherBridge().start(baby.id, lang);
  }, [baby, consented, lang]);

  // nothing syncs before consent (W1 step 5)
  useEffect(() => {
    getOutbox().setPaused(!consented);
  }, [consented]);

  // the band's calibration offset, and the demo band when the ASHA assigned it
  useEffect(() => {
    if (!baby) return;
    getBandController().setCalibration(baby.calibrationOffsetC ?? 0);
    if (baby.bandId === SIM_BAND.id && band.phase === 'unpaired') void getBandController().useDemoBand();
  }, [baby, band.phase]);

  // pairing a band on this phone records it against the baby (M7, "own, with ASHA")
  const pairedId = band.paired?.id ?? null;
  useEffect(() => {
    if (!baby || !consented || !pairedId || pairedId === baby.bandId) return;
    void getOutbox().push({
      id: `band-${baby.id}-${pairedId}`,
      method: 'POST',
      path: `/v1/babies/${baby.id}/band`,
      body: { bandId: pairedId },
      label: 'Band',
    });
  }, [baby, consented, pairedId]);

  // "charge the band" at once when its battery drops below 20%
  const lowNotified = useRef(0);
  useEffect(() => {
    if (band.battery === null || band.battery >= 20 || Date.now() - lowNotified.current < 6 * 3_600_000) return;
    lowNotified.current = Date.now();
    void notifyNow('NeoBridge', t(lang, 'rem.type.chargeBand')).catch(() => undefined);
  }, [band.battery, lang]);

  // reminders follow the visit schedule, the doctor's follow-up and KMC
  useEffect(() => {
    void getReminders().reschedule(lang, detail, getKmc().lastEndedAt());
  }, [lang, detail, reminderVersion]);

  if (status !== 'signedIn' || me?.profile.role !== 'mother') return <Redirect href="/" />;
  if (!consented) return <Redirect href="/consent" />;

  const ep = band.episode;
  if (ep && !ep.closedAt && !ep.acknowledgedAt) return <RedAlertScreen trigger={ep.trigger} />;

  return <AppTabs tabs={motherTabs} />;
}
