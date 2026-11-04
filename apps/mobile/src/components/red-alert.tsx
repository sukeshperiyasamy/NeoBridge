import * as SMS from 'expo-sms';
import { useEffect } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t, type Key } from '@neobridge/i18n';
import { color, status as statusColor } from '@neobridge/tokens';

import { getBandController } from '@/ble/band-controller';
import { CallButton } from '@/components/call-button';
import { Button, useT } from '@/components/ui';
import { fontFamily } from '@/constants/fonts';
import { useSettings } from '@/language';
import { useHousehold } from '@/mother/household';
import { say, startAlarm, stopAlarm } from '@/sound';

/** Opens the SMS app with the message already written (PRD: SMS fallback from the mother's phone). */
export async function sendRedSms(phone: string | null, body: string) {
  if (!phone) return;
  if (Platform.OS !== 'web' && (await SMS.isAvailableAsync())) {
    await SMS.sendSMSAsync([phone], body);
    return;
  }
  await Linking.openURL(`sms:${phone}?body=${encodeURIComponent(body)}`).catch(() => undefined);
}

export function useRedSmsBody(trigger: string): string {
  const { lang } = useT();
  const { mother, baby } = useHousehold();
  return t(lang, 'home.smsBody', {
    baby: baby?.name ?? '',
    reason: t(lang, `red.reason.${trigger}` as Key),
    mother: mother?.name ?? '',
  });
}

/**
 * Red, before anyone has acknowledged it: fills the screen, plays a loud
 * looping tone, vibrates, and cannot be dismissed. The tabs are hidden until
 * "I have seen it" (PRD Mother app, Key behaviours).
 */
export function RedAlertScreen({ trigger }: { trigger: string }) {
  const { t, bi, lang } = useT();
  const [settings] = useSettings();
  const { phones } = useHousehold();
  const smsBody = useRedSmsBody(trigger);

  useEffect(() => {
    void startAlarm();
    if (settings.voice) setTimeout(() => say(t('red.title'), lang), 1500);
    return () => stopAlarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = bi('red.title');
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={styles.mark} />
        <Text style={styles.title}>{title.text}</Text>
        {title.gloss && <Text style={styles.gloss}>{title.gloss}</Text>}
        <Text style={styles.reason}>{t(`red.reason.${trigger}` as Key)}</Text>
        <Text style={styles.sub}>{t('red.sub')}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          kind="secondary"
          label={bi('red.ack')}
          onPress={() => {
            stopAlarm();
            void getBandController().acknowledgeRed();
          }}
          style={styles.ack}
        />
        {phones.asha && <CallButton label={bi('red.callAsha', { name: phones.ashaName })} phone={phones.asha} />}
        <CallButton label={bi('red.call102')} phone={phones.transport} tone="danger" />
        <Button kind="secondary" label={t('home.sms')} onPress={() => void sendRedSms(phones.asha, smsBody)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: statusColor.red.fill, paddingHorizontal: 16, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: 6, paddingTop: 32 },
  mark: { width: 72, height: 72, borderRadius: 20, backgroundColor: color.surface, marginBottom: 12 },
  title: { fontFamily: fontFamily.headingHeavy, fontSize: 34, lineHeight: 46, color: color.surface, textAlign: 'center' },
  gloss: { fontFamily: fontFamily.body, fontSize: 15, color: color.surface, textAlign: 'center' },
  reason: { fontFamily: fontFamily.bodyBold, fontSize: 20, color: color.surface, marginTop: 8 },
  sub: { fontFamily: fontFamily.bodySemiBold, fontSize: 18, color: color.surface, textAlign: 'center', marginTop: 8 },
  actions: { gap: 12, paddingBottom: 16 },
  ack: { backgroundColor: color.surface, minHeight: 72, borderColor: color.surface },
});
