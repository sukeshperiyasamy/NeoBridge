import { Redirect } from 'expo-router';

import { homePath } from '@neobridge/demo';

import { useSession } from '@/session';

export default function Index() {
  const { account } = useSession();
  return <Redirect href={account ? homePath(account.role) : '/login'} />;
}
