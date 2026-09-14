import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = '@habit_tracker_state_v3';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ACCENT_COLORS = [
  { name: 'Red', value: '#ff3b30' },
  { name: 'Crimson', value: '#d81b60' },
  { name: 'Orange Red', value: '#ff5a36' },
  { name: 'Rose', value: '#ff4f81' },
  { name: 'Amber', value: '#ffb000' },
  { name: 'Ice', value: '#55c2ff' },
];

const DEFAULT_HABITS = [
  { id: 'read', name: 'Read / Study', icon: '📚', color: '#ff3b30', createdAt: todayKey(), deletedAt: null },
  { id: 'walk', name: 'Walk 6,000 steps', icon: '🚶', color: '#ff5a36', createdAt: todayKey(), deletedAt: null },
  { id: 'guitar', name: 'Practice guitar', icon: '🎸', color: '#b91c1c', createdAt: todayKey(), deletedAt: null },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, amount) {
  const d = parseKey(key);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
}

function addMonths(key, amount) {
  const d = parseKey(key);
  d.setMonth(d.getMonth() + amount, 1);
  return dateKey(d);
}

function formatDate(key, options) {
  return new Intl.DateTimeFormat('en-US', options).format(parseKey(key));
}

function weekDates(anchorKey = todayKey()) {
  const anchor = parseKey(anchorKey);
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return dateKey(d);
  });
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthDates(key = todayKey()) {
  const d = parseKey(key);
  const count = daysInMonth(d.getFullYear(), d.getMonth());
  return Array.from({ length: count }, (_, index) => dateKey(new Date(d.getFullYear(), d.getMonth(), index + 1)));
}

function calendarCells(monthKey) {
  const d = parseKey(monthKey);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const mondayIndex = firstDay === 0 ? 6 : firstDay - 1;
  const days = monthDates(monthKey);
  return [...Array(mondayIndex).fill(null), ...days];
}

function getCompletion(state, habitId, key) {
  return Boolean(state.completions?.[key]?.[habitId]);
}

function isHabitActiveOnDate(habit, key) {
  const created = habit.createdAt || key;
  const deleted = habit.deletedAt || null;
  return key >= created && (!deleted || key <= deleted);
}

function setCompletion(state, habitId, key, value) {
  const completions = { ...(state.completions || {}) };
  const day = { ...(completions[key] || {}) };
  if (value) day[habitId] = true;
  else delete day[habitId];
  if (Object.keys(day).length) completions[key] = day;
  else delete completions[key];
  return { ...state, completions };
}

