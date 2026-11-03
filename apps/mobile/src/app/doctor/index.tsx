import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandStatus } from '@neobridge/ble-protocol';
import { demoClinicianSummary as summary } from '@neobridge/demo';
import { pick, t } from '@neobridge/i18n';
import { color, radius, size, status as statusColor } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { StatusShape } from '@/components/status-shape';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';
import { useSession } from '@/session';

// Same content as the web clinician summary (apps/web/src/app/doctor).
export default function DoctorHome() {
  const { account } = useSession();
  const [lang] = useLanguage();
  if (account?.role !== 'doctor') return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{pick(lang, summary.title)}</Text>
          <Text style={styles.muted}>{pick(lang, summary.details)}</Text>
          <View style={styles.banner}>
            <StatusShape status={BandStatus.Red} size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{pick(lang, summary.banner)}</Text>
              <Text style={styles.bannerText}>{pick(lang, summary.bannerDetail)}</Text>
            </View>
          </View>
        </View>

        {summary.stats.map((s) => (
          <View key={s.label.en} style={styles.card}>
            <Text style={styles.muted}>{pick(lang, s.label)}</Text>
            <Text style={styles.stat}>{pick(lang, s.value)}</Text>
            <Text style={styles.muted}>{pick(lang, s.note)}</Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.section}>{t(lang, 'doctor.alerts')}</Text>
          {summary.alerts.map((a) => (
            <View key={a.id} style={styles.alert}>
              <StatusShape status={a.status} size={16} />
              <View style={{ flex: 1 }}>
                <Text style={styles.muted}>{pick(lang, a.time)}</Text>
                <Text style={styles.body}>{pick(lang, a.text)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.muted}>{t(lang, 'doctor.disclaimer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  content: { gap: 12, paddingBottom: 24 },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 16, gap: 6 },
  title: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 34, color: color.text },
  section: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 26, color: color.text },
  stat: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 34, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  body: { fontFamily: fontFamily.body, fontSize: 15, color: color.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    padding: 12,
    borderRadius: radius.tile,
    backgroundColor: statusColor.red.soft,
  },
  bannerTitle: { fontFamily: fontFamily.bodyBold, fontSize: 16, color: statusColor.red.text },
  bannerText: { fontFamily: fontFamily.body, fontSize: 13, color: statusColor.red.text },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
