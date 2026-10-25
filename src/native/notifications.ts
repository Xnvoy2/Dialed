import * as Notifications from 'expo-notifications';

const SESSION_END_ID = 'lockin-session-end';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<NotificationPermission> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/** Content is generic on purpose: task titles never appear on the lock screen. */
export async function scheduleSessionEnd(atMs: number, kind: 'focus' | 'break'): Promise<void> {
  await cancelSessionEnd();
  if ((await notificationPermission()) !== 'granted') return;
  const seconds = Math.max(1, Math.round((atMs - Date.now()) / 1000));
  await Notifications.scheduleNotificationAsync({
    identifier: SESSION_END_ID,
    content: {
      title: kind === 'focus' ? 'Focus session complete' : 'Break’s over',
      body: kind === 'focus' ? 'Nice work. Take a break if you want one.' : 'Start again whenever you’re ready.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}

export async function cancelSessionEnd(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(SESSION_END_ID);
  } catch {
    // nothing scheduled
  }
}
