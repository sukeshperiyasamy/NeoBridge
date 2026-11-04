import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BabyListItem, DoctorDashboardDto } from '@neobridge/domain';
import type { Key } from '@neobridge/i18n';
import { color, radius, status as statusColor } from '@neobridge/tokens';

import { useApi } from '@/api/cache';
import { BrandHeader } from '@/components/brand-header';
import { BabyRow } from '@/components/staff';
import { Card, H1, H2, Muted, QueryView, Screen, Strong, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';

const tileTone: Record<string, string> = {
  redYellow: statusColor.red.soft,
  kmcUnder8: statusColor.yellow.panel,
  notGaining: statusColor.yellow.panel,
  visitsOverdue: statusColor.grey.panel,
  mothersInWindow: color.actionSoft,
  greyBands: statusColor.grey.panel,
};

/**
 * D1 newborn (neonatology, paediatrics), D2 postpartum (obstetrics, light),
 * D3 catchment (medical officer, light). The specialisation on the server
 * profile picks the dashboard. Red alerts nobody acknowledged in 15 minutes
 * are flagged at the top.
 */
export default function DoctorDashboard() {
  const { t } = useT();
  const dash = useApi<DoctorDashboardDto>('/v1/dashboard', { pollMs: 30_000 });
  const babies = useApi<{ babies: BabyListItem[] }>('/v1/babies', { pollMs: 30_000 });

  return (
    <Screen header={<BrandHeader />}>
      <QueryView q={dash}>
        {(d) => {
          const list = babies.data?.babies ?? [];
          return (
            <>
              <H1>{t(`doc.dashboard.${d.kind}` as Key)}</H1>
              {d.escalations.length > 0 && (
                <Card tint={statusColor.red.soft}>
                  <H2 style={{ color: statusColor.red.text }}>⚑ {t('doc.escalations')}</H2>
                  {d.escalations.map((e) => (
                    <Pressable
                      key={e.episode.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/baby/[id]', params: { id: e.episode.babyId } })}>
                      <Strong>{t('doc.escalationRow', { baby: e.babyName, min: e.minutes, mother: e.motherName })}</Strong>
                    </Pressable>
                  ))}
                </Card>
              )}
              <View style={styles.tiles}>
                {d.tiles.map((tile) => (
                  <Pressable
                    key={tile.key}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/doctor/patients', params: { tile: tile.key } })}
                    style={({ pressed }) => [styles.tile, { backgroundColor: tileTone[tile.key] ?? color.surface }, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.count}>{tile.count}</Text>
                    <Text style={styles.label}>{t(`doc.tile.${tile.key}` as Key)}</Text>
                  </Pressable>
                ))}
              </View>
              {/* the babies behind the first tile, red first */}
              <H2>{t(`doc.tile.${d.tiles[0]?.key ?? 'redYellow'}` as Key)}</H2>
              {(d.tiles[0]?.babyIds ?? []).length === 0 && <Muted>{t('common.empty')}</Muted>}
              {list
                .filter((b) => d.tiles[0]?.babyIds.includes(b.baby.id))
                .map((b) => (
                  <BabyRow key={b.baby.id} item={b} showAsha onPress={() => router.push({ pathname: '/baby/[id]', params: { id: b.baby.id } })} />
                ))}
              <Muted>{t('settings.about')}</Muted>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 110,
    borderRadius: radius.tile,
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.border,
  },
  count: { fontFamily: fontFamily.headingHeavy, fontSize: 36, lineHeight: 44, color: color.text },
  label: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, lineHeight: 20, color: color.text },
});
