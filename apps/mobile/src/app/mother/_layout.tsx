import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useSession } from '@/session';

export default function MotherLayout() {
  const { account } = useSession();
  if (account?.role !== 'mother') return <Redirect href="/login" />;
  return <AppTabs />;
}
