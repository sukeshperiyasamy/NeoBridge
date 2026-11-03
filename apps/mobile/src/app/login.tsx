import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { demoAccounts, homePath } from '@neobridge/demo';
import { bi, pick, t, type Bilingual } from '@neobridge/i18n';
import { color, radius, size } from '@neobridge/tokens';

import { LanguageSwitch } from '@/components/language-switch';
import { fontFamily } from '@/constants/fonts';
import { useLanguage } from '@/language';
import { useSession } from '@/session';

const LOGO_HEIGHT = 48;

export default function LoginScreen() {
  const { signIn } = useSession();
  const [lang] = useLanguage();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  function submit() {
    const account = signIn(id, password);
    if (!account) {
      setFailed(true);
      return;
    }
    router.replace(homePath(account.role));
  }

  const error = bi(lang, 'login.error');

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Image
            source={require('@/assets/images/neobridge-logo.png')}
            style={{ height: LOGO_HEIGHT, width: (LOGO_HEIGHT * 1261) / 355 }}
            contentFit="contain"
            accessibilityLabel="NeoBridge"
          />
          <LanguageSwitch />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t(lang, 'login.title')}</Text>
          {lang !== 'en' && <Text style={styles.muted}>{t('en', 'login.sub')}</Text>}

          <FieldLabel value={bi(lang, 'login.id')} />
          <TextInput
            style={styles.input}
            value={id}
            onChangeText={setId}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />

          <FieldLabel value={bi(lang, 'login.password')} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={submit}
          />

          {failed && (
            <Text style={styles.error}>
              {error.text}
              {error.gloss ? ` · ${error.gloss}` : ''}
            </Text>
          )}

          <Pressable style={styles.submit} accessibilityRole="button" onPress={submit}>
            <Text style={styles.submitText}>{t(lang, 'login.submit')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.demoTitle}>{t(lang, 'login.demoTitle')}</Text>
          <Text style={styles.muted}>{t(lang, 'login.demoSub')}</Text>

          {demoAccounts.map((a) => (
            <View key={a.role} style={styles.account}>
              <View style={styles.accountTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountWho}>{pick(lang, a.label)}</Text>
                  <Text style={styles.muted}>{pick(lang, a.name)}</Text>
                </View>
                <Pressable
                  style={styles.fill}
                  accessibilityRole="button"
                  onPress={() => {
                    setId(a.id);
                    setPassword(a.password);
                    setFailed(false);
                  }}>
                  <Text style={styles.fillText}>{t(lang, 'login.fill')}</Text>
                </Pressable>
              </View>
              <Text style={styles.cred}>
                {t(lang, 'login.id')}: <Text style={styles.credValue}>{a.id}</Text>
              </Text>
              <Text style={styles.cred}>
                {t(lang, 'login.password')}: <Text style={styles.credValue}>{a.password}</Text>
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldLabel({ value }: { value: Bilingual }) {
  return (
    <Text style={styles.label}>
      {value.text} {value.gloss && <Text style={styles.muted}>{value.gloss}</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { padding: size.screenGutter, gap: 16 },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.panel,
    padding: 20,
    gap: 6,
  },
  title: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  demoTitle: { fontFamily: fontFamily.heading, fontSize: 21, lineHeight: 28, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, color: color.textMuted },
  label: { marginTop: 10, fontFamily: fontFamily.bodySemiBold, fontSize: 16, color: color.text },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    backgroundColor: color.background,
    fontFamily: fontFamily.body,
    fontSize: 17,
    color: color.text,
  },
  error: { marginTop: 6, fontFamily: fontFamily.bodySemiBold, color: '#a82820' },
  submit: {
    marginTop: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: color.action,
  },
  submitText: { fontFamily: fontFamily.heading, fontSize: 20, color: color.surface },
  account: {
    marginTop: 8,
    padding: 14,
    borderRadius: radius.tile,
    backgroundColor: color.actionSoft,
    gap: 2,
  },
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  accountWho: { fontFamily: fontFamily.bodyBold, fontSize: 17, color: color.text },
  fill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  fillText: { fontFamily: fontFamily.bodyBold, fontSize: 14, color: color.action },
  cred: { fontFamily: fontFamily.body, fontSize: 14, color: color.textSecondary },
  credValue: { fontFamily: fontFamily.bodyBold, color: color.actionStrong },
});
