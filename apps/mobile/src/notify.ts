import * as Notifications from 'expo-notifications';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications (phones). Two Android channels:
 * - alarm: red alerts; max importance, alarm audio usage so it rings on silent
 * - reminders: feeding, KMC, danger check, charging, visits (fire offline)
 * The browser build uses notify.web.ts (no notifications).
 */

let ready = false;

export async function setupNotifications() {
  if (ready) return;
  ready = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alarm', {
      name: 'Red alerts',
      importance: AndroidImportance.MAX,
      sound: 'alarm.wav',
      bypassDnd: true,
      enableVibrate: true,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: AndroidAudioUsage.ALARM,
        contentType: AndroidAudioContentType.SONIFICATION,
      },
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'chime.wav',
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Ring now on the alarm channel (red alert). */
export async function alarmNow(title: string, body: string) {
  await setupNotifications();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'alarm.wav', priority: Notifications.AndroidNotificationPriority.MAX },
    trigger: Platform.OS === 'android' ? { channelId: 'alarm' } : null,
  });
}

export interface ReminderNote {
  title: string;
  body: string;
  /** when, ms; or daily at hour:minute */
  at?: number;
  daily?: { hour: number; minute: number };
}

/** Replaces every scheduled reminder with this list. */
export async function scheduleReminders(notes: ReminderNote[]) {
  await setupNotifications();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of notes) {
    const content = { title: n.title, body: n.body, sound: 'chime.wav' };
    if (n.daily) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: n.daily.hour,
          minute: n.daily.minute,
          channelId: 'reminders',
        },
      });
    } else if (n.at && n.at > Date.now() + 5_000) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at), channelId: 'reminders' },
      });
    }
  }
}

export const notificationsSupported = true;

/** A reminder right now (e.g. "charge the band" when the battery drops below 20%). */
export async function notifyNow(title: string, body: string) {
  await setupNotifications();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'chime.wav' },
    trigger: Platform.OS === 'android' ? { channelId: 'reminders' } : null,
  });
}
