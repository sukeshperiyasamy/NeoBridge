import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, size } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';

// Browser build of the bottom bar (Figma: Navigation · मुख्य). Phones use the
// native tabs in app-tabs.tsx.
export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabSlot style={styles.slot} />
      <TabList style={styles.bar}>
        <TabTrigger name="index" href="/mother" asChild>
          <TabButton local="घर" english="Home" />
        </TabTrigger>
        <TabTrigger name="call" href="/mother/call" asChild>
          <TabButton local="फ़ोन" english="Call" />
        </TabTrigger>
        <TabTrigger name="band" href="/mother/band" asChild>
          <TabButton local="बैंड" english="Band" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

// `ref` is typed for View, not Pressable, so it is not forwarded.
function TabButton({
  local,
  english,
  isFocused,
  ref: _ref,
  ...props
}: TabTriggerSlotProps & { local: string; english: string }) {
  return (
    <Pressable {...props} style={styles.tab}>
      <View style={[styles.pill, isFocused && styles.pillActive]} />
      <Text style={[styles.local, isFocused && styles.localActive]}>{local}</Text>
      <Text style={styles.english}>{english}</Text>
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
