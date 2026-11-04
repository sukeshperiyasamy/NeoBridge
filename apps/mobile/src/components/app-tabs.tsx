import { NativeTabs } from 'expo-router/native-tabs';

import { t } from '@neobridge/i18n';
import { color } from '@neobridge/tokens';

import { useLanguage } from '@/language';

import type { TabDef } from './tab-defs';

const icons = {
  home: require('@/assets/images/tabIcons/home.png'),
  explore: require('@/assets/images/tabIcons/explore.png'),
};

// Tab icons are placeholders until the Figma pictograms are exported.
export default function AppTabs({ tabs }: { tabs: TabDef[] }) {
  const [lang] = useLanguage();

  return (
    <NativeTabs
      backgroundColor={color.surface}
      indicatorColor={color.actionSoft}
      labelStyle={{ selected: { color: color.actionStrong } }}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{t(lang, tab.label)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={icons[tab.icon]} renderingMode="template" />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
