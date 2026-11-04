import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Key } from '@neobridge/i18n';

import { getBandController } from '@/ble/band-controller';
import { Button, Card, H1, H2, Line, Screen, useT } from '@/components/ui';
import { useSettings } from '@/language';
import { requestNotificationPermission } from '@/notify';
import { useSession } from '@/session';

/** C6: explains Bluetooth, notifications and calls before Android asks for each. */
export default function PermissionsPrimer() {
  const { t, bi } = useT();
  const [, update] = useSettings();
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  const mother = me?.profile.role === 'mother';

  const items: { title: Key; why: Key }[] = [
    ...(mother || me?.profile.role === 'asha' ? [{ title: 'perm.bluetooth' as Key, why: 'perm.bluetoothWhy' as Key }] : []),
    { title: 'perm.notifications', why: 'perm.notificationsWhy' },
    { title: 'perm.calls', why: 'perm.callsWhy' },
  ];

  async function next() {
    setBusy(true);
    await requestNotificationPermission().catch(() => false);
    if (mother || me?.profile.role === 'asha') await getBandController().requestPermissions().catch(() => false);
    update({ primerDone: true });
    setBusy(false);
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <H1>{t('perm.title')}</H1>
      <Line value={bi('perm.sub')} />
      {items.map((i) => (
        <Card key={i.title}>
          <H2>{t(i.title)}</H2>
          <Line value={bi(i.why)} />
        </Card>
      ))}
      <View style={{ height: 8 }} />
      <Button label={bi('perm.continue')} onPress={next} busy={busy} />
    </Screen>
  );
}
