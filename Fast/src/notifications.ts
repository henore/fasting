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
  lastMealTimestamp: number,
  goalHours: number,
  goalAlertEnabled: boolean,
  goalStrong: boolean,
  reminders: [ReminderSpec, ReminderSpec, ReminderSpec],
  isPro: boolean,
  soundUri?: string,
): Promise<void> {
  const permission = await notifee.requestPermission();
  if (permission.authorizationStatus < 1) return;

  for (const id of ALL_IDS) {
    await notifee.cancelNotification(id);
  }

  const goalTime = lastMealTimestamp + goalHours * 3600000;

  if (goalAlertEnabled && goalTime > Date.now()) {
    const goalH = goalHours % 1 === 0
      ? `${goalHours}h`
      : `${Math.floor(goalHours)}h${Math.round((goalHours % 1) * 60)}m`;
    await scheduleNotification(
      NOTIF_ID_GOAL,
      goalTime,
      'Goal reached!',
      `${goalH} fasting goal reached.`,
      isPro && goalStrong,
      soundUri,
    );
  }

  if (isPro) {
    const ids = [NOTIF_ID_REMINDER_1, NOTIF_ID_REMINDER_2, NOTIF_ID_REMINDER_3];
    for (let i = 0; i < 3; i++) {
      const r = reminders[i];
      if (!r.enabled || r.offsetMinutes <= 0) continue;
      const fireDate = goalTime - r.offsetMinutes * 60000;
      if (fireDate <= Date.now()) continue;
      const oh = Math.floor(r.offsetMinutes / 60);
      const om = r.offsetMinutes % 60;
      const offsetStr = oh > 0
        ? om > 0 ? `${oh}h ${om}m` : `${oh}h`
        : `${om}m`;
      await scheduleNotification(
        ids[i],
        fireDate,
        'Fasting reminder',
        `${offsetStr} until fasting goal.`,
        r.strong,
        soundUri,
      );
    }
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
