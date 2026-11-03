import { Redirect } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus } from '@neobridge/ble-protocol';
import { demoBabies } from '@neobridge/demo';
import { color, radius, size, status as statusColor } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { StatusShape } from '@/components/status-shape';
import { fontFamily } from '@/constants/fonts';
import { useSession } from '@/session';

// Red first, then yellow, grey, green (Figma: ASHA · My babies).
const order = [BandStatus.Red, BandStatus.Yellow, BandStatus.Grey, BandStatus.Green];
const babies = [...demoBabies].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

const rowBackground = {
  [BandStatus.Red]: statusColor.red.soft,
  [BandStatus.Yellow]: statusColor.yellow.panel,
  [BandStatus.Grey]: statusColor.grey.panel,
  [BandStatus.Green]: color.surface,
};

export default function AshaHome() {
  const { account } = useSession();
  if (account?.role !== 'asha') return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <Text style={styles.title}>मेरे शिशु</Text>
      <Text style={styles.muted}>My babies · red first · synced 2 min ago</Text>

      <View style={styles.counts}>
        {order.map((s) => (
          <View key={s} style={styles.count}>
            <StatusShape status={s} size={16} />
            <Text style={styles.countText}>{demoBabies.filter((b) => b.status === s).length}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={babies}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: b }) => (
          <View style={[styles.row, { backgroundColor: rowBackground[b.status] }]}>
            <StatusShape status={b.status} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {b.nameLocal} <Text style={styles.muted}>{b.village} · दिन {b.dayOfLife}</Text>
              </Text>
              <Text style={styles.muted}>
                {b.name} · {b.note}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  counts: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: color.surface,
  },
  countText: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.text },
  list: { gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
  },
  rowTitle: { fontFamily: fontFamily.bodyBold, fontSize: 17, color: color.text },
});
