import { router } from 'expo-router';
import { useState } from 'react';

import type { BabyListItem } from '@neobridge/domain';
import { ago } from '@neobridge/i18n';

import { useApi } from '@/api/cache';
import { BrandHeader } from '@/components/brand-header';
import { VisitPlanCard } from '@/components/ai';
import { BabyRow, villageName } from '@/components/staff';
import { Choice, Empty, Field, H1, Muted, QueryView, Screen, useT } from '@/components/ui';

type Filter = 'all' | 'red' | 'yellow' | 'grey' | 'visits';

/** A1: counts by status, then babies sorted red first (unacked, acked), yellow, grey, overdue, due today, green. */
export default function AshaBabies() {
  const { t, lang } = useT();
  const q = useApi<{ babies: BabyListItem[] }>('/v1/babies', { pollMs: 30_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('asha.title')}</H1>
      <QueryView q={q}>
        {({ babies }) => {
          const count = (s: string) => babies.filter((b) => b.baby.status === s).length;
          const needle = search.trim().toLowerCase();
          const shown = babies.filter((b) => {
            if (filter === 'visits' && !(b.nextVisit && (b.nextVisit.state === 'overdue' || b.nextVisit.state === 'due'))) return false;
            if (filter !== 'all' && filter !== 'visits' && b.baby.status !== filter) return false;
            if (!needle) return true;
            return [b.baby.name, b.mother.name, b.mother.phone, villageName(b.mother.village, 'en'), villageName(b.mother.village, 'hi')]
              .join(' ')
              .toLowerCase()
              .includes(needle);
          });
          return (
            <>
              <Muted>
                {t('asha.counts', { red: count('red'), yellow: count('yellow'), grey: count('grey') })}
                {q.at ? ` · ${t('asha.synced', { ago: ago(lang, q.at) })}` : ''}
              </Muted>
              {filter === 'all' && !needle && <VisitPlanCard babies={babies} />}
              <Choice<Filter>
                options={[
                  { value: 'all', label: t('asha.filter.all') },
                  { value: 'red', label: `${t('asha.filter.red')} ${count('red')}` },
                  { value: 'yellow', label: `${t('asha.filter.yellow')} ${count('yellow')}` },
                  { value: 'grey', label: `${t('asha.filter.grey')} ${count('grey')}` },
                  { value: 'visits', label: t('asha.filter.visits') },
                ]}
                value={filter}
                onChange={setFilter}
              />
              <Field label={t('asha.search')} value={search} onChangeText={setSearch} />
              {shown.length === 0 && <Empty />}
              {shown.map((b) => (
                <BabyRow key={b.baby.id} item={b} onPress={() => router.push({ pathname: '/baby/[id]', params: { id: b.baby.id } })} />
              ))}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
