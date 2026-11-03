import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { demoAshaName, demoPhone } from '@neobridge/demo';
import { bi, t, type Bilingual } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { CallButton } from '@/components/call-button';
import { CallIconButton } from '@/components/call-icon-button';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';

// Figma: Call tab. Every button opens the dialer; calls need no internet.
export default function CallScreen() {
  const [lang] = useLanguage();
  const village = { en: 'Saraiya village', hi: 'सरैया' };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t(lang, 'call.title')}</Text>
        <Text style={styles.muted}>{t(lang, 'call.noInternet')}</Text>

        <View style={styles.card}>
          <Text style={styles.name}>{bi(lang, 'call.asha', { name: demoAshaName }).text}</Text>
          <Text style={styles.muted}>{t(lang, 'call.ashaRole', { village })}</Text>
          <CallButton label={bi(lang, 'call.button')} phone={demoPhone.asha} />
        </View>

        <Row
          title={bi(lang, 'call.transport.title')}
          sub={bi(lang, 'call.transport.sub')}
          phone={demoPhone.transport}
        />
        <Row
          title={bi(lang, 'call.facility.title')}
          sub={bi(lang, 'call.facility.sub')}
          phone={demoPhone.facility}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ title, sub, phone }: { title: Bilingual; sub: Bilingual; phone: string }) {
  return (
    <View style={[styles.card, styles.row]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title.text}</Text>
        <Text style={styles.muted}>{sub.text}</Text>
        {sub.gloss && <Text style={styles.muted}>{sub.gloss}</Text>}
      </View>
      <CallIconButton phone={phone} label={title.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  content: { gap: 12, paddingBottom: 24 },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 30, color: color.text },
  rowTitle: { fontFamily: fontFamily.bodyBold, fontSize: 17, color: color.text },
});
