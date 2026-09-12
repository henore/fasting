import notifee, {
  TriggerType,
  TimestampTrigger,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';

const CHANNEL_ID = 'fasting';
const STRONG_CHANNEL_ID = 'fasting-strong-alert';
export const NOTIF_ID_GOAL = 'goal-alert';
export const NOTIF_ID_REMINDER_1 = 'custom-reminder-1';
export const NOTIF_ID_REMINDER_2 = 'custom-reminder-2';
export const NOTIF_ID_REMINDER_3 = 'custom-reminder-3';

const ALL_IDS = [NOTIF_ID_GOAL, NOTIF_ID_REMINDER_1, NOTIF_ID_REMINDER_2, NOTIF_ID_REMINDER_3];

async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Fast Notifications',
    importance: AndroidImportance.HIGH,
  });
}

async function ensureStrongChannel(soundUri?: string): Promise<string> {
  const channelId = soundUri
    ? `${STRONG_CHANNEL_ID}-${hashCode(soundUri)}`
    : STRONG_CHANNEL_ID;

  await notifee.createChannel({
    id: channelId,
    name: 'Fast Strong Alerts',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    vibration: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    sound: soundUri || 'default',
  });

  return channelId;
}

function hashCode(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function scheduleNotification(
  id: string,
  fireDate: number,
  title: string,
  body: string,
  useStrong: boolean,
  soundUri?: string,
): Promise<void> {
  if (fireDate <= Date.now()) return;

  let channelId: string;
  if (useStrong) {
    channelId = await ensureStrongChannel(soundUri);
  } else {
    await ensureChannel();
    channelId = CHANNEL_ID;
  }

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: fireDate,
    alarmManager: {allowWhileIdle: true},
  };

  await notifee.createTriggerNotification(
    {
      id,
      title,
      body,
      android: useStrong
        ? {
            channelId,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            fullScreenAction: {id: 'default'},
            autoCancel: true,
          }
        : {channelId},
    },
    trigger,
  );
}

export type ReminderSpec = {
  enabled: boolean;
  offsetMinutes: number;
  strong: boolean;
};

export async function rescheduleAll(
  _lastMealTimestamp: number,
  _goalHours: number,
  _goalAlertEnabled: boolean,
  _goalStrong: boolean,
  _reminders: [ReminderSpec, ReminderSpec, ReminderSpec],
  _isPro: boolean,
  _soundUri?: string,
): Promise<void> {
  await notifee.requestPermission();
  for (const id of ALL_IDS) {
    await notifee.cancelNotification(id);
  }
}

export async function cancelAll(): Promise<void> {
  for (const id of ALL_IDS) {
    await notifee.cancelNotification(id);
  }
}

export async function cancelAllDisplayed(): Promise<void> {
  const displayed = await notifee.getDisplayedNotifications();
  for (const n of displayed) {
    if (n.id) {
      await notifee.cancelDisplayedNotification(n.id);
    }
  }
}
