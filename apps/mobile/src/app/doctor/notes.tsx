import { router } from 'expo-router';
import { Pressable } from 'react-native';

import type { AdviceKind, AdviceTemplate } from '@neobridge/domain';
import { ago } from '@neobridge/i18n';

import { useApi } from '@/api/cache';
import { adviceText } from '@/components/advice-text';
import { BrandHeader } from '@/components/brand-header';
import { Body, Card, H1, Muted, QueryView, Screen, Strong, useT } from '@/components/ui';

interface Note {
  id: string;
  babyId: string;
  kind: AdviceKind;
  template: AdviceTemplate | null;
  body: string;
  followUpDate: string | null;
  createdAt: string;
  babyName: string;
  motherName: string;
}

/** The advice notes this doctor has written, newest first (D9 follow-up dates show here in P0). */
export default function DoctorNotes() {
  const { t, lang } = useT();
  const q = useApi<{ notes: Note[] }>('/v1/advice');
  return (
    <Screen header={<BrandHeader />}>
      <H1>{t('doc.notes')}</H1>
      <QueryView q={q}>
        {({ notes }) => (
          <>
            {notes.length === 0 && <Muted>{t('doc.noNotes')}</Muted>}
            {notes.map((n) => (
              <Pressable key={n.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/baby/[id]', params: { id: n.babyId } })}>
                <Card>
                  <Strong>
                    {n.babyName} <Muted>· {n.motherName}</Muted>
                  </Strong>
                  <Body>{adviceText(n, lang)}</Body>
                  <Muted>
                    {n.kind === 'clinical' ? t('advice.clinical') : t('advice.family')} · {ago(lang, Date.parse(n.createdAt))}
                    {n.followUpDate ? ` · ${t('baby.followUp', { date: n.followUpDate })}` : ''}
                  </Muted>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
