import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  Alert,
  ScrollView,
  Switch,
  Animated,
  Easing,
  Modal,
  TextInput,
  Image,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type AppStateStatus,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {
  getLastMealTimestamp,
  setLastMealTimestamp,
  getBestFastMinutes,
  setBestFastMinutes,
  getGoalHours,
  setGoalHours,
  getCompletedFasts,
  setCompletedFasts,
  getHistory,
  addFastRecord,
  updateFastRecord,
  deleteFastRecord,
  type FastRecord,
  getGoalAlertEnabled,
  setGoalAlertEnabled,
  getGoalStrong,
  setGoalStrong,
  getReminderConfig,
  setReminderConfig,
  type ReminderConfig,
  getProExpiresAt,
  startProTrial,
  getProPermanent,
  setProPermanent,
  getStrongAlertSound,
  setStrongAlertSound,
  getOverlaySeen,
  setOverlaySeen,
} from './storage';
import {
  rescheduleAll,
  cancelAllDisplayed,
} from './notifications';

const {RingtonePicker, WidgetDataModule} = NativeModules;
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import {initIAP, endIAP, buyPro, listenToPurchases} from './purchase';
import {styles} from './styles';

const PHASES = [
  {hours: 12, label: 'Glycogen Depletion'},
  {hours: 16, label: 'Fat Burning'},
  {hours: 20, label: 'Ketosis'},
  {hours: 24, label: 'Autophagy'},
] as const;

type Tab = 'timer' | 'history' | 'stats' | 'settings';

const GOAL_OPTIONS = [12, 14, 16, 18, 20, 24];

function formatTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} m`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function parseTimestamp(str: string): number | null {
  const m = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/);
  if (!m) {
    return null;
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
  return isNaN(d.getTime()) ? null : d.getTime();
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${h}h`;
}

function getCurrentPhase(ms: number): string {
  const hours = ms / 3600000;
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (hours >= PHASES[i].hours) {
      return PHASES[i].label;
    }
  }
  return 'FASTING';
}

function getCurrentPhaseIndex(ms: number): number {
  const hours = ms / 3600000;
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (hours >= PHASES[i].hours) {
      return i;
    }
  }
  return -1;
}

function PulsingPhase({text}: {text: string}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.phase, {opacity}]}>{text}</Animated.Text>
  );
}