function habitStats(state, habit) {
  const start = habit.createdAt || todayKey();
  const end = habit.deletedAt && habit.deletedAt < todayKey() ? habit.deletedAt : todayKey();
  const startDate = parseKey(start);
  const endDate = parseKey(end);
  const totalDays = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);
  let completed = 0;
  let streak = 0;
  let cursor = end;
  while (cursor >= start && getCompletion(state, habit.id, cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  for (let i = 0; i < totalDays; i += 1) {
    const key = addDays(start, i);
    if (key > end) break;
    if (getCompletion(state, habit.id, key)) completed += 1;
  }
  return {
    completed,
    totalDays,
    percent: Math.round((completed / totalDays) * 100),
    streak,
  };
}

function overallStatsForMonth(state, monthKey) {
  const today = todayKey();
  const dates = monthDates(monthKey);
  let expected = 0;
  let completed = 0;
  state.habits.forEach((habit) => {
    dates.forEach((key) => {
      if (isHabitActiveOnDate(habit, key) && key <= today) {
        expected += 1;
        if (getCompletion(state, habit.id, key)) completed += 1;
      }
    });
  });
  return {
    completed,
    expected,
    percent: expected ? Math.round((completed / expected) * 100) : 0,
  };
}

function normalizeState(parsed) {
  return {
    habits: Array.isArray(parsed?.habits)
      ? parsed.habits.map((habit, index) => ({
          ...habit,
          color: habit.color || ACCENT_COLORS[index % ACCENT_COLORS.length].value,
          icon: habit.icon || '✅',
          createdAt: habit.createdAt || todayKey(),
          deletedAt: habit.deletedAt || null,
        }))
      : DEFAULT_HABITS,
    completions: parsed?.completions || {},
    accentColor: parsed?.accentColor || '#ff3b30',
    notificationsEnabled: parsed?.notificationsEnabled !== false,
  };
}

function loadInitialState() {
  return {
    habits: DEFAULT_HABITS.map((item) => ({ ...item })),
    completions: {},
    accentColor: '#ff3b30',
    notificationsEnabled: true,
  };
}

export default function App() {
  const [state, setState] = useState(loadInitialState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('Today');
  const [calendarMonth, setCalendarMonth] = useState(todayKey());
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [habitDraft, setHabitDraft] = useState({ name: '', icon: '✅', color: '#ff3b30' });
  const [editorDate, setEditorDate] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setState(normalizeState(JSON.parse(saved)));
      } catch (error) {
        console.log('Failed to load habit data:', error);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);


  useEffect(() => {
    setupDailyReminder(state.notificationsEnabled);
  }, [loaded, state.notificationsEnabled]);

  async function setupDailyReminder(enabled) {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (!enabled) return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily-reminder', {
          name: 'Daily habit reminder',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
        });
      }
      const permissions = await Notifications.getPermissionsAsync();
      let granted = permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (!granted) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      }
      if (!granted) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Habit check-in',
          body: 'It is 11:55 PM. Check your habits before the day ends.',
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 23,
          minute: 55,
          channelId: Platform.OS === 'android' ? 'daily-reminder' : undefined,
        },
      });
    } catch (error) {
      console.log('Notification setup failed:', error);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((error) => {
      console.log('Failed to save habit data:', error);
    });
  }, [state, loaded]);

  const toggleHabit = (habitId, key = todayKey()) => {
    const habit = state.habits.find((item) => item.id === habitId);
    if (!habit || !isHabitActiveOnDate(habit, key) || key > todayKey()) return;
    const nextValue = !getCompletion(state, habitId, key);
    setState((previous) => setCompletion(previous, habitId, key, nextValue));
  };

  const openAddHabit = () => {
    setEditingHabit(null);
    setHabitDraft({
      name: '',
      icon: '✅',
      color: state.accentColor,
    });
    setModalVisible(true);
  };

  const openEditHabit = (habit) => {
    setEditingHabit(habit.id);
    setHabitDraft({ name: habit.name, icon: habit.icon || '✅', color: habit.color || state.accentColor });
    setModalVisible(true);
  };

  const saveHabit = () => {
    const name = habitDraft.name.trim();
    if (!name) return;
    setState((previous) => {
      if (editingHabit) {
        return {
          ...previous,
          habits: previous.habits.map((habit) =>
            habit.id === editingHabit ? { ...habit, name, icon: habitDraft.icon || '✅', color: habitDraft.color } : habit,
          ),
        };
      }
      const newHabit = {
        id: `${Date.now()}`,
        name,
        icon: habitDraft.icon || '✅',
        color: habitDraft.color,
        createdAt: todayKey(),
        deletedAt: null,
      };
      return { ...previous, habits: [...previous.habits, newHabit] };
    });
    setModalVisible(false);
  };

  const deleteHabit = (habitId) => {
    Alert.alert('Delete habit?', 'It will disappear from future days, but all past history will stay in Statistics.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setState((previous) => ({
            ...previous,
            habits: previous.habits.map((habit) =>
              habit.id === habitId && !habit.deletedAt ? { ...habit, deletedAt: todayKey() } : habit,
            ),
          }));
        },
      },
    ]);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}><Text style={styles.loading}>Loading…</Text></View>
      </SafeAreaView>
    );
  }

  const accent = state.accentColor || '#ff3b30';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.appShell}>
        {tab === 'Today' && (
          <TodayScreen
            state={state}
            accent={accent}
            toggleHabit={toggleHabit}
          />
        )}
        {tab === 'Stats' && (
          <StatsScreen
            state={state}
            accent={accent}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            onOpenDay={(key) => setEditorDate(key)}
          />
        )}
        {tab === 'Settings' && (
          <SettingsScreen
            state={state}
            accent={accent}
            onAdd={openAddHabit}
            onEdit={openEditHabit}
            onDelete={deleteHabit}
            setAccent={(value) => setState((previous) => ({ ...previous, accentColor: value }))}
            notificationsEnabled={state.notificationsEnabled}
            setNotificationsEnabled={(value) => setState((previous) => ({ ...previous, notificationsEnabled: value }))}
          />
        )}

        <View style={styles.tabBar}>
          {['Today', 'Stats', 'Settings'].map((item) => (
            <Pressable key={item} style={styles.tabItem} onPress={() => setTab(item)}>
              <Text style={[styles.tabIcon, tab === item && { color: accent }]}>
                {item === 'Today' ? '☑' : item === 'Stats' ? '◔' : '⚙'}
              </Text>
              <Text style={[styles.tabLabel, tab === item && styles.tabLabelActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <DayEditorModal
        visible={Boolean(editorDate)}
        dateKey={editorDate}
        state={state}
        accent={accent}
        onClose={() => setEditorDate(null)}
        onToggle={toggleHabit}
      />

      <HabitModal
        visible={modalVisible}
        editing={Boolean(editingHabit)}
        draft={habitDraft}
        setDraft={setHabitDraft}
        accent={accent}
        onClose={() => setModalVisible(false)}
        onSave={saveHabit}
      />
    </SafeAreaView>
  );
}

function ScreenHeader({ title, subtitle }) {
  return (
    <View style={styles.header}>
      <Text style={styles.appTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function TodayScreen({ state, accent, toggleHabit }) {
  const key = todayKey();
  const activeHabits = state.habits.filter((habit) => isHabitActiveOnDate(habit, key) && !habit.deletedAt);
  const completed = activeHabits.filter((habit) => getCompletion(state, habit.id, key)).length;
  const percent = activeHabits.length ? Math.round((completed / activeHabits.length) * 100) : 0;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: percent,
      useNativeDriver: false,
      friction: 8,
      tension: 70,
    }).start();
  }, [percent, progressAnim]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title="Today"
        subtitle={formatDate(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      />

      <Animated.View style={[styles.progressCard, { transform: [{ scale: progressAnim.interpolate({ inputRange: [0, 100], outputRange: [0.985, 1], extrapolate: 'clamp' }) }] }]}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.cardTitle}>Daily progress</Text>
            <Text style={styles.muted}>{completed} of {activeHabits.length} habits done</Text>
          </View>
          <Text style={styles.bigPercent}>{percent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: accent,
                width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
      </Animated.View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Habits</Text>
      </View>

      {activeHabits.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No habits yet</Text>
          <Text style={styles.muted}>Open Settings and add your first one.</Text>
        </View>
      )}

      {activeHabits.map((habit) => (
        <HabitCheckRow
          key={habit.id}
          habit={habit}
          done={getCompletion(state, habit.id, key)}
          onPress={() => toggleHabit(habit.id, key)}
        />
      ))}

      <Text style={styles.footerHint}>Past days are available and editable from the full calendar in Statistics.</Text>
    </ScrollView>
  );
}

function HabitCheckRow({ habit, done, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onPress();
  };
  const color = habit.color || '#ff3b30';
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={handlePress} style={[styles.habitRow, done && { borderColor: color + '66' }]}>
        <View style={styles.habitLeft}>
          <View style={[styles.habitIcon, { backgroundColor: color + '20' }]}><Text style={styles.habitIconText}>{habit.icon || '✅'}</Text></View>
          <Text style={[styles.habitName, done && styles.habitNameDone]}>{habit.name}</Text>
        </View>
        <View style={[styles.checkbox, done && { backgroundColor: color, borderColor: color }]}>
          {done ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function StatsScreen({ state, accent, calendarMonth, setCalendarMonth, onOpenDay }) {
  const overall = overallStatsForMonth(state, calendarMonth);
  const monthCells = calendarCells(calendarMonth);
  const days = monthDates(calendarMonth);
  const today = todayKey();
  const isCurrentMonth = calendarMonth.slice(0, 7) === today.slice(0, 7);

  const getDayPercent = (key) => {
    if (key > today) return null;
    const activeHabits = state.habits.filter((habit) => isHabitActiveOnDate(habit, key));
    if (!activeHabits.length) return 0;
    const done = activeHabits.filter((habit) => getCompletion(state, habit.id, key)).length;
    return Math.round((done / activeHabits.length) * 100);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Statistics" subtitle="Your progress and full calendar" />

      <View style={styles.statsGrid}>
        <StatCard label="This month" value={`${overall.percent}%`} />
        <StatCard label="Completed" value={`${overall.completed}`} />
      </View>

      <View style={styles.calendarHeader}>
        <View>
          <Text style={styles.calendarTitle}>{formatDate(calendarMonth, { month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.muted}>Tap any day to inspect its completion level.</Text>
        </View>
        <View style={styles.monthNav}>
          <Pressable style={styles.monthNavButton} onPress={() => setCalendarMonth(addMonths(calendarMonth, -1))}><Text style={styles.monthNavText}>‹</Text></Pressable>
          <Pressable style={[styles.monthNavButton, isCurrentMonth && styles.monthNavButtonDisabled]} onPress={() => setCalendarMonth(today)} disabled={isCurrentMonth}>
            <Text style={styles.monthNavSmall}>Today</Text>
          </Pressable>
          <Pressable style={styles.monthNavButton} onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))}><Text style={styles.monthNavText}>›</Text></Pressable>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarWeekRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <Text key={`${label}-${index}`} style={styles.calendarWeekLabel}>{label}</Text>)}
        </View>
        <View style={styles.calendarGrid}>
          {monthCells.map((key, index) => {
            if (!key) return <View key={`empty-${index}`} style={styles.calendarCell} />;
            const percent = getDayPercent(key);
            const isToday = key === today;
            const activeHabits = state.habits.filter((habit) => isHabitActiveOnDate(habit, key));
            const isFullyDone = percent === 100 && activeHabits.length > 0;
            return (
              <Pressable key={key} style={styles.calendarCell} onPress={() => onOpenDay?.(key)} disabled={key > today}>
                <View style={[
                  styles.calendarDay,
                  percent !== null && { backgroundColor: `${accent}${Math.max(18, Math.min(68, Math.round(percent * 0.68 + 18)).toString(16).padStart(2, '0'))}` },
                  isFullyDone && { backgroundColor: accent },
                  isToday && { borderColor: '#ffffff', borderWidth: 1.5 },
                ]}>
                  <Text style={[styles.calendarDayText, isFullyDone && styles.calendarDayTextDone]}>{parseKey(key).getDate()}</Text>
                  {percent !== null && <Text style={[styles.calendarDayPercent, isFullyDone && styles.calendarDayTextDone]}>{percent}%</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.calendarLegend}>
          <Text style={styles.muted}>Less</Text>
          {[15, 30, 45, 60].map((opacity, index) => (
            <View key={opacity} style={[styles.legendDot, { backgroundColor: `${accent}${Math.round(opacity * 2.55).toString(16).padStart(2, '0')}` }]} />
          ))}
          <View style={[styles.legendDot, { backgroundColor: accent }]} />
          <Text style={styles.muted}>More</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Last 7 days</Text>
      <View style={styles.chartCard}>
        {weekDates(today).map((key) => {
          const total = state.habits.filter((habit) => isHabitActiveOnDate(habit, key)).length;
          const done = state.habits.filter((habit) => isHabitActiveOnDate(habit, key) && getCompletion(state, habit.id, key)).length;
          const percent = total ? Math.round((done / total) * 100) : 0;
          return (
            <View key={key} style={styles.barColumn}>
              <Text style={styles.barPercent}>{percent}%</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${Math.max(percent, 4)}%`, backgroundColor: accent }]} />
              </View>
              <Text style={styles.barDay}>{formatDate(key, { weekday: 'narrow' })}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Habit consistency</Text>
      {state.habits.map((habit) => {
        const stats = habitStats(state, habit);
        const color = habit.color || accent;
        return (
          <View key={habit.id} style={styles.statHabitCard}>
            <View style={styles.statHabitTop}>
              <View style={styles.habitLeft}>
                <View style={[styles.habitIcon, { backgroundColor: color + '20' }]}><Text style={styles.habitIconText}>{habit.icon || '✅'}</Text></View>
                <View>
                  <Text style={styles.habitName}>{habit.name}</Text>
                  <Text style={styles.muted}>{stats.completed}/{stats.totalDays} days · {stats.streak} day streak</Text>
                </View>
              </View>
              <Text style={[styles.habitPercent, { color }]}>{stats.percent}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${stats.percent}%`, backgroundColor: color }]} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function DayEditorModal({ visible, dateKey, state, accent, onClose, onToggle }) {
  if (!dateKey) return null;
  const habits = state.habits.filter((habit) => isHabitActiveOnDate(habit, dateKey));
  const completed = habits.filter((habit) => getCompletion(state, habit.id, dateKey)).length;
  const percent = habits.length ? Math.round((completed / habits.length) * 100) : 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.dayEditorCard}>
          <View style={styles.dayEditorHeader}>
            <View>
              <Text style={styles.modalTitle}>{formatDate(dateKey, { weekday: 'long' })}</Text>
              <Text style={styles.muted}>{formatDate(dateKey, { month: 'long', day: 'numeric', year: 'numeric' })} · {percent}% complete</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {habits.map((habit) => (
              <HabitCheckRow key={habit.id} habit={habit} done={getCompletion(state, habit.id, dateKey)} onPress={() => onToggle(habit.id, dateKey)} />
            ))}
            {habits.length === 0 && <Text style={styles.muted}>No habits were active on this date.</Text>}
          </ScrollView>
          <Text style={styles.footerHint}>Changes here update the same history used by Statistics.</Text>
        </View>
      </View>
    </Modal>
  );
}

function SettingsScreen({ state, accent, onAdd, onEdit, onDelete, setAccent, notificationsEnabled, setNotificationsEnabled }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Settings" subtitle="Customize your tracker" />

      <Text style={styles.sectionTitle}>Theme color</Text>
      <View style={styles.colorCard}>
        <Text style={styles.muted}>Pick the accent used across the app.</Text>
        <View style={styles.colorGrid}>
          {ACCENT_COLORS.map((item) => {
            const active = accent === item.value;
            return (
              <Pressable key={item.value} onPress={() => setAccent(item.value)} style={[styles.colorOption, active && { borderColor: item.value }]}>
                <View style={[styles.colorSwatch, { backgroundColor: item.value }, active && styles.colorSwatchActive]}>
                  {active ? <Text style={styles.colorCheck}>✓</Text> : null}
                </View>
                <Text style={styles.colorName}>{item.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Reminders</Text>
      <View style={styles.settingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.habitName}>11:55 PM daily reminder</Text>
          <Text style={styles.muted}>Get a notification to finish today's checklist.</Text>
        </View>
        <Pressable onPress={() => setNotificationsEnabled(!notificationsEnabled)} style={[styles.toggle, notificationsEnabled && { backgroundColor: accent }]}>
          <View style={[styles.toggleKnob, notificationsEnabled && { transform: [{ translateX: 20 }] }]} />
        </Pressable>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Your habits</Text>
        <Pressable onPress={onAdd} style={[styles.smallAddButton, { backgroundColor: accent }]}><Text style={styles.smallAddText}>＋ Add</Text></Pressable>
      </View>

      {state.habits.filter((habit) => !habit.deletedAt).length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No habits yet</Text>
          <Text style={styles.muted}>Add a habit to start tracking.</Text>
        </View>
      )}

      {state.habits.filter((habit) => !habit.deletedAt).map((habit) => (
        <View key={habit.id} style={styles.manageRow}>
          <View style={styles.habitLeft}>
            <View style={[styles.habitIcon, { backgroundColor: (habit.color || accent) + '20' }]}><Text style={styles.habitIconText}>{habit.icon || '✅'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.habitName}>{habit.name}</Text>
              <Text style={styles.muted}>Tracking since {formatDate(habit.createdAt, { month: 'short', day: 'numeric' })}</Text>
            </View>
          </View>
          <View style={styles.manageActions}>
            <Pressable onPress={() => onEdit(habit)} style={styles.editButton}><Text style={[styles.editButtonText, { color: accent }]}>Edit</Text></Pressable>
            <Pressable onPress={() => onDelete(habit.id)} style={styles.deleteButton}><Text style={styles.deleteText}>Delete</Text></Pressable>
          </View>
        </View>
      ))}

      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Tracker behavior</Text>
        <Text style={styles.infoText}>• The Today page shows only today. Past days are edited from Statistics.</Text>
        <Text style={styles.infoText}>• Statistics contains the full calendar for any month you want to inspect.</Text>
        <Text style={styles.infoText}>• Adding a habit starts it today; deleting it archives the past instead of erasing history.</Text>
        <Text style={styles.infoText}>• Everything is stored locally on your Android device.</Text>
      </View>
    </ScrollView>
  );
}

function HabitModal({ visible, editing, draft, setDraft, accent, onClose, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{editing ? 'Edit habit' : 'Add habit'}</Text>
          <TextInput
            autoFocus
            value={draft.name}
            onChangeText={(name) => setDraft((previous) => ({ ...previous, name }))}
            placeholder="e.g. Study 45 minutes"
            placeholderTextColor="#626979"
            style={styles.input}
          />

          <Text style={styles.modalLabel}>Icon</Text>
          <TextInput
            value={draft.icon}
            onChangeText={(icon) => setDraft((previous) => ({ ...previous, icon }))}
            placeholder="✅"
            placeholderTextColor="#626979"
            style={styles.input}
            maxLength={4}
          />

          <Text style={styles.modalLabel}>Habit color</Text>
          <View style={styles.modalColors}>
            {ACCENT_COLORS.map((item) => {
              const active = draft.color === item.value;
              return (
                <Pressable key={item.value} onPress={() => setDraft((previous) => ({ ...previous, color: item.value }))} style={[styles.modalColor, { backgroundColor: item.value }, active && styles.modalColorActive]}>
                  {active ? <Text style={styles.colorCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onSave} style={[styles.primaryButton, { backgroundColor: draft.color || accent }]}>
              <Text style={styles.primaryButtonText}>{editing ? 'Save changes' : 'Add habit'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050608' },
  appShell: { flex: 1, backgroundColor: '#050608' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050608' },
  loading: { color: '#ffffff', fontSize: 16 },
  scrollContent: { padding: 20, paddingBottom: 122 },
  header: { marginBottom: 20, paddingTop: 8 },
  appTitle: { color: '#ffffff', fontSize: 31, fontWeight: '800', letterSpacing: -0.9 },
  headerSubtitle: { color: '#747985', fontSize: 14, marginTop: 5 },






  progressCard: { backgroundColor: '#0d0f12', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#1d2026', marginBottom: 24, shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  muted: { color: '#747985', fontSize: 12, marginTop: 5 },
  bigPercent: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: '#24272d', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  closedHint: { color: '#606670', fontSize: 12 },
  habitRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#0d0f12', borderRadius: 18, borderWidth: 1, borderColor: '#1b1e24', marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  habitIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  habitIconText: { fontSize: 20 },
  habitName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  habitNameDone: { color: '#666c76', textDecorationLine: 'line-through' },
  checkbox: { width: 30, height: 30, borderRadius: 10, borderWidth: 2, borderColor: '#454951', alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  footerHint: { color: '#555a63', fontSize: 11, lineHeight: 16, marginTop: 12 },
  emptyCard: { padding: 20, borderRadius: 18, backgroundColor: '#0d0f12', borderWidth: 1, borderColor: '#1b1e24', marginBottom: 10 },
  emptyTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  tabBar: { position: 'absolute', left: 14, right: 14, bottom: 14, height: 72, backgroundColor: '#0e1013', borderRadius: 24, borderWidth: 1, borderColor: '#23262d', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { color: '#5e646f', fontSize: 22 },
  tabLabel: { color: '#5e646f', fontSize: 11, marginTop: 3, fontWeight: '700' },
  tabLabelActive: { color: '#ffffff' },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  statCard: { flex: 1, backgroundColor: '#0d0f12', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#1c1f25' },
  statValue: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calendarTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthNavButton: { height: 34, minWidth: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: '#121419', borderWidth: 1, borderColor: '#20242b', alignItems: 'center', justifyContent: 'center' },
  monthNavButtonDisabled: { opacity: 0.5 },
  monthNavText: { color: '#ffffff', fontSize: 24, lineHeight: 26 },
  monthNavSmall: { color: '#d5d8df', fontSize: 11, fontWeight: '700' },
  calendarCard: { backgroundColor: '#0d0f12', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: '#1d2026', marginBottom: 24 },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 9 },
  calendarWeekLabel: { width: '14.2857%', textAlign: 'center', color: '#5f646d', fontSize: 10, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.2857%', height: 52, alignItems: 'center', justifyContent: 'center' },
  calendarDay: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#181b20' },
  calendarDayText: { color: '#cfd2d8', fontSize: 12, fontWeight: '800' },
  calendarDayPercent: { color: '#8f949d', fontSize: 8, marginTop: 2, fontWeight: '700' },
  calendarDayTextDone: { color: '#ffffff' },
  calendarLegend: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  legendDot: { width: 11, height: 11, borderRadius: 4 },
  chartCard: { height: 210, backgroundColor: '#0d0f12', borderRadius: 22, borderWidth: 1, borderColor: '#1d2026', padding: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barPercent: { color: '#9ba0a8', fontSize: 10, marginBottom: 5 },
  barTrack: { width: 16, height: 115, backgroundColor: '#22252b', borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 10 },
  barDay: { color: '#747a84', fontSize: 11, marginTop: 7 },
  statHabitCard: { padding: 16, borderRadius: 18, backgroundColor: '#0d0f12', borderWidth: 1, borderColor: '#1d2026', marginBottom: 10 },
  statHabitTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitPercent: { fontSize: 20, fontWeight: '900', marginLeft: 12 },
  colorCard: { backgroundColor: '#0d0f12', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#1d2026', marginBottom: 24 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  colorOption: { width: '30%', minWidth: 92, borderWidth: 1, borderColor: '#242830', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  colorSwatch: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 2, borderColor: '#ffffff' },
  colorCheck: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  colorName: { color: '#c4c7cd', fontSize: 10, marginTop: 6, fontWeight: '700' },
  smallAddButton: { height: 36, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  smallAddText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  manageRow: { minHeight: 74, padding: 12, borderRadius: 18, backgroundColor: '#0d0f12', borderWidth: 1, borderColor: '#1d2026', marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manageActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  editButton: { padding: 8 },
  editButtonText: { fontSize: 12, fontWeight: '800' },
  deleteButton: { padding: 8 },
  deleteText: { color: '#ff6a6a', fontSize: 12, fontWeight: '700' },
  settingRow: { minHeight: 72, padding: 14, borderRadius: 18, backgroundColor: '#0d0f12', borderWidth: 1, borderColor: '#1d2026', marginBottom: 24, flexDirection: 'row', alignItems: 'center' },
  toggle: { width: 46, height: 28, borderRadius: 15, backgroundColor: '#2a2d33', padding: 3, justifyContent: 'center' },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff' },
  dayEditorCard: { maxHeight: '82%', backgroundColor: '#0e1013', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderWidth: 1, borderColor: '#262a31' },
  dayEditorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1d2026', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#ffffff', fontSize: 28, lineHeight: 30 },
  infoCard: { marginTop: 12, padding: 18, borderRadius: 20, backgroundColor: '#0a0c0f', borderWidth: 1, borderColor: '#1d2026' },
  infoText: { color: '#858a93', fontSize: 12, lineHeight: 18, marginTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0e1013', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderWidth: 1, borderColor: '#262a31' },
  modalTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginBottom: 14 },
  modalLabel: { color: '#a0a5ad', fontSize: 11, fontWeight: '800', marginTop: 14, marginBottom: 7 },
  input: { height: 52, borderRadius: 16, backgroundColor: '#080a0c', borderWidth: 1, borderColor: '#262a31', color: '#ffffff', paddingHorizontal: 15, fontSize: 15 },
  modalColors: { flexDirection: 'row', gap: 10, marginTop: 5 },
  modalColor: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalColorActive: { borderWidth: 2, borderColor: '#ffffff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: { flex: 1, height: 50, borderRadius: 15, backgroundColor: '#22252b', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#ffffff', fontWeight: '700' },
  primaryButton: { flex: 1, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
});
