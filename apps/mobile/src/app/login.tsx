import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { demoAccounts, homePath } from '@neobridge/demo';
import { color, radius, size } from '@neobridge/tokens';

import { fontFamily } from '@/constants/fonts';
import { useSession } from '@/session';

const LOGO_HEIGHT = 48;

export default function LoginScreen() {
  const { signIn } = useSession();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit() {
    const account = signIn(id, password);
    if (!account) {
      setError('ID या पासवर्ड गलत है · Wrong ID or password');
      return;
    }
    router.replace(homePath(account.role));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image
          source={require('@/assets/images/neobridge-logo.png')}
          style={{ height: LOGO_HEIGHT, width: (LOGO_HEIGHT * 1261) / 355 }}
          contentFit="contain"
          accessibilityLabel="NeoBridge"
        />

        <View style={styles.card}>
          <Text style={styles.title}>लॉग इन करें</Text>
          <Text style={styles.muted}>Log in to NeoBridge</Text>

          <Text style={styles.label}>
            यूज़र ID <Text style={styles.muted}>User ID</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={id}
            onChangeText={setId}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />

          <Text style={styles.label}>
            पासवर्ड <Text style={styles.muted}>Password</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={submit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.submit} accessibilityRole="button" onPress={submit}>
            <Text style={styles.submitText}>लॉग इन · Log in</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.demoTitle}>डेमो लॉग इन · Demo logins</Text>
          <Text style={styles.muted}>
            Three people, three dashboards. Sample accounts for trying the app.
          </Text>

          {demoAccounts.map((a) => (
            <View key={a.role} style={styles.account}>
              <View style={styles.accountTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountWho}>{a.labelLocal}</Text>
                  <Text style={styles.muted}>
                    {a.label} · {a.name}
                  </Text>
                </View>
                <Pressable
                  style={styles.fill}
                  accessibilityRole="button"
                  onPress={() => {
                    setId(a.id);
                    setPassword(a.password);
                    setError('');
                  }}>
                  <Text style={styles.fillText}>भरें · Fill in</Text>
                </Pressable>
              </View>
              <Text style={styles.cred}>
                ID: <Text style={styles.credValue}>{a.id}</Text>
              </Text>
              <Text style={styles.cred}>
                Password: <Text style={styles.credValue}>{a.password}</Text>
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { padding: size.screenGutter, gap: 16 },
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
