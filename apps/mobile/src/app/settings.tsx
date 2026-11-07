import Constants from 'expo-constants';
import { router } from 'expo-router';

import { ago } from '@neobridge/i18n';

import { useStore } from '@/api/cache';
import { getOutbox } from '@/api/outbox';
import { DEMO_BAND_ALLOWED, getBandController } from '@/ble/band-controller';
import { useBand } from '@/ble/use-band';
import { LanguageSwitch } from '@/components/language-switch';
import { Body, Button, Card, H1, H2, Muted, Row, Screen, Strong, Toggle, useT } from '@/components/ui';
import { roleLabel } from '@/components/ui-role';
import { useSettings } from '@/language';
import { useSession } from '@/session';

/** C8 profile and settings, with the upload queue (A17-lite) and about (C10-lite). */
export default function SettingsScreen({ embedded }: { embedded?: boolean }) {
  const { me, signOut } = useSession();
  const { t, bi, lang } = useT();
  const [settings, update] = useSettings();
  const outbox = useStore(getOutbox());
  const [band] = useBand();
  const p = me?.profile;
  const items = getOutbox().getItems();

  return (
    <Screen back={!embedded}>
      <H1>{t('settings.title')}</H1>
      {p && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{t('settings.name')}</Muted>
            <Strong>{p.name}</Strong>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{t('settings.phone')}</Muted>
            <Body>{p.phone}</Body>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{t('settings.role')}</Muted>
            <Body>{roleLabel(t, p)}</Body>
          </Row>
          {p.facility && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>{t('settings.facility')}</Muted>
              <Body style={{ flex: 1, textAlign: 'right' }}>{p.facility.name}</Body>
            </Row>
          )}
          {p.villages.length > 0 && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>{t('settings.villages')}</Muted>
              <Body>{p.villages.map((v) => (lang === 'hi' ? v.nameHi : v.name)).join(', ')}</Body>
            </Row>
          )}
          <Button kind="secondary" icon="edit" label={t('profile.edit')} onPress={() => router.push('/profile-edit')} />
        </Card>
      )}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Strong>{t('language')}</Strong>
          <LanguageSwitch />
        </Row>
        <Toggle label={t('settings.voice')} value={settings.voice} onChange={(voice) => update({ voice })} />
        {lang === 'hi' && (
          <Toggle label={t('settings.showEnglish')} value={settings.showEnglish} onChange={(showEnglish) => update({ showEnglish })} />
        )}
        {p?.role === 'mother' && DEMO_BAND_ALLOWED && (
          <Toggle label={t('settings.demo')} value={band.demoMode} onChange={(on) => void getBandController().setDemoMode(on)} />
        )}
      </Card>

      <Card>
        <H2>{t('settings.queue')}</H2>
        {items.length === 0 ? (
          <Muted>{t('settings.queueEmpty')}</Muted>
        ) : (
          items.slice(0, 12).map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <Body>{i.label}</Body>
              <Muted>{ago(lang, i.createdAt)}</Muted>
            </Row>
          ))
        )}
        <Muted>
          {outbox.lastSyncAt ? t('sync.banner.last', { ago: ago(lang, outbox.lastSyncAt) }) : t('sync.banner.never')}
        </Muted>
        {items.length > 0 && <Button kind="secondary" label={t('settings.retry')} onPress={() => getOutbox().retryNow()} />}
      </Card>

      {/* Hardware bring-up for the ESP32 serial band; technician only, English. */}
      <Button kind="secondary" label="Band test (ESP32)" onPress={() => router.push('/band-test')} />

      <Card>
        <Muted>{t('splash.version', { v: Constants.expoConfig?.version ?? '1.0.0' })} · rules 2026.11-demo</Muted>
        <Muted>{t('settings.about')}</Muted>
      </Card>

      <Button
        kind="danger"
        label={bi('logout')}
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
