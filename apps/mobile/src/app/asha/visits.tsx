import { router } from 'expo-router';
import { Pressable } from 'react-native';

import type { Status, Village } from '@neobridge/domain';

import { useApi } from '@/api/cache';
import { BrandHeader } from '@/components/brand-header';
import { villageName } from '@/components/staff';
import { Card, H1, H2, Muted, QueryView, Row, Screen, StatusChip, Strong, rowTint, useT } from '@/components/ui';

interface DueVisit {
  id: string;
  babyId: string;
  day: number | null;
  dueDate: string;
  kind: 'scheduled' | 'extra';
  reason: string | null;
  state: 'overdue' | 'due' | 'upcoming';
  babyName: string;
  motherName: string;
  village: Village | null;
  status: Status;
  dayOfLife: number;
}

/** A2: visits due today and overdue, then the rest of this week. */
export default function AshaVisits() {
  const { t } = useT();
  const q = useApi<{ today: string; visits: DueVisit[] }>('/v1/visits', { pollMs: 60_000 });

  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('visits.title')}</H1>
      <QueryView q={q}>
        {({ visits }) => (
          <>
            {visits.length === 0 && <Muted>{t('visits.none')}</Muted>}
            {(['overdue', 'due', 'upcoming'] as const).map((state) => {
              const list = visits.filter((v) => v.state === state);
              if (list.length === 0) return null;
              return (
                <Card key={state}>
                  <H2>{t(state === 'overdue' ? 'visits.overdue' : state === 'due' ? 'visits.today' : 'visits.week')}</H2>
                  {list.map((v) => (
                    <VisitRow key={v.id} v={v} />
                  ))}
                </Card>
              );
            })}
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function VisitRow({ v }: { v: DueVisit }) {
  const { t, lang } = useT();
  const reason =
    v.kind === 'extra'
      ? v.reason?.startsWith('red')
        ? t('visits.reason.red')
        : v.reason === 'doctor'
          ? t('visits.reason.doctor')
          : t('visits.extra')
      : t('visit.title', { d: v.day ?? '–' });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/visit/[babyId]', params: { babyId: v.babyId, visitId: v.id } })}
      style={({ pressed }) => [{ padding: 12, borderRadius: 16, backgroundColor: rowTint[v.status], gap: 4 }, pressed && { opacity: 0.85 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Strong>{reason}</Strong>
        <StatusChip status={v.status} small />
      </Row>
      <Strong>
        {v.babyName} <Muted>· {v.motherName}</Muted>
      </Strong>
      <Muted>
        {villageName(v.village, lang)} · {t('day', { n: v.dayOfLife })} · {v.dueDate}
      </Muted>
    </Pressable>
  );
}
