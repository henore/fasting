import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LAST_MEAL: 'last_meal_timestamp',
  BEST_FAST_MINUTES: 'best_fast_minutes',
  GOAL_HOURS: 'goal_hours',
  COMPLETED_FASTS: 'completed_fasts',
  HISTORY: 'fast_history',
  GOAL_ALERT_ENABLED: 'notif_fast_completed',
  PRO_EXPIRES_AT: 'pro_expires_at',
  PRO_PERMANENT: 'pro_permanent',
  GOAL_STRONG: 'goal_strong',
  REMINDER_1_ENABLED: 'reminder_1_enabled',
  REMINDER_1_OFFSET: 'reminder_1_offset',
  REMINDER_1_STRONG: 'reminder_1_strong',
  REMINDER_2_ENABLED: 'reminder_2_enabled',
  REMINDER_2_OFFSET: 'reminder_2_offset',
  REMINDER_2_STRONG: 'reminder_2_strong',
  REMINDER_3_ENABLED: 'reminder_3_enabled',
  REMINDER_3_OFFSET: 'reminder_3_offset',
  REMINDER_3_STRONG: 'reminder_3_strong',
  STRONG_ALERT_SOUND_URI: 'strong_alert_sound_uri',
  STRONG_ALERT_SOUND_NAME: 'strong_alert_sound_name',
} as const;

export async function getLastMealTimestamp(): Promise<number | null> {
  const val = await AsyncStorage.getItem(KEYS.LAST_MEAL);
  return val ? Number(val) : null;
}

export async function setLastMealTimestamp(ts: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_MEAL, String(ts));
}

export async function getBestFastMinutes(): Promise<number> {
  const val = await AsyncStorage.getItem(KEYS.BEST_FAST_MINUTES);
  return val ? Number(val) : 0;
}

export async function setBestFastMinutes(minutes: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.BEST_FAST_MINUTES, String(minutes));
}

export async function getGoalHours(): Promise<number> {
  const val = await AsyncStorage.getItem(KEYS.GOAL_HOURS);
  return val ? Number(val) : 16;
}

export async function setGoalHours(hours: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.GOAL_HOURS, String(hours));
}

export async function getCompletedFasts(): Promise<number> {
  const val = await AsyncStorage.getItem(KEYS.COMPLETED_FASTS);
  return val ? Number(val) : 0;
}

export async function setCompletedFasts(count: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.COMPLETED_FASTS, String(count));
}

export type FastRecord = {
  startTimestampUtc: number;
  endTimestampUtc: number;
  durationMinutes: number;
  mealNote?: string;
  mealPhotoUri?: string;
};

export async function getHistory(): Promise<FastRecord[]> {
  const val = await AsyncStorage.getItem(KEYS.HISTORY);
  return val ? JSON.parse(val) : [];
}

export async function addFastRecord(record: FastRecord): Promise<void> {
  const history = await getHistory();
  history.unshift(record);
  if (history.length > 50) {
    history.length = 50;
  }
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
}

export async function updateFastRecord(
  index: number,
  record: FastRecord,
): Promise<void> {
  const history = await getHistory();
  if (index >= 0 && index < history.length) {
    history[index] = record;
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
  }
}

export async function deleteFastRecord(index: number): Promise<void> {
  const history = await getHistory();
  if (index >= 0 && index < history.length) {
    history.splice(index, 1);
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
  }
}

export async function getProExpiresAt(): Promise<number> {
  const val = await AsyncStorage.getItem(KEYS.PRO_EXPIRES_AT);
  return val ? Number(val) : 0;
}

export async function startProTrial(): Promise<number> {
  const existing = await AsyncStorage.getItem(KEYS.PRO_EXPIRES_AT);
  if (existing && Number(existing) > 0) {
    return Number(existing);
  }
  const expires = Date.now() + 48 * 60 * 60 * 1000;
  await AsyncStorage.setItem(KEYS.PRO_EXPIRES_AT, String(expires));
  return expires;
}

export async function getProPermanent(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.PRO_PERMANENT);
  return val === 'true';
}

export async function setProPermanent(): Promise<void> {
  await AsyncStorage.setItem(KEYS.PRO_PERMANENT, 'true');
}

// Goal Alert
export async function getGoalAlertEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.GOAL_ALERT_ENABLED);
  return val === null ? true : val === 'true';
}

export async function setGoalAlertEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.GOAL_ALERT_ENABLED, String(enabled));
}

export async function getGoalStrong(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.GOAL_STRONG);
  return val === 'true';
}

export async function setGoalStrong(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.GOAL_STRONG, String(enabled));
}

// Reminder config
export type ReminderConfig = {
  enabled: boolean;
  offsetMinutes: number;
  strong: boolean;
};

const REMINDER_KEYS = [
  {e: KEYS.REMINDER_1_ENABLED, o: KEYS.REMINDER_1_OFFSET, s: KEYS.REMINDER_1_STRONG},
  {e: KEYS.REMINDER_2_ENABLED, o: KEYS.REMINDER_2_OFFSET, s: KEYS.REMINDER_2_STRONG},
  {e: KEYS.REMINDER_3_ENABLED, o: KEYS.REMINDER_3_OFFSET, s: KEYS.REMINDER_3_STRONG},
] as const;

export async function getReminderConfig(n: 1 | 2 | 3): Promise<ReminderConfig> {
  const k = REMINDER_KEYS[n - 1];
  const [e, o, s] = await Promise.all([
    AsyncStorage.getItem(k.e),
    AsyncStorage.getItem(k.o),
    AsyncStorage.getItem(k.s),
  ]);
  return {
    enabled: e === 'true',
    offsetMinutes: o ? Number(o) : 0,
    strong: s === 'true',
  };
}

export async function setReminderConfig(n: 1 | 2 | 3, config: ReminderConfig): Promise<void> {
  const k = REMINDER_KEYS[n - 1];
  await Promise.all([
    AsyncStorage.setItem(k.e, String(config.enabled)),
    AsyncStorage.setItem(k.o, String(config.offsetMinutes)),
    AsyncStorage.setItem(k.s, String(config.strong)),
  ]);
}

// Strong Alert Sound (shared)
export async function getStrongAlertSound(): Promise<{uri: string; name: string} | null> {
  const uri = await AsyncStorage.getItem(KEYS.STRONG_ALERT_SOUND_URI);
  const name = await AsyncStorage.getItem(KEYS.STRONG_ALERT_SOUND_NAME);
  if (uri && name) {
    return {uri, name};
  }
  return null;
}

export async function setStrongAlertSound(uri: string, name: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.STRONG_ALERT_SOUND_URI, uri);
  await AsyncStorage.setItem(KEYS.STRONG_ALERT_SOUND_NAME, name);
}

export async function getOverlaySeen(tab: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(`overlay_seen_${tab}`);
  return val === 'true';
}

export async function setOverlaySeen(tab: string): Promise<void> {
  await AsyncStorage.setItem(`overlay_seen_${tab}`, 'true');
}
