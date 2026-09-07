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
  getNotifEnabled,
  setNotifEnabled,
  getProExpiresAt,
  unlockProByAd,
  getProPermanent,
  setProPermanent,
  getAdWatched,
  getCustomNotifHours,
  setCustomNotifHours,
  getCustomNotifHours2,
  setCustomNotifHours2,
  getCustomNotifHours3,
  setCustomNotifHours3,
} from './storage';
import {
  scheduleFastCompleted,
  cancelFastCompleted,
  scheduleCustomReminder,
  cancelCustomReminder,
} from './notifications';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';

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
  const [notifEnabled, setNotifEnabledState] = useState(true);
  const [tab, setTab] = useState<Tab>('timer');
  const [history, setHistory] = useState<FastRecord[]>([]);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [proExpiresAt, setProExpiresAt] = useState(0);
  const [proPermanent, setProPermanentState] = useState(false);
  const [adWatched, setAdWatched] = useState(false);
  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [customNotifHours, setCustomNotifHoursState] = useState<number | null>(
    null,
  );
  const [customNotifHours2, setCustomNotifHoursState2] = useState<number | null>(null);
  const [customNotifHours3, setCustomNotifHoursState3] = useState<number | null>(null);
  const [customGoalHH, setCustomGoalHH] = useState('');
  const [customGoalMM, setCustomGoalMM] = useState('');
  const [customNotifHH, setCustomNotifHH] = useState('');
  const [customNotifMM, setCustomNotifMM] = useState('');
  const [customNotifHH2, setCustomNotifHH2] = useState('');
  const [customNotifMM2, setCustomNotifMM2] = useState('');
  const [customNotifHH3, setCustomNotifHH3] = useState('');
  const [customNotifMM3, setCustomNotifMM3] = useState('');
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editStartStr, setEditStartStr] = useState('');
  const [editEndStr, setEditEndStr] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [mealPhotoUri, setMealPhotoUri] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const [meal, best, goal, completed, notif, proExp, proPerm, custNotif, custNotif2, custNotif3, watched] =
        await Promise.all([
          getLastMealTimestamp(),
          getBestFastMinutes(),
          getGoalHours(),
          getCompletedFasts(),
          getNotifEnabled(),
          getProExpiresAt(),
          getProPermanent(),
          getCustomNotifHours(),
          getCustomNotifHours2(),
          getCustomNotifHours3(),
          getAdWatched(),
        ]);
      if (meal !== null) {
        setLastMeal(meal);
      } else {
        const ts = Date.now();
        await setLastMealTimestamp(ts);
        setLastMeal(ts);
      }
      setBestMinutes(best);
      setGoalHoursState(goal);
      setCompletedFastsState(completed);
      setNotifEnabledState(notif);
      setProExpiresAt(proExp);
      setProPermanentState(proPerm);
      setAdWatched(watched);
      setCustomNotifHoursState(custNotif);
      setCustomNotifHoursState2(custNotif2);
      setCustomNotifHoursState3(custNotif3);
      if (![12, 14, 16, 18, 20, 24].includes(goal)) {
        setCustomGoalHH(String(Math.floor(goal)));
        setCustomGoalMM(String(Math.round((goal % 1) * 60)).padStart(2, '0'));
      }
      if (custNotif !== null) {
        setCustomNotifHH(String(Math.floor(custNotif)));
        setCustomNotifMM(String(Math.round((custNotif % 1) * 60)).padStart(2, '0'));
      }
      if (custNotif2 !== null) {
        setCustomNotifHH2(String(Math.floor(custNotif2)));
        setCustomNotifMM2(String(Math.round((custNotif2 % 1) * 60)).padStart(2, '0'));
      }
      if (custNotif3 !== null) {
        setCustomNotifHH3(String(Math.floor(custNotif3)));
        setCustomNotifMM3(String(Math.round((custNotif3 % 1) * 60)).padStart(2, '0'));
      }
      setLoaded(true);
    })();
  }, []);

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
  }, [tab, loadHistory]);

  const handleLogMealOpen = useCallback(() => {
    setMealNote('');
    setMealPhotoUri(null);
    setMealModalVisible(true);
  }, []);

  const handleLogMealConfirm = useCallback(async () => {
    setMealModalVisible(false);
    const endTs = Date.now();
    if (lastMeal !== null) {
      const durationMinutes = Math.floor((endTs - lastMeal) / 60000);

      if (durationMinutes >= goalHours * 60) {
        const newCount = completedFasts + 1;
        setCompletedFastsState(newCount);
        await setCompletedFasts(newCount);
      }

      if (durationMinutes > bestMinutes) {
        setBestMinutes(durationMinutes);
        await setBestFastMinutes(durationMinutes);
      }

      const record: FastRecord = {
        startTimestampUtc: lastMeal,
        endTimestampUtc: endTs,
        durationMinutes,
      };
      if (proExpiresAt > Date.now() && mealNote.trim()) {
        record.mealNote = mealNote.trim();
      }
      if (proExpiresAt > Date.now() && mealPhotoUri) {
        record.mealPhotoUri = mealPhotoUri;
      }
      await addFastRecord(record);
    }

    await setLastMealTimestamp(endTs);
    setLastMeal(endTs);
    setNow(Date.now());

    await cancelFastCompleted();
    await cancelCustomReminder();
    if (notifEnabled) {
      await scheduleFastCompleted(endTs, goalHours);
    }
    if (proExpiresAt > Date.now()) {
      if (customNotifHours !== null) {
        await scheduleCustomReminder(endTs, customNotifHours);
      }
      if (customNotifHours2 !== null) {
        await scheduleCustomReminder(endTs, customNotifHours2);
      }
      if (customNotifHours3 !== null) {
        await scheduleCustomReminder(endTs, customNotifHours3);
      }
    }
  }, [lastMeal, bestMinutes, goalHours, completedFasts, notifEnabled, proExpiresAt, mealNote, mealPhotoUri, customNotifHours, customNotifHours2, customNotifHours3]);

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
  }, []);

  const handleNotifToggle = useCallback(async (val: boolean) => {
    setNotifEnabledState(val);
    await setNotifEnabled(val);
    if (!val) {
      await cancelFastCompleted();
    }
  }, []);

  const handleUnlockPro = useCallback(() => {
    const buttons: {text: string; style?: 'cancel' | 'destructive'; onPress?: () => void}[] = [
      {text: 'Cancel', style: 'cancel'},
    ];
    if (!adWatched) {
      buttons.push({
        text: 'Watch Ad (free for 24h)',
        onPress: async () => {
          const expires = await unlockProByAd();
          setProExpiresAt(expires);
          setAdWatched(true);
        },
      });
    }
    buttons.push({
      text: 'Buy $1.99 (forever)',
      onPress: async () => {
        await setProPermanent();
        setProPermanentState(true);
      },
    });
    Alert.alert('Upgrade to Pro', 'Choose an option:', buttons);
  }, [adWatched]);

  const validateHHMM = (hh: string, mm: string): number | null => {
    const h = Number(hh) || 0;
    const m = Number(mm === '' ? '0' : mm);
    if (isNaN(m) || m > 59 || h < 12 || h > 99) return null;
    return h + m / 60;
  };

  const handleSetCustomGoal = useCallback(async () => {
    const total = validateHHMM(customGoalHH, customGoalMM);
    if (total === null) return;
    setGoalHoursState(total);
    await setGoalHours(total);
  }, [customGoalHH, customGoalMM]);

  const handleClearCustomGoal = useCallback(async () => {
    setGoalHoursState(16);
    await setGoalHours(16);
    setCustomGoalHH('');
    setCustomGoalMM('');
  }, []);

  const handleSetCustomNotif = useCallback(async () => {
    const total = validateHHMM(customNotifHH, customNotifMM);
    if (total === null) return;
    setCustomNotifHoursState(total);
    await setCustomNotifHours(total);
  }, [customNotifHH, customNotifMM]);

  const handleClearCustomNotif = useCallback(async () => {
    setCustomNotifHoursState(null);
    await setCustomNotifHours(null);
    setCustomNotifHH('');
    setCustomNotifMM('');
  }, []);

  const handleSetCustomNotif2 = useCallback(async () => {
    const total = validateHHMM(customNotifHH2, customNotifMM2);
    if (total === null) return;
    setCustomNotifHoursState2(total);
    await setCustomNotifHours2(total);
  }, [customNotifHH2, customNotifMM2]);

  const handleClearCustomNotif2 = useCallback(async () => {
    setCustomNotifHoursState2(null);
    await setCustomNotifHours2(null);
    setCustomNotifHH2('');
    setCustomNotifMM2('');
  }, []);

  const handleSetCustomNotif3 = useCallback(async () => {
    const total = validateHHMM(customNotifHH3, customNotifMM3);
    if (total === null) return;
    setCustomNotifHoursState3(total);
    await setCustomNotifHours3(total);
  }, [customNotifHH3, customNotifMM3]);

  const handleClearCustomNotif3 = useCallback(async () => {
    setCustomNotifHoursState3(null);
    await setCustomNotifHours3(null);
    setCustomNotifHH3('');
    setCustomNotifMM3('');
  }, []);

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

      {isPro ? (
        <View style={styles.adLink}>
          <Text style={[styles.adLinkText, {color: '#4CAF50'}]}>Pro Active</Text>
        </View>
      ) : (
        <Pressable onPress={handleUnlockPro} style={styles.adLink}>
          <Text style={styles.adLinkText}>
            {adWatched
              ? 'Upgrade to Pro — $1.99 Lifetime'
              : 'Try Pro free for 24 hours — first time only\nWatch one rewarded ad to start your trial.'}
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
        contentContainerStyle={!isPro ? {paddingBottom: 60} : undefined}
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

    const CHART_HEIGHT = 220;
    const LABEL_AREA = 18;
    const TOTAL_HEIGHT = CHART_HEIGHT + LABEL_AREA;
    const MIN_HOURS = 12;
    const MAX_HOURS = 24;
    const RANGE_HOURS = MAX_HOURS - MIN_HOURS;
    const MIN_MINUTES = MIN_HOURS * 60;
    const BAR_WIDTH = 42;
    const BAR_GAP = 4;
    const Y_LABEL_WIDTH = 34;
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
      <View style={[styles.tabContent, !isPro && {paddingBottom: 60}]}>
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
                    fontSize: 11,
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
                          fontSize: 11,
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

      <Text style={styles.settingsLabel}>Notifications</Text>
      <View style={styles.settingsToggleRow}>
        <Text style={styles.settingsInfoLabel}>Fast Completed</Text>
        <Switch
          value={notifEnabled}
          onValueChange={handleNotifToggle}
          trackColor={{false: '#333', true: '#2e7d32'}}
          thumbColor={notifEnabled ? '#4CAF50' : '#666'}
        />
      </View>

      <Text
        style={[
          styles.settingsLabel,
          {marginTop: 16},
          !isPro && styles.proDisabledLabel,
        ]}>
        Custom Reminder 1 {!isPro && '(Pro)'}
      </Text>
      <View style={styles.customInputRow}>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="HH"
          placeholderTextColor="#555"
          value={customNotifHH}
          onChangeText={t => setCustomNotifHH(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>h</Text>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="MM"
          placeholderTextColor="#555"
          value={customNotifMM}
          onChangeText={t => setCustomNotifMM(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>m</Text>
        <Pressable
          onPress={isPro ? handleSetCustomNotif : undefined}
          style={[styles.customInputBtn, !isPro && styles.proDisabledInput]}>
          <Text style={styles.customInputBtnText}>Set</Text>
        </Pressable>
        {customNotifHours !== null && (
          <Pressable onPress={isPro ? handleClearCustomNotif : undefined} style={styles.customClearBtn}>
            <Text style={styles.customClearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

      <Text
        style={[
          styles.settingsLabel,
          {marginTop: 12},
          !isPro && styles.proDisabledLabel,
        ]}>
        Custom Reminder 2 {!isPro && '(Pro)'}
      </Text>
      <View style={styles.customInputRow}>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="HH"
          placeholderTextColor="#555"
          value={customNotifHH2}
          onChangeText={t => setCustomNotifHH2(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>h</Text>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="MM"
          placeholderTextColor="#555"
          value={customNotifMM2}
          onChangeText={t => setCustomNotifMM2(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>m</Text>
        <Pressable
          onPress={isPro ? handleSetCustomNotif2 : undefined}
          style={[styles.customInputBtn, !isPro && styles.proDisabledInput]}>
          <Text style={styles.customInputBtnText}>Set</Text>
        </Pressable>
        {customNotifHours2 !== null && (
          <Pressable onPress={isPro ? handleClearCustomNotif2 : undefined} style={styles.customClearBtn}>
            <Text style={styles.customClearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

      <Text
        style={[
          styles.settingsLabel,
          {marginTop: 12},
          !isPro && styles.proDisabledLabel,
        ]}>
        Custom Reminder 3 {!isPro && '(Pro)'}
      </Text>
      <View style={styles.customInputRow}>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="HH"
          placeholderTextColor="#555"
          value={customNotifHH3}
          onChangeText={t => setCustomNotifHH3(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>h</Text>
        <TextInput
          style={[styles.customHHMMInput, !isPro && styles.proDisabledInput]}
          placeholder="MM"
          placeholderTextColor="#555"
          value={customNotifMM3}
          onChangeText={t => setCustomNotifMM3(t.replace(/[^0-9]/g, ''))}
          editable={isPro}
          keyboardType="numeric"
          maxLength={2}
        />
        <Text style={styles.customHHMMLabel}>m</Text>
        <Pressable
          onPress={isPro ? handleSetCustomNotif3 : undefined}
          style={[styles.customInputBtn, !isPro && styles.proDisabledInput]}>
          <Text style={styles.customInputBtnText}>Set</Text>
        </Pressable>
        {customNotifHours3 !== null && (
          <Pressable onPress={isPro ? handleClearCustomNotif3 : undefined} style={styles.customClearBtn}>
            <Text style={styles.customClearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>

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
          <Text style={styles.comparisonItem}>Basic Notifications</Text>
          <Text style={styles.comparisonItem}>7 Days History</Text>
          <Text style={styles.comparisonItem}>7 Days Stats</Text>
          <Text style={styles.comparisonItem}>Edit History</Text>
          <Text style={styles.comparisonItem}>Ads</Text>
        </View>
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonHeaderPro}>Pro</Text>
          <Text style={styles.comparisonItemPro}>No Ads</Text>
          <Text style={styles.comparisonItemPro}>Meal Notes</Text>
          <Text style={styles.comparisonItemPro}>Meal Photos</Text>
          <Text style={styles.comparisonItemPro}>Unlimited History</Text>
          <Text style={styles.comparisonItemPro}>Unlimited Stats</Text>
          <Text style={styles.comparisonItemPro}>Flexible Goals</Text>
          <Text style={styles.comparisonItemPro}>Advanced Notifications</Text>
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

      {!isPro && <View style={styles.adSpace} />}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  loading: {
    color: '#555',
    textAlign: 'center',
    marginTop: 100,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topItem: {
    alignItems: 'center',
  },
  topLabel: {
    color: '#ccc',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  topValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 2,
  },
  timerSection: {
    alignItems: 'center',
    marginTop: 30,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  timer: {
    color: '#fff',
    fontSize: 72,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  timerUnit: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '200',
    marginHorizontal: 4,
    marginBottom: 2,
  },
  phase: {
    color: '#FF9800',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  milestones: {
    marginTop: 20,
    marginBottom: 20,
    gap: 8,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  milestoneHours: {
    color: '#bbb',
    fontSize: 15,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  milestoneLabel: {
    color: '#bbb',
    fontSize: 15,
  },
  milestoneActive: {
    color: '#FF9800',
    fontWeight: '700',
  },
  milestoneFireIcon: {
    fontSize: 16,
  },
  milestoneReached: {
    color: '#4CAF50',
  },
  button: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  buttonPressed: {
    backgroundColor: '#111',
    borderColor: '#666',
  },
  buttonText: {
    color: '#ddd',
    fontSize: 16,
  },
  adSpace: {
    height: 60,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingVertical: 10,
    paddingBottom: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabIcon: {
    fontSize: 22,
    color: '#777',
  },
  tabLabel: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  tabActive: {
    color: '#fff',
  },
  tabContent: {
    flex: 1,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 14,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  historyDate: {
    color: '#ccc',
    fontSize: 15,
  },
  historyDuration: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  historyStatus: {
    fontSize: 13,
    marginTop: 4,
  },
  historyReached: {
    color: '#4CAF50',
  },
  historyNotReached: {
    color: '#999',
  },
  historyDim: {
    color: '#999',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  statsRowItem: {
    alignItems: 'center',
  },
  statsRowValue: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statsRowLabel: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsLabel: {
    color: '#ccc',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  goalOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalOption: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  goalOptionActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2e1a',
  },
  goalOptionText: {
    color: '#ccc',
    fontSize: 16,
  },
  goalOptionTextActive: {
    color: '#4CAF50',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 16,
  },
  settingsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  settingsInfoLabel: {
    color: '#ccc',
    fontSize: 16,
  },
  settingsInfoValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  settingsRowText: {
    color: '#ccc',
    fontSize: 16,
  },
  settingsRowArrow: {
    color: '#777',
    fontSize: 22,
  },
  versionText: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 40,
  },
  howToStep: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 24,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  comparisonColumn: {
    flex: 1,
  },
  comparisonHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  comparisonHeaderPro: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  comparisonItem: {
    color: '#999',
    fontSize: 14,
    lineHeight: 22,
  },
  comparisonItemPro: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
  },
  adLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  adLinkText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  chartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  chartPopup: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 160,
  },
  chartPopupTime: {
    color: '#fff',
    fontSize: 15,
    fontVariant: ['tabular-nums'] as any,
  },
  chartPopupArrow: {
    color: '#555',
    fontSize: 14,
    marginVertical: 2,
  },
  chartPopupDuration: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as any,
    marginBottom: 4,
  },
  chartPopupStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  upgradeBlock: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  upgradeText: {
    color: '#aaa',
    fontSize: 15,
  },
  proDisabledLabel: {
    color: '#555',
  },
  proDisabledInput: {
    opacity: 0.4,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  customHHMMInput: {
    width: 48,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  customHHMMLabel: {
    color: '#999',
    fontSize: 14,
    alignSelf: 'center',
  },
  customClearBtn: {
    backgroundColor: '#2a1a1a',
    borderRadius: 6,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customClearBtnText: {
    color: '#e53935',
    fontSize: 14,
    fontWeight: '600',
  },
  customInputBtn: {
    backgroundColor: '#1a2e1a',
    borderRadius: 6,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  customInputBtnText: {
    color: '#4CAF50',
    fontSize: 15,
    fontWeight: '600',
  },
  historyNote: {
    color: '#999',
    fontSize: 13,
    marginTop: 4,
  },
  editButton: {
    backgroundColor: '#1a2e1a',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  editButtonText: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
  },
  historyPhoto: {
    width: 40,
    height: 40,
    borderRadius: 4,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalLabel: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  modalDisabled: {
    color: '#555',
  },
  modalInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalInputDisabled: {
    opacity: 0.4,
  },
  modalPhotoPreview: {
    width: 80,
    height: 80,
    borderRadius: 6,
    marginTop: 4,
  },
  modalPhotoButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center' as const,
  },
  modalPhotoButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 20,
  },
  modalDelete: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalDeleteText: {
    color: '#ff4444',
    fontSize: 14,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    color: '#888',
    fontSize: 15,
  },
  modalConfirm: {
    backgroundColor: '#1a2e1a',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalConfirmText: {
    color: '#4CAF50',
    fontSize: 15,
    fontWeight: '600',
  },
});
