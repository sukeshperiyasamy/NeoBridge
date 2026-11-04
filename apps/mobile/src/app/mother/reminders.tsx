import { useState, useSyncExternalStore } from 'react';

import { istDate } from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';

import { BrandHeader } from '@/components/brand-header';
import { Body, Button, Card, Field, H1, H2, Muted, Row, Screen, Strong, Toggle, useT } from '@/components/ui';
import { notificationsSupported } from '@/notify';
import { useHousehold } from '@/mother/household';
import { getKmc } from '@/mother/kmc';
import { useNow } from '@/use-now';
import { alwaysOn, getReminders, occurrences, reminderTypes, type ReminderType } from '@/mother/reminders';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** M16 today's and upcoming reminders (done or snooze); M17 change type, time, repeat. */
export default function RemindersTab() {
  const { t } = useT();
  const r = getReminders();
  useSyncExternalStore(r.subscribe, r.getVersion);
  useSyncExternalStore(getKmc().subscribe, getKmc().getState);
  const { detail } = useHousehold();
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const today = istDate(now);

  const list = occurrences(r.getSettings(), { now, detail, kmcLastEndedAt: getKmc().lastEndedAt(), days: 14 }).filter(
    (o) => !r.isDone(o.key) && (r.snoozedUntil(o.key) ?? 0) < now,
  );
  const todays = list.filter((o) => istDate(o.at) === today);
  const upcoming = list.filter((o) => istDate(o.at) !== today && o.type !== 'feeding' && o.type !== 'kmcNudge').slice(0, 10);

  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('rem.title')}</H1>
      {!notificationsSupported && <Muted>{t('rem.webNote')}</Muted>}

      <Card>
        <H2>{t('rem.today')}</H2>
        {todays.length === 0 && <Muted>{t('rem.none')}</Muted>}
        {todays.slice(0, 12).map((o) => (
          <Row key={o.key} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Strong style={{ width: 56 }}>{time(o.at)}</Strong>
            <Body style={{ flex: 1 }}>{t(`rem.type.${o.type}` as Key)}</Body>
            {o.at <= now + 30 * 60_000 && (
              <Row gap={6}>
                <Button kind="secondary" label={t('rem.done')} onPress={() => r.markDone(o.key)} />
                <Button kind="secondary" label={t('rem.snooze')} onPress={() => r.snooze(o.key)} />
              </Row>
            )}
          </Row>
        ))}
      </Card>

      <Card>
        <H2>{t('rem.upcoming')}</H2>
        {upcoming.length === 0 && <Muted>{t('common.empty')}</Muted>}
        {upcoming.map((o) => (
          <Row key={o.key} style={{ justifyContent: 'space-between' }}>
            <Body style={{ flex: 1 }}>{t(`rem.type.${o.type}` as Key)}</Body>
            <Muted>
              {istDate(o.at)} · {time(o.at)}
            </Muted>
          </Row>
        ))}
      </Card>

      <Button kind="secondary" label={t('rem.settings')} onPress={() => setEditing((e) => !e)} />
      {editing && reminderTypes.map((type) => <ReminderEditor key={type} type={type} />)}
    </Screen>
  );
}

function ReminderEditor({ type }: { type: ReminderType }) {
  const { t } = useT();
  const r = getReminders();
  const s = r.getSettings()[type];
  const fixed = alwaysOn.includes(type);
  const [value, setValue] = useState(s.time);
  const showTime = type !== 'kmcNudge';
  return (
    <Card>
      <Strong>{t(`rem.type.${type}` as Key)}</Strong>
      {fixed ? <Muted>{t('rem.always')}</Muted> : <Toggle label={t('rem.title')} value={s.enabled} onChange={(enabled) => r.update(type, { enabled })} />}
      {type === 'feeding' && <Muted>{t('rem.everyN', { n: s.everyHours ?? 2 })}</Muted>}
      {showTime && (
        <Field
          label={t('rem.time')}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) r.update(type, { time: v });
          }}
          placeholder="HH:MM"
          maxLength={5}
        />
      )}
    </Card>
  );
}
