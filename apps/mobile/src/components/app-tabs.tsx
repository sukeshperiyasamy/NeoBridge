import { NativeTabs } from 'expo-router/native-tabs';

import { t } from '@neobridge/i18n';
import { color } from '@neobridge/tokens';

import { useLanguage } from '@/language';

// Tab icons are placeholders from the Expo starter until the Figma
// pictograms (home, phone, band) are exported into assets/images/tabIcons.
export default function AppTabs() {
  const [lang] = useLanguage();

  return (
    <NativeTabs
      backgroundColor={color.surface}
      indicatorColor={color.actionSoft}
      labelStyle={{ selected: { color: color.actionStrong } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t(lang, 'nav.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="call">
        <NativeTabs.Trigger.Label>{t(lang, 'nav.call')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="band">
        <NativeTabs.Trigger.Label>{t(lang, 'nav.band')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
