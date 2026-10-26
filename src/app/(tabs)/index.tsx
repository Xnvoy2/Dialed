import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  DayKey,
  formatDayLong,
  formatDayShort,
  startOfWeek,
  weekDays,
  weekdayInitial,
} from '../../domain/dates';
import { formatCountdown, formatMinutes, remainingMs } from '../../domain/focus';
import { describeSchedule, isDueOn, weeklyCount } from '../../domain/habits';
import { arcProgress } from '../../domain/arc';
import { insight } from '../../domain/insight';
import { willBlock } from '../../domain/lockin';
import { focusStreak } from '../../domain/streaks';
import { checkIn, histories, listHabits, undoCheckIn } from '../../repos/habits';
import { focusDays, focusSecondsByDay, focusSecondsForTask, getOpenSession } from '../../repos/sessions';
import {
  Task,
  deleteTask,
  moveTask,
  moveTasksToDay,
  setTaskCompleted,
  tasksForDay,
  unfinishedBefore,
} from '../../repos/tasks';
import { useApp, useNow, useQuery } from '../../state/AppProvider';
import {
  Card,
  CheckCircle,
  EmptyState,
  IconButton,
  IconName,
  PillMeter,
  ProgressBar,
  Ring,
  RingIcon,
  Row,
  SectionHeader,
  SmallButton,
  T,
  Tiles,
} from '../../ui/components';
import { useBlockingReadiness } from '../../ui/BlockingCard';
import { useHaptics } from '../../ui/haptics';
import { RollingNumber } from '../../ui/RollingNumber';
import { Screen } from '../../ui/Screen';
import { SIDE, TILE_GAP, colors, radius, space } from '../../ui/theme';

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const { db, today, prefs, refresh } = useApp();
  const haptics = useHaptics();
  const [reordering, setReordering] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const tasks = useQuery((d, t) => tasksForDay(d, t));
  const carry = useQuery((d, t) => unfinishedBefore(d, t));
  const focusedToday = useQuery((d, t) => focusSecondsByDay(d, t, t).get(t) ?? 0);
  const taskFocus = useQuery((d) => new Map(tasks.map((x) => [x.id, focusSecondsForTask(d, x.id)])), [tasks]);
  const open = useQuery((d) => getOpenSession(d));
  const days = useQuery((d) => focusDays(d));
  const habitsToday = useQuery(
    (d, t) => {
      const all = listHabits(d);
      const h = histories(d, all.map((x) => x.id));
      return all
        .map((habit) => ({ habit, history: h.get(habit.id)! }))
        .filter(({ habit, history }) => isDueOn(habit, history, t, prefs.weekStart));
    },
    [prefs.weekStart],
  );

  const openTasks = tasks.filter((t) => !t.completedAt);
  const doneTasks = tasks.filter((t) => t.completedAt);
  const habitsDone = habitsToday.filter(({ history }) => history.checkins.has(today)).length;
  const next = openTasks[0];

  const toggleTask = (t: Task) => {
    setTaskCompleted(db, t.id, !t.completedAt);
    t.completedAt ? haptics.select() : haptics.success();
    refresh();
  };

  const newTask = () => router.push({ pathname: '/task/[id]', params: { id: 'new' } });

  const taskMenu = (t: Task) => {
    const actions: [string, () => void, boolean?][] = [
      ['Edit', () => router.push({ pathname: '/task/[id]', params: { id: t.id } })],
      ['Focus on this', () => router.push({ pathname: '/focus', params: { taskId: t.id } })],
      ['Reorder tasks', () => setReordering(true)],
      [
        'Delete',
        () =>
          Alert.alert('Delete task?', `“${t.title}” will be removed. Focus history keeps its title.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => (deleteTask(db, t.id), refresh()) },
          ]),
        true,
      ],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t.title,
          options: [...actions.map((a) => a[0]), 'Cancel'],
          destructiveButtonIndex: actions.findIndex((a) => a[2]),
          cancelButtonIndex: actions.length,
          userInterfaceStyle: 'dark',
        },
        (i) => actions[i]?.[1](),
      );
    } else {
      Alert.alert(t.title, undefined, [...actions.map(([text, onPress]) => ({ text, onPress })), { text: 'Cancel', style: 'cancel' }]);
    }
  };

  return (
    <Screen backdrop="today" title="Today" subtitle={`${greeting(new Date().getHours())} · ${formatDayLong(today)}`}>
      <View style={{ gap: TILE_GAP }}>
        {open ? <ActiveSessionBanner /> : null}

        <InsightCard
          taskId={next?.id ?? null}
          focusedMinutes={Math.floor(focusedToday / 60)}
          habitsDone={habitsDone}
          habitsTotal={habitsToday.length}
          openTasks={openTasks.length}
          streak={focusStreak(days, today).current}
          locked={!!open}
        />

        <SummaryCard
          focusedMinutes={Math.floor(focusedToday / 60)}
          tasksDone={doneTasks.length}
          tasksTotal={tasks.length}
          habitsDone={habitsDone}
          habitsTotal={habitsToday.length}
        />

        <ArcCard />

        <FocusWeekCard days={days} />

        {next && !open ? (
          <NextUpTile task={next} focusedSeconds={taskFocus.get(next.id) ?? 0} remaining={openTasks.length} />
        ) : null}
      </View>

      {carry.length > 0 ? (
        <>
          <SectionHeader
            title="From earlier"
            action={carry.length > 1 ? 'Move all' : undefined}
            onAction={() => {
              moveTasksToDay(db, carry.map((t) => t.id), today);
              haptics.select();
              refresh();
            }}
          />
          <Tiles>
            {carry.map((t) => (
              <Row
                key={t.id}
                title={t.title}
                subtitle={`Planned ${formatDayShort(t.day)}`}
                leading={<CheckCircle checked={false} onPress={() => toggleTask(t)} label={`Complete ${t.title}`} />}
                trailing={
                  <SmallButton
                    title="Today"
                    icon="arrow-down"
                    onPress={() => {
                      moveTasksToDay(db, [t.id], today);
                      haptics.select();
                      refresh();
                    }}
                  />
                }
                onLongPress={() => taskMenu(t)}
              />
            ))}
          </Tiles>
        </>
      ) : null}

      <SectionHeader
        title="Plan"
        action={reordering ? 'Done' : 'Add'}
        onAction={reordering ? () => setReordering(false) : newTask}
      />
      {openTasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={doneTasks.length ? 'checkmark-done-outline' : 'list-outline'}
            title={doneTasks.length ? 'Everything planned is done' : 'Nothing planned yet'}
            body={doneTasks.length ? 'Add another task or take the win.' : 'Add what you want to get done today, or just start focusing.'}
            actions={
              <>
                <SmallButton title="Add a task" icon="add" onPress={newTask} />
                <SmallButton title="Just focus" icon="timer-outline" onPress={() => router.push('/focus')} />
              </>
            }
          />
        </Card>
      ) : (
        <Tiles>
          {openTasks.map((t, i) => (
            <Row
              key={t.id}
              title={t.title}
              subtitle={taskSubtitle(t, taskFocus.get(t.id) ?? 0)}
              leading={<CheckCircle checked={false} onPress={() => toggleTask(t)} label={`Complete ${t.title}`} />}
              onPress={reordering ? undefined : () => router.push({ pathname: '/task/[id]', params: { id: t.id } })}
              onLongPress={reordering ? undefined : () => taskMenu(t)}
              accessibilityHint="Opens the task. Long press for more actions."
              trailing={
                reordering ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <IconButton
                      name="chevron-up"
                      label={`Move ${t.title} up`}
                      size={36}
                      onPress={() => (i > 0 ? (moveTask(db, t.id, -1), haptics.select(), refresh()) : undefined)}
                      style={i === 0 ? { opacity: 0.3 } : undefined}
                    />
                    <IconButton
                      name="chevron-down"
                      label={`Move ${t.title} down`}
                      size={36}
                      onPress={() =>
                        i < openTasks.length - 1 ? (moveTask(db, t.id, 1), haptics.select(), refresh()) : undefined
                      }
                      style={i === openTasks.length - 1 ? { opacity: 0.3 } : undefined}
                    />
                  </View>
                ) : (
                  <IconButton
                    name="play"
                    label={`Focus on ${t.title}`}
                    size={36}
                    onPress={() => router.push({ pathname: '/focus', params: { taskId: t.id } })}
                  />
                )
              }
            />
          ))}
        </Tiles>
      )}

      {doneTasks.length > 0 ? (
        <Pressable
          onPress={() => setShowDone((s) => !s)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDone }}
          style={styles.doneToggle}
        >
          <T v="subhead" color={colors.secondary}>
            Done · {doneTasks.length}
          </T>
          <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={14} color={colors.secondary} />
        </Pressable>
      ) : null}
      {showDone && doneTasks.length > 0 ? (
        <Tiles>
          {doneTasks.map((t) => (
            <Row
              key={t.id}
              title={t.title}
              muted
              subtitle={taskSubtitle(t, taskFocus.get(t.id) ?? 0)}
              leading={<CheckCircle checked onPress={() => toggleTask(t)} label={`Mark ${t.title} not done`} />}
              onLongPress={() => taskMenu(t)}
            />
          ))}
        </Tiles>
      ) : null}

      <SectionHeader title="Habits" action="All" onAction={() => router.navigate('/habits')} />
      {habitsToday.length === 0 ? (
        <Card>
          <EmptyState
            icon="repeat-outline"
            title="No habits scheduled today"
            body="Habits you schedule for today show up here."
            actions={
              <SmallButton
                title="Create a habit"
                icon="add"
                onPress={() => router.push({ pathname: '/habit/edit/[id]', params: { id: 'new' } })}
              />
            }
          />
        </Card>
      ) : (
        <Tiles>
          {habitsToday.map(({ habit, history }) => {
            const done = history.checkins.has(today);
            const sub =
              habit.frequency === 'weekly'
                ? `${weeklyCount(history, startOfWeek(today, prefs.weekStart))} of ${habit.weeklyTarget} this week`
                : describeSchedule(habit);
            return (
              <Row
                key={habit.id}
                title={habit.name}
                subtitle={sub}
                muted={done}
                leading={
                  <CheckCircle
                    checked={done}
                    label={done ? `Undo ${habit.name} check-in` : `Check in ${habit.name}`}
                    onPress={() => {
                      if (done) {
                        undoCheckIn(db, habit.id, today);
                        haptics.select();
                      } else {
                        checkIn(db, habit.id, today, today);
                        haptics.success();
                      }
                      refresh();
                    }}
                  />
                }
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
                chevron
              />
            );
          })}
        </Tiles>
      )}
    </Screen>
  );
}

function taskSubtitle(t: Task, focusedSeconds: number): string | null {
  const parts: string[] = [];
  if (t.estimateMinutes) parts.push(`~${formatMinutes(t.estimateMinutes * 60)}`);
  if (focusedSeconds >= 60) parts.push(`${formatMinutes(focusedSeconds)} focused`);
  if (t.notes) parts.push(t.notes.split('\n')[0]);
  return parts.length ? parts.join(' · ') : null;
}

/** Days this week with at least a minute of focus, plus the current and best streak. */
function FocusWeekCard({ days }: { days: ReadonlySet<DayKey> }) {
  const { today, prefs } = useApp();
  const week = weekDays(startOfWeek(today, prefs.weekStart));
  const { current, best } = focusStreak(days, today);
  return (
    <Card onPress={() => router.navigate('/progress')} accessibilityLabel={`Focus streak ${current} days, best ${best}. Opens progress.`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.m }}>
        <T v="headline" style={{ flex: 1 }}>
          {current > 0 ? `${current}-day focus streak` : 'No focus streak yet'}
        </T>
        <T v="subhead" color={colors.secondary}>
          Best {best}
        </T>
        <Ionicons name="chevron-forward" size={14} color={colors.secondary} style={{ marginLeft: 2 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {week.map((d) => {
          const hit = days.has(d);
          const isToday = d === today;
          const future = d > today;
          return (
            <View key={d} style={{ alignItems: 'center', gap: 6 }}>
              <T v="caption" color={isToday ? colors.text : colors.tertiary} style={isToday ? { fontWeight: '700' } : undefined}>
                {weekdayInitial(d)}
              </T>
              <View
                style={[
                  styles.dayDot,
                  hit && { backgroundColor: colors.text },
                  !hit && !future && !isToday && { backgroundColor: colors.track },
                  !hit && isToday && { borderWidth: 2, borderColor: colors.text },
                  future && { borderWidth: 1, borderColor: colors.border },
                ]}
              >
                {hit ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function NextUpTile({ task, focusedSeconds, remaining }: { task: Task; focusedSeconds: number; remaining: number }) {
  const est = task.estimateMinutes ? task.estimateMinutes * 60 : 0;
  const progress = est ? Math.min(1, focusedSeconds / est) : 0;
  return (
    <Card
      onPress={() => router.push({ pathname: '/focus', params: { taskId: task.id } })}
      accessibilityLabel={`Next up: ${task.title}. Start focusing.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}
    >
      <RingIcon name="play" progress={progress} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row' }}>
          <T v="footnote" color={colors.secondary} style={{ flex: 1 }}>
            Next up
          </T>
          <T v="footnote" color={colors.secondary}>
            {est ? `${Math.floor(focusedSeconds / 60)} of ${task.estimateMinutes} min` : `${remaining} open`}
          </T>
        </View>
        <T v="headline" numberOfLines={1}>
          {task.title}
        </T>
        {est ? (
          <View style={{ marginTop: 6 }}>
            <ProgressBar progress={progress} />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
    </Card>
  );
}

function ArcCard() {
  const { prefs, today } = useApp();
  if (!prefs.arcStart) {
    return (
      <Card
        onPress={() => router.push({ pathname: '/onboarding', params: { redo: '1' } })}
        accessibilityLabel="Set up your arc"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T v="headline">Set up your arc</T>
          <T v="footnote" color={colors.secondary}>
            Tell Dialed what you want to quit and build. It sets up the rest.
          </T>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
      </Card>
    );
  }
  const p = arcProgress(prefs.arcStart, prefs.arcDays, today);
  return (
    <Card
      onPress={() => router.navigate('/habits')}
      accessibilityLabel={`${p.done ? 'Arc complete' : `Day ${p.day} of ${p.length}`}. Opens habits.`}
      style={{ gap: space.s }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <T v="footnote" color={colors.secondary} style={{ flex: 1 }}>
          {prefs.arcDays >= 90 ? 'Winter arc' : `${prefs.arcDays}-day arc`}
        </T>
        <T v="footnote" color={colors.secondary}>
          {p.done ? 'Complete' : `${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left`}
        </T>
      </View>
      <T v="title2" style={{ fontVariant: ['tabular-nums'] }}>
        {p.done ? 'You finished your arc' : `Day ${p.day} of ${p.length}`}
      </T>
      <ProgressBar progress={p.day / p.length} height={6} />
      {prefs.why ? (
        <T v="footnote" color={colors.secondary} numberOfLines={2}>
          “{prefs.why}”
        </T>
      ) : null}
    </Card>
  );
}

/**
 * The centrepiece, after the reference: one sentence about the real day in
 * two tones, refracting the glass shapes behind it, with the Lock in button.
 */
function InsightCard(p: {
  taskId: string | null;
  focusedMinutes: number;
  habitsDone: number;
  habitsTotal: number;
  openTasks: number;
  streak: number;
  locked: boolean;
}) {
  const { prefs, today } = useApp();
  const r = useBlockingReadiness();
  const arc = prefs.arcStart ? arcProgress(prefs.arcStart, prefs.arcDays, today) : null;
  const segs = insight({
    hour: new Date().getHours(),
    arcDay: arc && !arc.done ? arc.day : null,
    arcLength: arc ? arc.length : null,
    focusedMinutes: p.focusedMinutes,
    focusMinutesDefault: prefs.focusMinutes,
    habitsDone: p.habitsDone,
    habitsTotal: p.habitsTotal,
    openTasks: p.openTasks,
    streak: p.streak,
  });
  const blockNote = willBlock(r)
    ? `Blocks ${r.kind === 'ready' ? r.count : 0} apps`
    : r.kind === 'unavailable'
      ? `${prefs.focusMinutes} min`
      : 'Set up blocking';
  return (
    <Card style={{ padding: space.xl, paddingTop: space.xxl, minHeight: 340, justifyContent: 'space-between' }}>
      <T v="hero" accessibilityRole="header" accessibilityLabel={segs.map((x) => x.text).join(' ')}>
        {segs.map((x, i) => (
          <T key={i} v="hero" color={x.dim ? 'rgba(255,255,255,0.46)' : colors.text}>
            {i > 0 ? ' ' : ''}
            {x.text}
          </T>
        ))}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: space.xl }}>
        <Pressable
          onPress={() => router.navigate('/habits')}
          accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, flex: 1 }, pressed && { opacity: 0.6 }]}
        >
          <T v="callout" style={{ fontWeight: '600' }}>
            {prefs.why ? 'Your why' : 'Your arc'}
          </T>
          <Ionicons name="chevron-forward" size={15} color={colors.text} />
        </Pressable>
        {!p.locked ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Pressable
              onPress={() => router.push(p.taskId ? { pathname: '/focus', params: { taskId: p.taskId } } : '/focus')}
              accessibilityRole="button"
              accessibilityLabel={`Lock in. ${blockNote}`}
              style={({ pressed }) => [styles.lockCircle, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <Ionicons name="lock-closed" size={30} color={colors.onPrimary} />
            </Pressable>
            <T v="caption" color={colors.secondary}>
              {blockNote}
            </T>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function SummaryCard(p: { focusedMinutes: number; tasksDone: number; tasksTotal: number; habitsDone: number; habitsTotal: number }) {
  const stats: [IconName, number, string, string][] = [
    ['timer-outline', p.focusedMinutes, 'min', 'Focus'],
    ['checkmark-done-outline', p.tasksDone, `/${p.tasksTotal}`, 'Tasks'],
    ['repeat-outline', p.habitsDone, `/${p.habitsTotal}`, 'Habits'],
  ];
  return (
    <Card onPress={() => router.navigate('/progress')} accessibilityLabel="Summary. Opens progress." style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T v="footnote" color={colors.secondary} style={{ flex: 1 }}>
          Summary
        </T>
        <Ionicons name="chevron-forward" size={14} color={colors.secondary} />
      </View>
      <View style={styles.summaryInner}>
        {stats.map(([icon, v, unit, label]) => (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <RollingNumber value={v} v="title" />
              <T v="caption" color={colors.tertiary}>
                {unit}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.statDot}>
                <Ionicons name={icon} size={11} color={colors.onPrimary} />
              </View>
              <T v="footnote">{label}</T>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ActiveSessionBanner() {
  const session = useQuery((d) => getOpenSession(d));
  const now = useNow(1000, session?.status === 'running');
  if (!session) return null;
  const label = session.kind === 'break' ? 'Break' : session.taskTitle ?? 'Focus';
  const left = formatCountdown(remainingMs(session, now));
  return (
    <Pressable
      onPress={() => router.push('/focus')}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${session.status === 'paused' ? 'paused' : `${left} left`}. Open timer.`}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.bannerIcon}>
        <Ionicons name={session.status === 'paused' ? 'pause' : 'hourglass-outline'} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="headline" color={colors.onPrimary} numberOfLines={1}>
          {label}
        </T>
        <T v="footnote" color="#46464B">
          {session.status === 'paused' ? 'Paused' : session.kind === 'break' ? 'On a break' : 'Focusing now'}
        </T>
      </View>
      <View style={styles.bannerPill}>
        <T v="subhead" color={colors.onPrimary} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {left}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInner: {
    flexDirection: 'row',
    padding: space.l,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  statDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIn: {
    marginHorizontal: SIDE - 4,
    paddingVertical: space.l,
    paddingHorizontal: space.l,
    borderRadius: radius.l,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  lockInIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    marginHorizontal: SIDE - 4,
    padding: space.m,
    borderRadius: radius.l,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPill: {
    paddingHorizontal: space.m,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  doneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIDE,
    paddingTop: space.l,
    paddingBottom: space.s,
    minHeight: 44,
  },
});
