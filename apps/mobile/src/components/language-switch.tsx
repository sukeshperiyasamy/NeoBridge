import { Pressable, StyleSheet, Text, View } from 'react-native';

import { languages, t, uiLanguages } from '@neobridge/i18n';
import { color, radius } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';

/** English | हिन्दी toggle. Each option is written in its own language. */
export function LanguageSwitch() {
  const [lang, setLang] = useLanguage();

  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel={t(lang, 'language')}>
      {uiLanguages.map((code) => {
        const selected = lang === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.option, selected && styles.selected]}
            onPress={() => setLang(code)}>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {languages.find((l) => l.code === code)!.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.chip,
    backgroundColor: color.actionSoft,
  },
  option: {
    minHeight: 40,
    minWidth: 68,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
  },
  selected: { backgroundColor: color.action },
  label: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.actionStrong },
  labelSelected: { color: color.surface },
});
