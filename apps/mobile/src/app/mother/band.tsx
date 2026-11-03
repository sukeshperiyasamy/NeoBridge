import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, size } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { fontFamily } from '@/constants/fonts';

// TODO: band on wrist, battery, right fit, daily wrist check (Figma: "Band tab").
export default function BandScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <Text style={styles.title}>बैंड</Text>
      <Text style={styles.sub}>Band: wear, charge, check</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  sub: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
});
