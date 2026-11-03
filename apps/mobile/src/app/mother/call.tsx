import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, size } from '@neobridge/tokens';

import { BrandHeader } from '@/components/brand-header';
import { fontFamily } from '@/constants/fonts';

// TODO: ASHA card, 102 free transport, nearest facility (Figma: "Call tab").
export default function CallScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <BrandHeader />
      <Text style={styles.title}>फ़ोन</Text>
      <Text style={styles.sub}>Who to call</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  sub: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
});
