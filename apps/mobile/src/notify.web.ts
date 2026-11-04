// Browser preview: no local notifications. Alerts still show in the app.
export interface ReminderNote {
  title: string;
  body: string;
  at?: number;
  daily?: { hour: number; minute: number };
}

export async function setupNotifications() {}
export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}
export async function alarmNow(_title: string, _body: string) {}
export async function scheduleReminders(_notes: ReminderNote[]) {}
export const notificationsSupported = false;
export async function notifyNow(_title: string, _body: string) {}
