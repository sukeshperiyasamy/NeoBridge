import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { StaffRedAlert, useRedAlerts } from '@/components/staff';
import { ashaTabs } from '@/components/tab-defs';
import { useSession } from '@/session';

/** ASHA: Babies · Visits · Alerts · Register · Profile, with the red-alert screen (A12) over everything. */
export default function AshaLayout() {
  const { status, me } = useSession();
  const red = useRedAlerts();
  if (status !== 'signedIn' || me?.profile.role !== 'asha') return <Redirect href="/" />;
  if (red.alert) {
    const a = red.alert;
    return <StaffRedAlert alert={a} onAck={() => red.acknowledge(a.id)} onDismiss={() => red.dismiss(a.id)} />;
  }
  return <AppTabs tabs={ashaTabs} />;
}
