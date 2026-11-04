import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { doctorTabs } from '@/components/tab-defs';
import { useSession } from '@/session';

/** Doctor: Dashboard · Patients · Alerts · Notes · Profile, at phone width. */
export default function DoctorLayout() {
  const { status, me } = useSession();
  if (status !== 'signedIn' || (me?.profile.role !== 'doctor' && me?.profile.role !== 'admin')) return <Redirect href="/" />;
  return <AppTabs tabs={doctorTabs} />;
}
