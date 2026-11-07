import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { KMC_TARGET_HOURS, type BabyListItem, type DoctorDashboardDto, type Status } from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';

import { useApi } from '@/api/cache';
import { BrandHeader } from '@/components/brand-header';
import { BabyRow, villageName } from '@/components/staff';
import { Button, Choice, Empty, Field, H1, Muted, QueryView, Screen, useT } from '@/components/ui';

const statuses: Status[] = ['red', 'yellow', 'grey', 'green'];
type DayBand = 'any' | '0-7' | '8-28' | '29-42';

/** D4: patient list. Filter by status, village, ASHA, day of life; search by name or phone. */
export default function Patients() {
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ tile?: string }>();
  const q = useApi<{ babies: BabyListItem[] }>('/v1/babies', { pollMs: 30_000 });
  const dash = useApi<DoctorDashboardDto>('/v1/dashboard');
  const [tile, setTile] = useState<string | null>(params.tile ?? null);
  const [status, setStatus] = useState<Status | 'any'>('any');
  const [village, setVillage] = useState<string>('any');
  const [asha, setAsha] = useState<string>('any');
  const [day, setDay] = useState<DayBand>('any');
  const [search, setSearch] = useState('');

  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('doc.patients')}</H1>
      <QueryView q={q}>
        {({ babies }) => {
          const villages = [...new Map(babies.filter((b) => b.mother.village).map((b) => [b.mother.village!.id, b.mother.village!])).values()];
          const ashas = [...new Map(babies.filter((b) => b.mother.asha).map((b) => [b.mother.asha!.id, b.mother.asha!])).values()];
          const tileIds = tile ? (dash.data?.tiles.find((x) => x.key === tile)?.babyIds ?? null) : null;
          const needle = search.trim().toLowerCase();
          const shown = babies.filter((b) => {
            if (tileIds && !tileIds.includes(b.baby.id)) return false;
            if (tile === 'kmcUnder8' && !tileIds && b.kmcHoursYesterday >= KMC_TARGET_HOURS) return false;
            if (status !== 'any' && b.baby.status !== status) return false;
            if (village !== 'any' && b.mother.village?.id !== village) return false;
            if (asha !== 'any' && b.mother.asha?.id !== asha) return false;
            if (day !== 'any') {
              const [lo, hi] = day.split('-').map(Number);
              if (b.dayOfLife < lo || b.dayOfLife > hi) return false;
            }
            if (needle && ![b.baby.name, b.mother.name, b.mother.phone].join(' ').toLowerCase().includes(needle)) return false;
            return true;
          });
          return (
            <>
              {tile && (
                <Button kind="secondary" icon="close" label={t(`doc.tile.${tile}` as Key)} onPress={() => setTile(null)} />
              )}
              <Field label={t('asha.search')} value={search} onChangeText={setSearch} />
              <Choice
                label={t('doc.filter.status')}
                options={[{ value: 'any', label: t('doc.filter.any') }, ...statuses.map((s) => ({ value: s, label: t(`status.label.${s}` as Key) }))]}
                value={status}
                onChange={setStatus}
              />
              <Choice
                label={t('doc.filter.village')}
                options={[{ value: 'any', label: t('doc.filter.any') }, ...villages.map((v) => ({ value: v.id, label: villageName(v, lang) }))]}
                value={village}
                onChange={setVillage}
              />
              <Choice
                label={t('doc.filter.asha')}
                options={[{ value: 'any', label: t('doc.filter.any') }, ...ashas.map((a) => ({ value: a.id, label: a.name }))]}
                value={asha}
                onChange={setAsha}
              />
              <Choice<DayBand>
                label={t('doc.filter.day')}
                options={[
                  { value: 'any', label: t('doc.filter.any') },
                  { value: '0-7', label: '1–7' },
                  { value: '8-28', label: '8–28' },
                  { value: '29-42', label: '29–42' },
                ]}
                value={day}
                onChange={setDay}
              />
              <Muted>
                {shown.length} / {babies.length}
              </Muted>
              {shown.length === 0 && <Empty />}
              {shown.map((b) => (
                <BabyRow key={b.baby.id} item={b} showAsha onPress={() => router.push({ pathname: '/baby/[id]', params: { id: b.baby.id } })} />
              ))}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
