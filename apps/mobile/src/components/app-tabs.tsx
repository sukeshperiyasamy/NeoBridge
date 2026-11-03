import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@neobridge/tokens';

// Tab icons are placeholders from the Expo starter until the Figma
// pictograms (home, phone, band) are exported into assets/images/tabIcons.
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={color.surface}
      indicatorColor={color.actionSoft}
      labelStyle={{ selected: { color: color.actionStrong } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>घर · Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="call">
        <NativeTabs.Trigger.Label>फ़ोन · Call</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="band">
        <NativeTabs.Trigger.Label>बैंड · Band</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
