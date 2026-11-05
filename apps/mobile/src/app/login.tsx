import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { demoLogins, demoPasswordLogins } from '@neobridge/demo';
import { pick } from '@neobridge/i18n';
import { color, radius } from '@neobridge/tokens';

import { ApiError } from '@/api/client';
import { LanguageSwitch } from '@/components/language-switch';
import { Body, Button, Card, Choice, Field, H1, Line, Muted, Screen, Strong, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { useSession } from '@/session';

/**
 * C3 phone, C4 code (resend after 30 s, wrong-code message), C5 not registered.
 * DEMO ONLY: a user ID + password mode for the seeded accounts, kept until the
 * full integration is done (API: DEMO_LOGIN).
 */
export default function LoginScreen() {
  const { startOtp, verifyOtp, signInWithPassword } = useSession();
  const { t, bi, lang } = useT();
  const [mode, setMode] = useState<'password' | 'phone'>('password');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'notRegistered'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [demoCode, setDemoCode] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const titleKey = step === 'phone' && mode === 'password' ? 'login.title' : 'otp.title';
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function send() {
    setError(null);
    if (!/^[6-9]\d{9}$/.test(digits)) return setError(t('otp.invalidPhone'));
    setBusy(true);
    try {
      const res = await startOtp(digits);
      setResendAt(Date.now() + res.resendInSeconds * 1000);
      setDemoCode(res.demoCode ?? null);
      setCode('');
      setStep('code');
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'not_registered') setStep('notRegistered');
      else if (err.code === 'wait') {
        setStep('code');
        setResendAt(Date.now() + Number(err.body.retryInSeconds ?? 30) * 1000);
      } else setError(err.offline ? t('otp.offline') : t('otp.invalidPhone'));
    } finally {
      setBusy(false);
    }
  }

  async function passwordLogin() {
    setError(null);
    if (!userId.trim() || !password) return setError(t('login.error'));
    setBusy(true);
    try {
      await signInWithPassword(userId.trim(), password);
      router.replace('/');
    } catch (e) {
      setError((e as ApiError).offline ? t('otp.offline') : t('login.error'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError(t('otp.wrong'));
    setBusy(true);
    try {
      await verifyOtp(digits, code);
      router.replace('/');
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.offline
          ? t('otp.offline')
          : err.code === 'expired'
            ? t('otp.expired')
            : err.code === 'too_many_attempts'
              ? t('otp.tooMany')
              : t('otp.wrong'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Image
          source={require('@/assets/images/neobridge-logo.png')}
          style={{ height: 44, width: (44 * 1261) / 355 }}
          contentFit="contain"
          accessibilityLabel="NeoBridge"
        />
        <LanguageSwitch />
      </View>

      <Card>
        <H1>{t(titleKey)}</H1>
        {lang !== 'en' && <Muted>{bi(titleKey).gloss}</Muted>}

        {step === 'phone' && (
          <Choice
            options={[
              { value: 'password', label: t('otp.usePassword') },
              { value: 'phone', label: t('otp.usePhone') },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
          />
        )}

        {step === 'phone' && mode === 'password' && (
          <>
            <Field label={t('login.id')} value={userId} onChangeText={setUserId} placeholder="asha.demo" />
            <Field label={t('login.password')} value={password} onChangeText={setPassword} secure error={error} />
            <Button label={bi('login.submit')} onPress={passwordLogin} busy={busy} />
            <Muted>{t('otp.passwordNote')}</Muted>
          </>
        )}

        {step === 'phone' && mode === 'phone' && (
          <>
            <Field
              label={t('otp.phone')}
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^\d+ ]/g, ''))}
              keyboardType="phone-pad"
              placeholder="98765 43210"
              hint={t('otp.phoneHint')}
              error={error}
              maxLength={16}
            />
            <Button label={bi('otp.send')} onPress={send} busy={busy} />
          </>
        )}

        {step === 'code' && (
          <>
            <Body>{t('otp.codeSent', { phone: digits })}</Body>
            {demoCode && (
              <View style={styles.demo}>
                <Strong>{t('otp.demoCode', { code: demoCode })}</Strong>
              </View>
            )}
            <Field
              label={t('otp.code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              error={error}
              maxLength={6}
              autoFocus
            />
            <Button label={bi('otp.verify')} onPress={verify} busy={busy} />
            <Button
              kind="secondary"
              label={wait > 0 ? t('otp.resendIn', { s: wait }) : t('otp.resend')}
              disabled={wait > 0 || busy}
              onPress={send}
            />
            <Button kind="secondary" label={t('otp.changeNumber')} onPress={() => setStep('phone')} />
          </>
        )}

        {step === 'notRegistered' && (
          <>
            <Strong style={{ color: '#a82820' }}>{t('notRegistered.title')}</Strong>
            <Line value={bi('notRegistered.family')} />
            <Line value={bi('notRegistered.staff')} />
            <Button kind="secondary" label={t('otp.changeNumber')} onPress={() => setStep('phone')} />
          </>
        )}
      </Card>

      {step === 'phone' && mode === 'password' && (
        <Card>
          <Text style={styles.section}>{t('login.demoTitle')}</Text>
          <Muted>{t('otp.demoPasswordSub')}</Muted>
          {demoPasswordLogins.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              onPress={() => {
                setUserId(d.id);
                setPassword(d.password);
                setError(null);
              }}
              style={({ pressed }) => [styles.demoRow, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1 }}>
                <Strong>{pick(lang, d.name)}</Strong>
                <Muted>{pick(lang, d.role)}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.phone}>{d.id}</Text>
                <Muted>{d.password}</Muted>
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {step === 'phone' && mode === 'phone' && (
        <Card>
          <Text style={styles.section}>{t('otp.demoNumbers')}</Text>
          <Muted>{t('otp.demoSub')}</Muted>
          {demoLogins.map((d) => (
            <Pressable
              key={d.phone}
              accessibilityRole="button"
              onPress={() => {
                setPhone(d.phone);
                setError(null);
              }}
              style={({ pressed }) => [styles.demoRow, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1 }}>
                <Strong>{pick(lang, d.name)}</Strong>
                <Muted>{pick(lang, d.role)}</Muted>
              </View>
              <Text style={styles.phone}>{d.phone}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  section: { fontFamily: fontFamily.heading, fontSize: 20, color: color.text },
  demo: { backgroundColor: color.actionSoft, borderRadius: radius.tile, padding: 12 },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.tile,
    backgroundColor: color.background,
  },
  phone: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.action },
});