export default function TimerScreen() {
  const [lastMeal, setLastMeal] = useState<number | null>(null);
  const [bestMinutes, setBestMinutes] = useState(0);
  const [goalHours, setGoalHoursState] = useState(16);
  const [completedFasts, setCompletedFastsState] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('timer');
  const [history, setHistory] = useState<FastRecord[]>([]);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [proExpiresAt, setProExpiresAt] = useState(0);
  const [proPermanent, setProPermanentState] = useState(false);
  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [congratsMessage, setCongratsMessage] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState<Record<Tab, boolean>>({timer: false, history: false, stats: false, settings: false});
  const [customGoalHH, setCustomGoalHH] = useState('');
  const [customGoalMM, setCustomGoalMM] = useState('');
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editStartStr, setEditStartStr] = useState('');
  const [editEndStr, setEditEndStr] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [mealPhotoUri, setMealPhotoUri] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showProExpired, setShowProExpired] = useState(false);
  const [goalAlertEnabled, setGoalAlertEnabledState] = useState(true);
  const [goalStrong, setGoalStrongState] = useState(false);
  const [rem1, setRem1] = useState<ReminderConfig>({enabled: false, offsetMinutes: 0, strong: false});
  const [rem2, setRem2] = useState<ReminderConfig>({enabled: false, offsetMinutes: 0, strong: false});
  const [rem3, setRem3] = useState<ReminderConfig>({enabled: false, offsetMinutes: 0, strong: false});
  const [rem1HH, setRem1HH] = useState('');
  const [rem1MM, setRem1MM] = useState('');
  const [rem2HH, setRem2HH] = useState('');
  const [rem2MM, setRem2MM] = useState('');
  const [rem3HH, setRem3HH] = useState('');
  const [rem3MM, setRem3MM] = useState('');
  const [strongSoundUri, setStrongSoundUri] = useState<string | null>(null);
  const [strongSoundName, setStrongSoundName] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const [meal, best, goal, completed, gaEnabled, proExp, proPerm, r1, r2, r3, gaStrong, sound] =
        await Promise.all([
          getLastMealTimestamp(),
          getBestFastMinutes(),
          getGoalHours(),
          getCompletedFasts(),
          getGoalAlertEnabled(),
          getProExpiresAt(),
          getProPermanent(),
          getReminderConfig(1),
          getReminderConfig(2),
          getReminderConfig(3),
          getGoalStrong(),
          getStrongAlertSound(),
        ]);
      if (meal !== null) {
        setLastMeal(meal);
        WidgetDataModule.update(meal, goal);
      } else {
        const ts = Date.now();
        await setLastMealTimestamp(ts);
        setLastMeal(ts);
        WidgetDataModule.update(ts, goal);
      }
      setBestMinutes(best);
      setGoalHoursState(goal);
      setCompletedFastsState(completed);
      setGoalAlertEnabledState(gaEnabled);
      setProExpiresAt(proExp);
      setProPermanentState(proPerm);
      setRem1(r1);
      setRem2(r2);
      setRem3(r3);
      setGoalStrongState(gaStrong);
      if (sound) {
        setStrongSoundUri(sound.uri);
        setStrongSoundName(sound.name);
      }
      if (![12, 14, 16, 18, 20, 24].includes(goal)) {
        setCustomGoalHH(String(Math.floor(goal)));
        setCustomGoalMM(String(Math.round((goal % 1) * 60)).padStart(2, '0'));
      }
      const hhMM = (cfg: ReminderConfig, setHH: (v: string) => void, setMM: (v: string) => void) => {
        if (cfg.enabled && cfg.offsetMinutes > 0) {
          setHH(String(Math.floor(cfg.offsetMinutes / 60)));
          setMM(String(cfg.offsetMinutes % 60).padStart(2, '0'));
        }
      };
      hhMM(r1, setRem1HH, setRem1MM);
      hhMM(r2, setRem2HH, setRem2MM);
      hhMM(r3, setRem3HH, setRem3MM);
      setLoaded(true);

      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }

      if (Platform.OS === 'android' && Platform.Version >= 34) {
        try {
          const canFSI = await WidgetDataModule.canUseFullScreenIntent();
          if (!canFSI) {
            Alert.alert(
              'Full Screen Alarm',
              'To show alarms when the screen is off, please enable "Full screen notifications" for this app.',
              [
                {text: 'Later', style: 'cancel'},
                {text: 'Open Settings', onPress: () => WidgetDataModule.openFullScreenIntentSettings()},
              ],
            );
          }
        } catch {}
      }

      const timerSeen = await getOverlaySeen('timer');
      if (!timerSeen) {
        setOverlayVisible(prev => ({...prev, timer: true}));
      }

      try {
        await initIAP();
        listenToPurchases(async () => {
          await setProPermanent();
          setProPermanentState(true);
        });
      } catch {}
    })();
    return () => {
      endIAP();
    };
  }, []);

  useEffect(() => {
    if (!loaded || lastMeal === null) return;
    const isPro = proPermanent || proExpiresAt > Date.now();
    rescheduleAll(lastMeal, goalHours, goalAlertEnabled, goalStrong, [rem1, rem2, rem3], isPro, strongSoundUri ?? undefined);
    WidgetDataModule.updateNotifConfig(
      goalAlertEnabled,
      goalStrong,
      rem1.enabled, rem1.offsetMinutes, rem1.strong,
      rem2.enabled, rem2.offsetMinutes, rem2.strong,
      rem3.enabled, rem3.offsetMinutes, rem3.strong,
      strongSoundUri,
    );
  }, [loaded, lastMeal, goalHours, goalAlertEnabled, goalStrong, rem1, rem2, rem3, proPermanent, proExpiresAt, strongSoundUri]);

  useEffect(() => {
    if (!loaded || proPermanent) return;
    if (proExpiresAt > 0 && proExpiresAt <= Date.now()) {
      setShowProExpired(true);
    }
  }, [loaded, proPermanent, proExpiresAt]);

  useEffect(() => {
    if (mealModalVisible || editModalVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    setNow(Date.now());
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [mealModalVisible, editModalVisible]);

  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        setNow(Date.now());
        cancelAllDisplayed();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  const loadHistory = useCallback(async () => {
    const h = await getHistory();
    setHistory(h);
  }, []);

  useEffect(() => {
    if (tab === 'history' || tab === 'stats') {
      loadHistory();
    }
    setSelectedHistoryIdx(null);
    (async () => {
      const seen = await getOverlaySeen(tab);
      if (!seen) {
        setOverlayVisible(prev => ({...prev, [tab]: true}));
      }
    })();
  }, [tab, loadHistory]);

  const handleLogMealOpen = useCallback(() => {
    setMealNote('');
    setMealPhotoUri(null);
    setMealModalVisible(true);
  }, []);

  const handleLogMealConfirm = useCallback(async () => {
    setMealModalVisible(false);
    const endTs = Date.now();

    if (proExpiresAt === 0 && !proPermanent) {
      const trialExpires = await startProTrial();
      setProExpiresAt(trialExpires);
    }

    if (lastMeal !== null) {
      const durationMinutes = Math.floor((endTs - lastMeal) / 60000);
      let congrats: string | null = null;

      if (durationMinutes >= goalHours * 60) {
        const newCount = completedFasts + 1;
        setCompletedFastsState(newCount);
        await setCompletedFasts(newCount);
        congrats = 'Goal reached!';
      }

      if (durationMinutes > bestMinutes) {
        setBestMinutes(durationMinutes);
        await setBestFastMinutes(durationMinutes);
        congrats = congrats ? 'New best & goal reached!' : 'New personal best!';
      }

      if (congrats) {
        setCongratsMessage(congrats);
        setTimeout(() => setCongratsMessage(null), 4000);
      }

      const record: FastRecord = {
        startTimestampUtc: lastMeal,
        endTimestampUtc: endTs,
        durationMinutes,
      };
      if ((proPermanent || proExpiresAt > Date.now()) && mealNote.trim()) {
        record.mealNote = mealNote.trim();
      }
      if ((proPermanent || proExpiresAt > Date.now()) && mealPhotoUri) {
        record.mealPhotoUri = mealPhotoUri;
      }
      await addFastRecord(record);
    }

    await setLastMealTimestamp(endTs);
    setLastMeal(endTs);
    setNow(Date.now());
    WidgetDataModule.update(endTs, goalHours);
  }, [lastMeal, bestMinutes, goalHours, completedFasts, proExpiresAt, proPermanent, mealNote, mealPhotoUri]);

  const handlePickPhoto = useCallback(async () => {
    if (proExpiresAt <= Date.now()) {
      return;
    }
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.7});
    if (result.assets?.[0]?.uri) {
      setMealPhotoUri(result.assets[0].uri);
    }
  }, [proExpiresAt]);

  const handleGoalChange = useCallback(async (hours: number) => {
    setGoalHoursState(hours);
    await setGoalHours(hours);
    if (lastMeal !== null) WidgetDataModule.update(lastMeal, hours);
  }, [lastMeal]);

  const handleUnlockPro = useCallback(() => {
    Alert.alert('Upgrade to Pro', '$2.99 — Lifetime access to all Pro features.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Buy $2.99',
        onPress: () => {
          buyPro();
        },
      },
    ]);
  }, []);

  const validateGoalHHMM = (hh: string, mm: string): number | null => {
    const h = Number(hh) || 0;
    const m = Number(mm === '' ? '0' : mm);
    if (isNaN(m) || m > 59 || h < 12 || h > 99) return null;
    return h + m / 60;
  };

  const handleSetCustomGoal = useCallback(async () => {
    const total = validateGoalHHMM(customGoalHH, customGoalMM);
    if (total === null) {
      Alert.alert('Invalid', 'Goal must be at least 12 hours.');
      return;
    }
    setGoalHoursState(total);
    await setGoalHours(total);
    if (lastMeal !== null) WidgetDataModule.update(lastMeal, total);
  }, [customGoalHH, customGoalMM, lastMeal]);

  const handleClearCustomGoal = useCallback(async () => {
    setGoalHoursState(16);
    await setGoalHours(16);
    if (lastMeal !== null) WidgetDataModule.update(lastMeal, 16);
    setCustomGoalHH('');
    setCustomGoalMM('');
  }, [lastMeal]);

  const handleGoalAlertToggle = useCallback(async (val: boolean) => {
    setGoalAlertEnabledState(val);
    await setGoalAlertEnabled(val);
  }, []);

  const checkStrongPermission = useCallback(async (): Promise<boolean> => {
    const hasPermission = await RingtonePicker.hasExactAlarmPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission Required',
        'Strong Alerts need permission to schedule precise reminders.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Open Settings', onPress: () => RingtonePicker.openExactAlarmSettings()},
        ],
      );
      return false;
    }
    return true;
  }, []);

  const handleGoalStrongToggle = useCallback(async (val: boolean) => {
    if (val && !(await checkStrongPermission())) return;
    setGoalStrongState(val);
    await setGoalStrong(val);
  }, [checkStrongPermission]);

  const handleSetReminder = useCallback(async (n: 1 | 2 | 3, hh: string, mm: string) => {
    const h = Number(hh) || 0;
    const m = Number(mm === '' ? '0' : mm);
    if (isNaN(m) || m > 59 || h > 99) {
      Alert.alert('Invalid', 'Enter valid hours and minutes.');
      return;
    }
    const totalMinutes = h * 60 + m;
    if (totalMinutes === 0) {
      Alert.alert('Invalid', 'Set a time greater than 00h 00m.');
      return;
    }
    const goalMinutes = Math.floor(goalHours * 60);
    if (totalMinutes >= goalMinutes) {
      Alert.alert('Invalid', 'Reminder must be before the goal time.');
      return;
    }
    const rems = [rem1, rem2, rem3];
    const setters = [setRem1, setRem2, setRem3];
    const newConfig: ReminderConfig = {...rems[n - 1], offsetMinutes: totalMinutes, enabled: true};
    setters[n - 1](newConfig);
    await setReminderConfig(n, newConfig);
  }, [goalHours, rem1, rem2, rem3]);

  const handleClearReminder = useCallback(async (n: 1 | 2 | 3) => {
    const newConfig: ReminderConfig = {enabled: false, offsetMinutes: 0, strong: false};
    const setters = [setRem1, setRem2, setRem3];
    const hhSetters = [setRem1HH, setRem2HH, setRem3HH];
    const mmSetters = [setRem1MM, setRem2MM, setRem3MM];
    setters[n - 1](newConfig);
    hhSetters[n - 1]('');
    mmSetters[n - 1]('');
    await setReminderConfig(n, newConfig);
  }, []);

  const handleReminderStrongToggle = useCallback(async (n: 1 | 2 | 3, val: boolean) => {
    if (val && !(await checkStrongPermission())) return;
    const rems = [rem1, rem2, rem3];
    const setters = [setRem1, setRem2, setRem3];
    const newConfig: ReminderConfig = {...rems[n - 1], strong: val};
    setters[n - 1](newConfig);
    await setReminderConfig(n, newConfig);
  }, [rem1, rem2, rem3, checkStrongPermission]);

  const handlePickAlarmSound = useCallback(async () => {
    const result = await RingtonePicker.pickAlarmSound(strongSoundUri);
    if (result) {
      setStrongSoundUri(result.uri);
      setStrongSoundName(result.name);
      await setStrongAlertSound(result.uri, result.name);
    }
  }, [strongSoundUri]);

  const handleEditOpen = useCallback(
    (idx: number) => {
      const record = history[idx];
      if (!record) {
        return;
      }
      setEditStartStr(formatTimestamp(record.startTimestampUtc));
      setEditEndStr(formatTimestamp(record.endTimestampUtc));
      setEditModalVisible(true);
    },
    [history],
  );

  const handleEditConfirm = useCallback(async () => {
    if (selectedHistoryIdx === null) {
      return;
    }
    const startTs = parseTimestamp(editStartStr);
    const endTs = parseTimestamp(editEndStr);
    if (startTs === null || endTs === null) {
      Alert.alert('Error', 'Invalid format. Use YYYY/MM/DD HH:MM');
      return;
    }
    const nowTs = Date.now();
    if (startTs >= nowTs || endTs >= nowTs) {
      Alert.alert('Error', 'Cannot set time to the future.');
      return;
    }
    if (endTs <= startTs) {
      Alert.alert('Error', 'End time must be after start time.');
      return;
    }
    const original = history[selectedHistoryIdx];
    const durationMinutes = Math.floor((endTs - startTs) / 60000);
    await updateFastRecord(selectedHistoryIdx, {
      ...original,
      startTimestampUtc: startTs,
      endTimestampUtc: endTs,
      durationMinutes,
    });
    setEditModalVisible(false);
    setSelectedHistoryIdx(null);
    await loadHistory();
  }, [selectedHistoryIdx, editStartStr, editEndStr, history, loadHistory]);

  const handleDeleteRecord = useCallback(() => {
    if (selectedHistoryIdx === null) {
      return;
    }
    Alert.alert(
      'Delete Record',
      'This record will be permanently deleted. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteFastRecord(selectedHistoryIdx);
            setEditModalVisible(false);
            setSelectedHistoryIdx(null);
            await loadHistory();
          },
        },
      ],
    );
  }, [selectedHistoryIdx, loadHistory]);

  const OVERLAY_TEXT: Record<Tab, string[]> = {
    timer: [
      'Your fast has already started.',
      'Hold "Log Meal" when you eat.\nYour next fast starts automatically.',
    ],
    history: [
      'See your daily fasting history here.',
      'You can edit times if you forgot to log a meal.',
    ],
    stats: [
      'See your longest fast for each day.',
      'Tap a bar to view the details.',
    ],
    settings: [
      'Choose your fasting goal and notification settings here.',
    ],
  };

  const dismissOverlay = useCallback(async () => {
    await setOverlaySeen(tab);
    setOverlayVisible(prev => ({...prev, [tab]: false}));
  }, [tab]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>...</Text>
      </View>
    );
  }

  const elapsed = lastMeal !== null ? Math.max(0, now - lastMeal) : 0;
  const currentPhase = getCurrentPhase(elapsed);
  const isPro = proPermanent || proExpiresAt > now;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  const renderTimer = () => (
    <>
      {congratsMessage && (
        <Text style={styles.congratsText}>{congratsMessage}</Text>
      )}
      <View style={styles.topRow}>
        <View style={styles.topItem}>
          <Text style={styles.topLabel}>Goal</Text>
          <Text style={styles.topValue}>
            {goalHours % 1 === 0
              ? `${goalHours}h`
              : `${Math.floor(goalHours)}:${String(Math.round((goalHours % 1) * 60)).padStart(2, '0')}`}
          </Text>
        </View>
        <View style={styles.topItem}>
          <Text style={styles.topLabel}>Best</Text>
          <Text style={styles.topValue}>{formatHours(bestMinutes)}</Text>
        </View>
      </View>

      <View style={styles.timerSection}>
        {elapsed < 60000 ? (
          <PulsingPhase text="Started just now" />
        ) : (
          <>
            <View style={styles.timerRow}>
              <Text style={styles.timer}>{String(Math.floor(Math.floor(elapsed / 60000) / 60)).padStart(2, '0')}</Text>
              <Text style={styles.timerUnit}>h</Text>
              <Text style={styles.timer}>{String(Math.floor(elapsed / 60000) % 60).padStart(2, '0')}</Text>
              <Text style={styles.timerUnit}>m</Text>
            </View>
            <PulsingPhase text={currentPhase} />
          </>
        )}
      </View>

      <View style={styles.milestones}>
        {PHASES.map((p, i) => {
          const active = i === getCurrentPhaseIndex(elapsed);
          const reached = elapsed >= p.hours * 3600000;
          return (
            <View key={p.hours} style={styles.milestoneRow}>
              <Text
                style={[
                  styles.milestoneHours,
                  active && styles.milestoneActive,
                  reached && !active && styles.milestoneReached,
                ]}>
                {p.hours}h
              </Text>
              <Text
                style={[
                  styles.milestoneLabel,
                  active && styles.milestoneActive,
                  reached && !active && styles.milestoneReached,
                ]}>
                {p.label}
              </Text>
              {active && <Text style={styles.milestoneFireIcon}>🔥</Text>}
            </View>
          );
        })}
      </View>

      <Pressable
        onLongPress={handleLogMealOpen}
        delayLongPress={800}
        style={({pressed}) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}>
        <Text style={styles.buttonText}>Hold to log meal</Text>
      </Pressable>

      {proPermanent ? (
        <View style={styles.adLink}>
          <PulsingPhase text="Pro Active" />
        </View>
      ) : proExpiresAt > now ? (
        <View style={styles.adLink}>
          <PulsingPhase text="Pro Trial — 48 hours" />
        </View>
      ) : (
        <Pressable onPress={handleUnlockPro} style={styles.adLink}>
          <Text style={styles.adLinkText}>
            Upgrade to Pro — $2.99 Lifetime
          </Text>
        </Pressable>
      )}
    </>
  );

  const renderHistory = () => {
    const cutoff = now - SEVEN_DAYS;
    const visibleHistory = isPro
      ? history
      : history.filter(r => r.endTimestampUtc >= cutoff);
    const hiddenCount = history.length - visibleHistory.length;

    return (
      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={undefined}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Fasting History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No fasting history yet</Text>
        ) : (
          <>
            {visibleHistory.map((item, i) => {
              const date = new Date(item.endTimestampUtc);
              const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
              const reached = item.durationMinutes >= goalHours * 60;
              const originalIdx = isPro ? i : history.indexOf(item);
              const isSelected = selectedHistoryIdx === originalIdx;
              const rowContent = (
                <>
                  <View style={{flex: 1}}>
                    <Text
                      style={[
                        styles.historyDate,
                        !reached && styles.historyDim,
                      ]}>
                      {dateStr}
                    </Text>
                    <Text
                      style={[
                        styles.historyStatus,
                        reached
                          ? styles.historyReached
                          : styles.historyNotReached,
                      ]}>
                      {reached ? 'Goal Reached' : 'Not Reached'}
                    </Text>
                    {item.mealNote ? (
                      <Text style={styles.historyNote}>{item.mealNote}</Text>
                    ) : null}
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text
                      style={[
                        styles.historyDuration,
                        !reached && styles.historyDim,
                      ]}>
                      {formatTime(item.durationMinutes * 60000)}
                    </Text>
                    {item.mealPhotoUri ? (
                      <Image
                        source={{uri: item.mealPhotoUri}}
                        style={styles.historyPhoto}
                      />
                    ) : null}
                    {isSelected && (
                      <Pressable
                        onPress={() => handleEditOpen(originalIdx)}
                        style={styles.editButton}>
                        <Text style={styles.editButtonText}>Edit</Text>
                      </Pressable>
                    )}
                  </View>
                </>
              );
              return (
                <Pressable
                  key={i}
                  style={styles.historyRow}
                  onPress={() =>
                    setSelectedHistoryIdx(isSelected ? null : originalIdx)
                  }>
                  {rowContent}
                </Pressable>
              );
            })}
            {!isPro && hiddenCount > 0 && (
              <Pressable
                onPress={handleUnlockPro}
                style={styles.upgradeBlock}>
                <Text style={styles.upgradeText}>
                  +{hiddenCount} more — Upgrade to Pro
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  const renderStats = () => {
    const totalFasts = history.length;
    const goalMinutes = goalHours * 60;

    if (totalFasts === 0) {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <Text style={styles.emptyText}>No fasting stats yet</Text>
        </View>
      );
    }

    const completedCount = history.filter(
      r => r.durationMinutes >= goalMinutes,
    ).length;
    const avgMinutes = Math.floor(
      history.reduce((sum, r) => sum + r.durationMinutes, 0) / totalFasts,
    );
    const longestMinutes = Math.max(...history.map(r => r.durationMinutes));

    type DayEntry = {
      dateKey: string;
      rep: FastRecord;
      records: FastRecord[];
    };
    const dayMap = new Map<string, DayEntry>();
    for (const r of history) {
      const d = new Date(r.endTimestampUtc);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const entry = dayMap.get(key);
      if (entry) {
        entry.records.push(r);
        if (r.durationMinutes > entry.rep.durationMinutes) {
          entry.rep = r;
        }
      } else {
        dayMap.set(key, {dateKey: key, rep: r, records: [r]});
      }
    }
    const allDays = [...dayMap.values()].sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
    const days = isPro ? allDays : allDays.slice(-7);
    const hasHiddenDays = !isPro && allDays.length > 7;

    const CHART_HEIGHT = 340;
    const LABEL_AREA = 24;
    const TOTAL_HEIGHT = CHART_HEIGHT + LABEL_AREA;
    const MIN_HOURS = 12;
    const MAX_HOURS = 24;
    const RANGE_HOURS = MAX_HOURS - MIN_HOURS;
    const MIN_MINUTES = MIN_HOURS * 60;
    const BAR_WIDTH = 42;
    const BAR_GAP = 4;
    const Y_LABEL_WIDTH = 36;
    const GUIDES = [12, 14, 16, 18, 20, 22, 24];
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const sel =
      selectedBar !== null && selectedBar < days.length
        ? days[selectedBar]
        : null;

    const fmtDateTime = (ts: number) => {
      const t = new Date(ts);
      return `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    };

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Stats</Text>

        <View style={styles.statsRow}>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowValue}>{completedCount}</Text>
            <Text style={styles.statsRowLabel}>Completed</Text>
          </View>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowValue}>
              {formatTime(longestMinutes * 60000)}
            </Text>
            <Text style={styles.statsRowLabel}>Longest</Text>
          </View>
          <View style={styles.statsRowItem}>
            <Text style={styles.statsRowValue}>
              {formatTime(avgMinutes * 60000)}
            </Text>
            <Text style={styles.statsRowLabel}>Average</Text>
          </View>
        </View>

        <View style={{position: 'relative'}}>
          <View style={{flexDirection: 'row'}}>
            <View style={{width: Y_LABEL_WIDTH, height: TOTAL_HEIGHT}}>
              {GUIDES.map(h => (
                <Text
                  key={h}
                  style={{
                    position: 'absolute',
                    bottom:
                      ((h - MIN_HOURS) / RANGE_HOURS) * CHART_HEIGHT +
                      LABEL_AREA -
                      7,
                    right: 4,
                    color: '#aaa',
                    fontSize: 13,
                  }}>
                  {h}
                </Text>
              ))}
            </View>
            <View style={{flex: 1, height: TOTAL_HEIGHT}}>
              {GUIDES.map(h => (
                <View
                  key={h}
                  style={{
                    position: 'absolute',
                    bottom:
                      ((h - MIN_HOURS) / RANGE_HOURS) * CHART_HEIGHT +
                      LABEL_AREA,
                    left: 0,
                    right: 0,
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: '#333',
                  }}
                />
              ))}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  height: TOTAL_HEIGHT,
                  paddingHorizontal: 4,
                }}>
                {days.map((day, i) => {
                  const reached = day.rep.durationMinutes >= goalMinutes;
                  const clamped = Math.min(
                    Math.max(day.rep.durationMinutes - MIN_MINUTES, 0),
                    RANGE_HOURS * 60,
                  );
                  const barHeight = Math.max(
                    (clamped / (RANGE_HOURS * 60)) * CHART_HEIGHT,
                    4,
                  );
                  const parts = day.dateKey.split('-');
                  const dateObj = new Date(
                    Number(parts[0]),
                    Number(parts[1]) - 1,
                    Number(parts[2]),
                  );
                  const label = DAY_NAMES[dateObj.getDay()];
                  const isSelected = selectedBar === i;
                  return (
                    <Pressable
                      key={day.dateKey}
                      onPress={() =>
                        setSelectedBar(isSelected ? null : i)
                      }
                      style={{
                        alignItems: 'center',
                        width: BAR_WIDTH,
                        marginRight: BAR_GAP,
                        height: TOTAL_HEIGHT,
                        justifyContent: 'flex-end',
                      }}>
                      <View
                        style={{
                          width: BAR_WIDTH - 8,
                          height: barHeight,
                          backgroundColor: reached ? '#4CAF50' : '#333',
                          borderRadius: 4,
                          borderWidth: isSelected ? 1 : 0,
                          borderColor: '#fff',
                        }}
                      />
                      <Text
                        style={{
                          color: '#aaa',
                          fontSize: 13,
                          marginTop: 3,
                        }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {sel && (() => {
            const r = sel.rep;
            const displayMinutes = Math.floor(
              (r.endTimestampUtc - r.startTimestampUtc) / 60000,
            );
            const reached = displayMinutes >= goalMinutes;
            return (
              <Pressable
                style={styles.chartOverlay}
                onPress={() => setSelectedBar(null)}>
                <View style={styles.chartPopup}>
                  <Text style={styles.chartPopupTime}>
                    {fmtDateTime(r.startTimestampUtc)}
                  </Text>
                  <Text style={styles.chartPopupArrow}>↓</Text>
                  <Text style={styles.chartPopupTime}>
                    {fmtDateTime(r.endTimestampUtc)}
                  </Text>
                  <Text style={styles.chartPopupDuration}>
                    {formatTime(displayMinutes * 60000)}
                  </Text>
                  <Text
                    style={[
                      styles.chartPopupStatus,
                      reached ? {color: '#4CAF50'} : {color: '#999'},
                    ]}>
                    {reached ? 'Goal Reached' : 'Not Reached'}
                  </Text>
                </View>
              </Pressable>
            );
          })()}
        </View>

        {hasHiddenDays && (
          <Pressable onPress={handleUnlockPro} style={styles.upgradeBlock}>
            <Text style={styles.upgradeText}>
              View all data — Upgrade to Pro
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  const renderSettings = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Settings</Text>

      <Text style={styles.settingsLabel}>Fasting Goal</Text>
      <View style={styles.goalOptions}>
        {GOAL_OPTIONS.map(h => (
          <Pressable
            key={h}
            onPress={() => handleGoalChange(h)}
            style={[
              styles.goalOption,
              h === goalHours && styles.goalOptionActive,
            ]}>
            <Text
              style={[
                styles.goalOptionText,
                h === goalHours && styles.goalOptionTextActive,
              ]}>
              {h}h
            </Text>
          </Pressable>
        ))}
      </View>

      <Text
        style={[
          styles.settingsLabel,
          {marginTop: 16},
          !isPro && styles.proDisabledLabel,
        ]}>
        Custom Goal {!isPro && '(Pro)'}
      </Text>
      <View style={styles.customInputRow}>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="HH"
          placeholderTextColor="#555"
          value={customGoalHH}
          onChangeText={t => setCustomGoalHH(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>h</Text>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="MM"
          placeholderTextColor="#555"
          value={customGoalMM}
          onChangeText={t => setCustomGoalMM(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>m</Text>
        <Pressable
          onPress={isPro ? handleSetCustomGoal : undefined}
          style={[styles.customInputBtn, !isPro && styles.proDisabledInput]}>
          <Text style={styles.customInputBtnText}>Set</Text>
        </Pressable>
        {![12, 14, 16, 18, 20, 24].includes(goalHours) && (
          <Pressable onPress={isPro ? handleClearCustomGoal : undefined} style={styles.customClearBtn}>
            <Text style={styles.customClearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.settingsDivider} />

      <Text style={styles.settingsLabel}>Goal Alert</Text>
      <View style={styles.settingsToggleRow}>
        <Text style={styles.settingsInfoLabel}>Goal Reached</Text>
        <Switch
          value={goalAlertEnabled}
          onValueChange={handleGoalAlertToggle}
          trackColor={{false: '#333', true: '#2e7d32'}}
          thumbColor={goalAlertEnabled ? '#4CAF50' : '#666'}
        />
      </View>
      {goalAlertEnabled && (
        <>
          <View style={styles.settingsToggleRow}>
            <Text style={[styles.settingsInfoLabel, !isPro && styles.proDisabledLabel]}>
              Strong Alert (Alarm) {!isPro && '(Pro)'}
            </Text>
            <Switch
              value={goalStrong}
              onValueChange={isPro ? (v) => handleGoalStrongToggle(v) : undefined}
              disabled={!isPro}
              trackColor={{false: '#333', true: '#2e7d32'}}
              thumbColor={goalStrong ? '#4CAF50' : '#666'}
            />
          </View>
          {goalStrong && isPro && (
            <Pressable onPress={handlePickAlarmSound} style={styles.settingsRow}>
              <Text style={styles.settingsRowText}>Alarm Sound</Text>
              <Text style={{color: '#aaa', fontSize: 14}}>
                {strongSoundName ?? 'Default alarm'}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {([1, 2, 3] as const).map(n => {
        const rem = [rem1, rem2, rem3][n - 1];
        const hh = [rem1HH, rem2HH, rem3HH][n - 1];
        const mm = [rem1MM, rem2MM, rem3MM][n - 1];
        const setHH = [setRem1HH, setRem2HH, setRem3HH][n - 1];
        const setMM = [setRem1MM, setRem2MM, setRem3MM][n - 1];
        return (
          <View key={n}>
            <Text
              style={[
                styles.settingsLabel,
                {marginTop: 16},
                !isPro && styles.proDisabledLabel,
              ]}>
              Reminder {n} {!isPro && '(Pro)'}
            </Text>
            <View style={styles.customInputRow}>
              <TextInput
                style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
                placeholder="HH"
                placeholderTextColor="#555"
                value={hh}
                onChangeText={t => setHH(t.replace(/[^0-9]/g, ''))}
                editable={isPro}
                keyboardType="numeric"
                maxLength={2}
              />
              <Text style={styles.customHHMMLabel}>h</Text>
              <TextInput
                style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
                placeholder="MM"
                placeholderTextColor="#555"
                value={mm}
                onChangeText={t => setMM(t.replace(/[^0-9]/g, ''))}
                editable={isPro}
                keyboardType="numeric"
                maxLength={2}
              />
              <Text style={styles.customHHMMLabel}>m before goal</Text>
              <Pressable
                onPress={isPro ? () => handleSetReminder(n, hh, mm) : undefined}
                style={[styles.customInputBtn, !isPro && styles.proDisabledInput]}>
                <Text style={styles.customInputBtnText}>Set</Text>
              </Pressable>
              {rem.offsetMinutes > 0 && (
                <Pressable onPress={isPro ? () => handleClearReminder(n) : undefined} style={styles.customClearBtn}>
                  <Text style={styles.customClearBtnText}>✕</Text>
                </Pressable>
              )}
            </View>
            {rem.offsetMinutes > 0 && (
              <>
                <View style={styles.settingsToggleRow}>
                  <Text style={[styles.settingsInfoLabel, !isPro && styles.proDisabledLabel]}>
                    Strong Alert (Alarm)
                  </Text>
                  <Switch
                    value={rem.strong}
                    onValueChange={isPro ? (v) => handleReminderStrongToggle(n, v) : undefined}
                    disabled={!isPro}
                    trackColor={{false: '#333', true: '#2e7d32'}}
                    thumbColor={rem.strong ? '#4CAF50' : '#666'}
                  />
                </View>
                {rem.strong && isPro && (
                  <Pressable onPress={handlePickAlarmSound} style={styles.settingsRow}>
                    <Text style={styles.settingsRowText}>Alarm Sound</Text>
                    <Text style={{color: '#aaa', fontSize: 14}}>
                      {strongSoundName ?? 'Default alarm'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        );
      })}

      <View style={styles.settingsDivider} />

      {isPro ? (
        <View style={styles.settingsInfoRow}>
          <Text style={styles.settingsInfoLabel}>Pro Active</Text>
          <Text style={{color: '#4CAF50', fontSize: 13}}>
            {proPermanent
              ? 'Lifetime'
              : `until ${String(new Date(proExpiresAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(proExpiresAt).getDate()).padStart(2, '0')} ${String(new Date(proExpiresAt).getHours()).padStart(2, '0')}:${String(new Date(proExpiresAt).getMinutes()).padStart(2, '0')}`}
          </Text>
        </View>
      ) : (
        <Pressable style={styles.settingsRow} onPress={handleUnlockPro}>
          <Text style={styles.settingsRowText}>Upgrade to Pro</Text>
          <Text style={styles.settingsRowArrow}>›</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.settingsRow}
        onPress={() => {
          Alert.alert(
            'Battery Settings',
            'If notifications or alarms are not arriving, go to your device Settings > Apps > Fast > Battery and set it to "Unrestricted".\n\nThis prevents the system from blocking scheduled alerts while the screen is off.',
            [
              {text: 'Close', style: 'cancel'},
              {
                text: 'Open Settings',
                onPress: () => {
                  const {Linking} = require('react-native');
                  Linking.openSettings();
                },
              },
            ],
          );
        }}>
        <Text style={styles.settingsRowText}>Battery Settings</Text>
        <Text style={styles.settingsRowArrow}>›</Text>
      </Pressable>

      <Pressable
        style={styles.settingsRow}
        onPress={() => setShowPrivacy(true)}>
        <Text style={styles.settingsRowText}>Privacy Policy</Text>
        <Text style={styles.settingsRowArrow}>›</Text>
      </Pressable>

      <View style={styles.settingsDivider} />

      <Text style={styles.settingsLabel}>How to Use</Text>
      <Text style={styles.howToStep}>1. Log your meal</Text>
      <Text style={styles.howToStep}>2. Your fast starts automatically</Text>
      <Text style={styles.howToStep}>3. Reach your fasting goal</Text>
      <Text style={styles.howToStep}>4. Track your progress</Text>

      <View style={styles.settingsDivider} />

      <Text style={styles.settingsLabel}>Free vs Pro</Text>
      <View style={styles.comparisonRow}>
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonHeader}>Free</Text>
          <Text style={styles.comparisonItem}>Timer</Text>
          <Text style={styles.comparisonItem}>Goal Alert</Text>
          <Text style={styles.comparisonItem}>7 Days History</Text>
          <Text style={styles.comparisonItem}>7 Days Stats</Text>
          <Text style={styles.comparisonItem}>Edit History</Text>
        </View>
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonHeaderPro}>Pro</Text>
          <Text style={styles.comparisonItemPro}>Meal Notes</Text>
          <Text style={styles.comparisonItemPro}>Meal Photos</Text>
          <Text style={styles.comparisonItemPro}>Unlimited History</Text>
          <Text style={styles.comparisonItemPro}>Unlimited Stats</Text>
          <Text style={styles.comparisonItemPro}>Flexible Goals</Text>
          <Text style={styles.comparisonItemPro}>Custom Reminders</Text>
          <Text style={styles.comparisonItemPro}>Strong Alerts</Text>
        </View>
      </View>

      <Text style={styles.versionText}>Version 1.0.0</Text>
    </ScrollView>
  );

  const TABS: {key: Tab; icon: string; label: string}[] = [
    {key: 'timer', icon: '⏱', label: 'Timer'},
    {key: 'history', icon: '📋', label: 'History'},
    {key: 'stats', icon: '📊', label: 'Stats'},
    {key: 'settings', icon: '⚙', label: 'Settings'},
  ];

  if (showPrivacy) {
    return (
      <View style={styles.container}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 8}}>
          <Pressable onPress={() => setShowPrivacy(false)} style={{padding: 8}}>
            <Text style={{color: '#4A90D9', fontSize: 16}}>← Back</Text>
          </Pressable>
        </View>
        <PrivacyPolicyScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        {tab === 'timer' && renderTimer()}
        {tab === 'history' && renderHistory()}
        {tab === 'stats' && renderStats()}
        {tab === 'settings' && renderSettings()}
      </View>

      {showProExpired && (
        <Pressable
          style={[styles.tutorialOverlay, styles.tutorialOverlayLight]}
          onPress={() => setShowProExpired(false)}>
          <View style={[styles.tutorialBox, styles.tutorialBoxBordered]}>
            <Text style={[styles.tutorialText, styles.tutorialTextFirst]}>
              Pro Trial Ended
            </Text>
            <Text style={styles.tutorialText}>
              Your 20-day Pro trial has expired.
            </Text>
            <Text style={styles.tutorialText}>
              You can upgrade anytime from Settings.
            </Text>
            <Text style={styles.tutorialDismiss}>Tap to dismiss</Text>
          </View>
        </Pressable>
      )}

      {overlayVisible[tab] && (
        <Pressable
          style={[
            styles.tutorialOverlay,
            (tab === 'timer' || tab === 'settings') && styles.tutorialOverlayLight,
          ]}
          onPress={dismissOverlay}>
          <View style={[
            styles.tutorialBox,
            (tab === 'timer' || tab === 'settings') && styles.tutorialBoxBordered,
          ]}>
            {OVERLAY_TEXT[tab].map((line, i) => (
              <Text key={i} style={[styles.tutorialText, i === 0 && styles.tutorialTextFirst]}>
                {line}
              </Text>
            ))}
            <Text style={styles.tutorialDismiss}>Tap to dismiss</Text>
          </View>
        </Pressable>
      )}

      {overlayVisible.timer && tab === 'timer' && (
        <View style={styles.menuIndicator}>
          <Text style={styles.menuIndicatorText}>↓ Menu ↓</Text>
        </View>
      )}

      <View style={styles.tabBar}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            style={styles.tabItem}
            onPress={() => setTab(t.key)}>
            <Text
              style={[styles.tabIcon, tab === t.key && styles.tabActive]}>
              {t.icon}
            </Text>
            <Text
              style={[styles.tabLabel, tab === t.key && styles.tabActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={mealModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMealModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Meal</Text>

            <Text style={[styles.modalLabel, !isPro && styles.modalDisabled]}>
              Meal Note {!isPro && '(Pro)'}
            </Text>
            <TextInput
              style={[styles.modalInput, !isPro && styles.modalInputDisabled]}
              placeholderTextColor="#555"
              placeholder="What did you eat?"
              value={mealNote}
              onChangeText={setMealNote}
              editable={isPro}
              maxLength={200}
            />

            <Text style={[styles.modalLabel, !isPro && styles.modalDisabled]}>
              Meal Photo {!isPro && '(Pro)'}
            </Text>
            {mealPhotoUri ? (
              <Pressable onPress={handlePickPhoto}>
                <Image
                  source={{uri: mealPhotoUri}}
                  style={styles.modalPhotoPreview}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={handlePickPhoto}
                style={[
                  styles.modalPhotoButton,
                  !isPro && styles.modalInputDisabled,
                ]}>
                <Text
                  style={[styles.modalPhotoButtonText, !isPro && styles.modalDisabled]}>
                  Choose Photo
                </Text>
              </Pressable>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setMealModalVisible(false)}
                style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleLogMealConfirm}
                style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditModalVisible(false);
          setSelectedHistoryIdx(null);
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Time</Text>

            <Text style={styles.modalLabel}>Start</Text>
            <TextInput
              style={styles.modalInput}
              placeholderTextColor="#555"
              placeholder="YYYY/MM/DD HH:MM"
              value={editStartStr}
              onChangeText={setEditStartStr}
              maxLength={16}
            />

            <Text style={styles.modalLabel}>End</Text>
            <TextInput
              style={styles.modalInput}
              placeholderTextColor="#555"
              placeholder="YYYY/MM/DD HH:MM"
              value={editEndStr}
              onChangeText={setEditEndStr}
              maxLength={16}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleDeleteRecord}
                style={styles.modalDelete}>
                <Text style={styles.modalDeleteText}>Delete</Text>
              </Pressable>
              <View style={{flex: 1}} />
              <Pressable
                onPress={() => {
                  setEditModalVisible(false);
                  setSelectedHistoryIdx(null);
                }}
                style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleEditConfirm}
                style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

