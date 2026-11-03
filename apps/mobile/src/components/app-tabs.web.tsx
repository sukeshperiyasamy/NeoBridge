import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { bi, type Key } from '@neobridge/i18n';
import { color, size } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';

// Browser build of the bottom bar (Figma: Navigation · मुख्य). Phones use the
// native tabs in app-tabs.tsx.
export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabSlot style={styles.slot} />
      <TabList style={styles.bar}>
        <TabTrigger name="index" href="/mother" asChild>
          <TabButton labelKey="nav.home" />
        </TabTrigger>
        <TabTrigger name="call" href="/mother/call" asChild>
          <TabButton labelKey="nav.call" />
        </TabTrigger>
        <TabTrigger name="band" href="/mother/band" asChild>
          <TabButton labelKey="nav.band" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

// `ref` is typed for View, not Pressable, so it is not forwarded.
function TabButton({
  labelKey,
  isFocused,
  ref: _ref,
  ...props
}: TabTriggerSlotProps & { labelKey: Key }) {
  const [lang] = useLanguage();
  const label = bi(lang, labelKey);
  return (
    <Pressable {...props} style={styles.tab}>
      <View style={[styles.pill, isFocused && styles.pillActive]} />
      <Text style={[styles.local, isFocused && styles.localActive]}>{label.text}</Text>
      {label.gloss && <Text style={styles.english}>{label.gloss}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
  bar: {
    flexDirection: 'row',
    height: size.tabBar,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pill: { width: 60, height: 8, borderRadius: 4 },
  pillActive: { backgroundColor: color.actionSoft },
  local: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: color.textSecondary },
  localActive: { fontFamily: fontFamily.bodyBold, color: color.actionStrong },
  english: { fontFamily: fontFamily.body, fontSize: 11, color: color.textMuted },
});
