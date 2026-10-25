import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatClock } from '../domain/dates';
import {
  FOCUS_PRESETS,
  activeMs,
  formatCountdown,
  formatMinutes,
  projectedEndAt,
  remainingMs,
} from '../domain/focus';
import { blocking } from '../native/blocking';
import { describeSelection, selectionCount } from '../native/blocking/types';
import { requestNotificationPermission } from '../native/notifications';
import { FocusSession, SessionConflictError, getOpenSession, getSession, setSessionNote } from '../repos/sessions';
import { getTask, setTaskCompleted, tasksForDay } from '../repos/tasks';
import { useApp, useNow, useQuery } from '../state/AppProvider';
import { useFocusActions } from '../state/focusActions';
import {
  Button,
  CheckCircle,
  Chip,
  FadeEdge,
  Group,
  IconButton,
  Note,
  Ring,
  Row,
  T,
  Tiles,
  ToggleRow,
} from '../ui/components';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SIDE, colors, radius, space } from '../ui/theme';

export default function FocusScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { db, justCompletedId, clearJustCompleted } = useApp();
  const open = useQuery((d) => getOpenSession(d));
  const [finishedId, setFinishedId] = useState<string | null>(null);

  // A session that finished while the app was closed gets its completion step here.
  useEffect(() => {
    if (!open && justCompletedId && !finishedId) {
      setFinishedId(justCompletedId);
      clearJustCompleted();
    }
  }, [open, justCompletedId, finishedId, clearJustCompleted]);

  const finished = finishedId ? getSession(db, finishedId) : null;

  if (open) return <ActiveSession session={open} onFinished={setFinishedId} />;
  if (finished) return <Completion session={finished} onReset={() => setFinishedId(null)} />;
  return <Setup initialTaskId={taskId ?? null} />;
}

// ---------------------------------------------------------------- Setup

function Setup({ initialTaskId }: { initialTaskId: string | null }) {
  const insets = useSafeAreaInsets();
  const { prefs, setPrefs, version } = useApp();
  const actions = useFocusActions();
  const tasks = useQuery((d, t) => tasksForDay(d, t).filter((x) => !x.completedAt));
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [minutes, setMinutes] = useState(prefs.focusMinutes);
  const [starting, setStarting] = useState(false);
  // Re-read on every data change (e.g. returning from blocking settings).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avail = React.useMemo(() => blocking.availability(), [version]);

  const start = async () => {
    setStarting(true);
    try {
      await actions.start({ kind: 'focus', minutes, taskId });
    } catch (e) {
      if (e instanceof SessionConflictError) Alert.alert('A session is already running', 'End it before starting another.');
      else Alert.alert('Couldn’t start', String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      <TopBar onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={{ paddingHorizontal: SIDE, marginBottom: space.xl }}>
          <T v="largeTitle" accessibilityRole="header">
            Focus
          </T>
        </View>

        <View style={styles.durationBlock}>
          <View
            style={styles.durationRow}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Focus length"
            accessibilityValue={{ text: `${minutes} minutes` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) =>
              setMinutes((m) => (e.nativeEvent.actionName === 'increment' ? Math.min(180, m + 5) : Math.max(5, m - 5)))
            }
          >
            <IconButton name="remove" label="Five minutes less" size={48} onPress={() => setMinutes((m) => Math.max(5, m - 5))} />
            <View style={{ alignItems: 'center', minWidth: 150 }}>
              <T v="timer">{minutes}</T>
              <T v="subhead" color={colors.secondary} style={{ marginTop: -6 }}>
                minutes
              </T>
            </View>
            <IconButton name="add" label="Five minutes more" size={48} onPress={() => setMinutes((m) => Math.min(180, m + 5))} />
          </View>
          <View style={styles.chips}>
            {FOCUS_PRESETS.map((m) => (
              <Chip key={m} label={`${m}`} accessibilityLabel={`${m} minutes`} selected={minutes === m} onPress={() => setMinutes(m)} />
            ))}
          </View>
        </View>

        <T v="headline" style={styles.label}>
          Working on
        </T>
        <Group>
          <Row
            title="No particular task"
            leading={<CheckCircle checked={taskId === null} onPress={() => setTaskId(null)} label="No particular task" />}
            onPress={() => setTaskId(null)}
          />
          {tasks.map((t) => (
            <Row
              key={t.id}
              title={t.title}
              subtitle={t.estimateMinutes ? `~${formatMinutes(t.estimateMinutes * 60)}` : null}
              leading={<CheckCircle checked={taskId === t.id} onPress={() => setTaskId(t.id)} label={t.title} />}
              onPress={() => setTaskId(t.id)}
            />
          ))}
        </Group>

        <T v="headline" style={styles.label}>
          While focusing
        </T>
        <Group>
          {avail.state === 'approved' && selectionCount(avail.selection) > 0 ? (
            <ToggleRow
              title="Block selected apps"
              subtitle={describeSelection(avail.selection)}
              value={prefs.blockingEnabled}
              onChange={(v) => setPrefs({ blockingEnabled: v })}
            />
          ) : (
            <Row
              icon="lock-closed-outline"
              title="App blocking"
              subtitle={
                avail.state === 'unsupported'
                  ? `Unavailable. ${avail.reason}`
                  : avail.state === 'denied'
                    ? 'Screen Time access is off'
                    : avail.state === 'not_determined'
                      ? 'Not set up'
                      : 'No apps chosen yet'
              }
              chevron={avail.state !== 'unsupported'}
              onPress={avail.state === 'unsupported' ? undefined : () => router.push('/settings/blocking')}
            />
          )}
          {!prefs.notificationsAsked ? (
            <ToggleRow
              title="Notify me when time’s up"
              subtitle="Useful if you leave the app. We’ll ask iOS for permission."
              value={false}
              onChange={async (v) => {
                if (!v) return;
                const p = await requestNotificationPermission();
                setPrefs({ notificationsAsked: true, notifyOnSessionEnd: p === 'granted' });
              }}
            />
          ) : (
            <ToggleRow
              title="Notify me when time’s up"
              value={prefs.notifyOnSessionEnd}
              onChange={async (v) => {
                if (v && (await requestNotificationPermission()) !== 'granted') {
                  Alert.alert('Notifications are off', 'Turn them on for this app in iOS Settings.');
                  return;
                }
                setPrefs({ notifyOnSessionEnd: v });
              }}
            />
          )}
        </Group>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.m }]}>
        <FadeEdge />
        <Button title={`Start ${minutes} min`} icon="play" onPress={start} loading={starting} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Active

function ActiveSession({ session, onFinished }: { session: FocusSession; onFinished: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const actions = useFocusActions();
  const running = session.status === 'running';
  const now = useNow(250, running);
  const left = remainingMs(session, now);
  const progress = activeMs(session, now) / (session.plannedSeconds * 1000);
  const endAt = projectedEndAt(session);
  const finishing = useRef(false);

  useEffect(() => {
    if (running && left <= 0 && !finishing.current) {
      finishing.current = true;
      actions.reconcile().then((done) => {
        finishing.current = false;
        if (done) onFinished(done.id);
      });
    }
  }, [running, left, actions, onFinished]);

  const endEarly = () => {
    const mins = Math.floor(activeMs(session, Date.now()) / 60000);
    Alert.alert(
      session.kind === 'break' ? 'End break?' : 'End session early?',
      session.kind === 'break' ? undefined : `${mins} min of focus will be recorded.`,
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            const s = await actions.end(session.id);
            if (s) onFinished(s.id);
            else router.back();
          },
        },
      ],
    );
  };

  const label = session.kind === 'break' ? 'Break' : session.taskTitle ?? 'Focus';
  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <TopBar onClose={() => router.back()} closeIcon="chevron-down" closeLabel="Minimise. The session keeps running." />
      <View style={styles.center}>
        <T v="headline" color={colors.secondary} center numberOfLines={2} style={{ paddingHorizontal: SIDE * 2 }}>
          {label}
        </T>
        <Ring size={296} stroke={5} progress={progress} track={colors.surface} animate={false}>
          <T
            v="timer"
            accessibilityRole="timer"
            accessibilityLabel={`${Math.ceil(left / 60000)} minutes left${running ? '' : ', paused'}`}
          >
            {formatCountdown(left)}
          </T>
          <T v="subhead" color={colors.secondary}>
            {running ? (endAt ? `Ends ${formatClock(endAt)}` : '') : 'Paused'}
          </T>
        </Ring>
        <BlockingStatus session={session} />
      </View>

      <View style={styles.controls}>
        <View style={styles.control}>
          <View style={styles.controlSlot}>
            <IconButton name="stop" label={session.kind === 'break' ? 'End break' : 'End session'} size={64} onPress={endEarly} />
          </View>
          <T v="footnote" color={colors.secondary}>
            End
          </T>
        </View>
        <View style={styles.control}>
          <IconButton
            name={running ? 'pause' : 'play'}
            label={running ? 'Pause' : 'Resume'}
            size={84}
            filled
            onPress={() => (running ? actions.pause(session.id) : actions.resume(session.id))}
          />
          <T v="footnote" color={colors.secondary}>
            {running ? 'Pause' : 'Resume'}
          </T>
        </View>
      </View>
    </View>
  );
}

/** Says "shielded" only when the native layer read the shield back. */
function BlockingStatus({ session }: { session: FocusSession }) {
  if (session.kind !== 'focus' || !session.blockingRequested) return <View style={{ height: 24 }} />;
  let text: string;
  let icon: React.ComponentProps<typeof Ionicons>['name'];
  if (session.status === 'paused') {
    text = 'Apps unlocked while paused';
    icon = 'lock-open-outline';
  } else if (session.blockingApplied) {
    text = 'Selected apps are shielded';
    icon = 'lock-closed-outline';
  } else {
    text = 'App blocking couldn’t be applied';
    icon = 'alert-circle-outline';
  }
  return (
    <View style={styles.blockStatus} accessible accessibilityLabel={text}>
      <Ionicons name={icon} size={15} color={colors.secondary} />
      <T v="footnote" color={colors.secondary}>
        {text}
      </T>
    </View>
  );
}

// ---------------------------------------------------------------- Completion

function Completion({ session, onReset }: { session: FocusSession; onReset: () => void }) {
  const insets = useSafeAreaInsets();
  const { db, prefs, refresh, reduceMotion } = useApp();
  const actions = useFocusActions();
  const [note, setNote] = useState(session.note ?? '');
  const task = session.taskId ? getTask(db, session.taskId) : null;
  const [taskDone, setTaskDone] = useState(!!task?.completedAt);
  const completed = session.status === 'completed';
  const active = session.activeSeconds ?? 0;

  const saveNote = () => {
    if ((session.note ?? '') !== note) {
      setSessionNote(db, session.id, note);
      refresh();
    }
  };

  const finish = () => {
    saveNote();
    router.back();
  };

  if (session.kind === 'break') {
    return (
      <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
        <TopBar onClose={() => router.back()} />
        <View style={styles.center}>
          <Ionicons name="cafe-outline" size={40} color={colors.text} />
          <T v="title" center accessibilityRole="header">
            {completed ? 'Break’s over' : 'Break ended'}
          </T>
          <T v="callout" color={colors.secondary} center style={{ paddingHorizontal: SIDE * 2 }}>
            Start another session when you’re ready, or call it here.
          </T>
        </View>
        <View style={{ paddingHorizontal: SIDE, gap: space.s }}>
          <Button title="Set up another session" kind="secondary" icon="timer-outline" onPress={onReset} />
          <Button title="Done" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const pausedMin = Math.round(
    session.pauses.reduce((sum, p) => sum + ((p.resumedAt ?? session.endedAt ?? p.pausedAt) - p.pausedAt), 0) / 60000,
  );
  const facts = [
    completed
      ? `Focused the full ${formatMinutes(session.plannedSeconds)}`
      : `Focused ${formatMinutes(active)} of ${formatMinutes(session.plannedSeconds)}`,
    session.pauses.length
      ? `${session.pauses.length} pause${session.pauses.length === 1 ? '' : 's'}, ${pausedMin} min not counted`
      : 'No pauses',
    session.blockingRequested ? (session.blockingApplied ? 'Chosen apps were shielded' : 'App blocking wasn’t applied') : null,
  ].filter(Boolean) as string[];

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      <TopBar onClose={finish} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, gap: space.xl, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(18)} style={styles.reveal}>
          <View style={styles.revealIcon}>
            <Ionicons name={completed ? 'checkmark' : 'flag'} size={26} color={colors.text} />
          </View>
          <T v="headline" center accessibilityRole="header">
            {completed ? 'Session complete' : 'Session ended'}
          </T>
          <T v="display" center>
            {formatMinutes(active)}
          </T>
          <T v="footnote" color={colors.secondary} center numberOfLines={2}>
            {session.taskTitle ?? 'Focus without a task'}
          </T>
        </Animated.View>

        <View style={{ gap: space.s, alignItems: 'center' }}>
          {facts.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
              <Ionicons name="checkmark" size={16} color={colors.secondary} />
              <T v="subhead" color={colors.secondary}>
                {f}
              </T>
            </View>
          ))}
        </View>

        {task ? (
          <Tiles style={{ marginHorizontal: -4 }}>
            <Row
              title="Mark task as done"
              subtitle={task.title}
              leading={
                <CheckCircle
                  checked={taskDone}
                  label="Mark task as done"
                  onPress={() => {
                    setTaskCompleted(db, task.id, !taskDone);
                    setTaskDone(!taskDone);
                    refresh();
                  }}
                />
              }
            />
          </Tiles>
        ) : null}

        <View style={{ gap: space.s }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            placeholder="Private note: what did you get done?"
            placeholderTextColor={colors.tertiary}
            multiline
            style={styles.note}
            accessibilityLabel="Private note"
            selectionColor={colors.text}
          />
          <Note icon="lock-closed-outline">Stays on this phone. Never uploaded.</Note>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: SIDE, paddingBottom: insets.bottom + space.s, gap: space.s }}>
        <Button title="Done" onPress={finish} />
        <Button
          title={`Take a ${prefs.breakMinutes}-min break`}
          icon="cafe-outline"
          kind="secondary"
          onPress={async () => {
            saveNote();
            try {
              await actions.start({ kind: 'break', minutes: prefs.breakMinutes });
              onReset();
            } catch (e) {
              Alert.alert('Couldn’t start a break', String(e));
            }
          }}
        />
      </View>
    </View>
  );
}

function TopBar({
  onClose,
  closeIcon = 'close',
  closeLabel = 'Close',
}: {
  onClose: () => void;
  closeIcon?: 'close' | 'chevron-down';
  closeLabel?: string;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} style={styles.close}>
        <Ionicons name={closeIcon} size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  topBar: { height: 56, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: SIDE - 4 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBlock: { alignItems: 'center', gap: space.xl, paddingHorizontal: SIDE, marginTop: space.s },
  chips: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap', justifyContent: 'center' },
  label: { paddingHorizontal: SIDE, marginTop: space.xxl, marginBottom: space.m, fontSize: 20, fontWeight: '700' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE,
    paddingTop: space.m,
    backgroundColor: colors.bg,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 48, paddingHorizontal: SIDE },
  control: { alignItems: 'center', gap: space.s },
  controlSlot: { height: 84, justifyContent: 'center' },
  blockStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  reveal: {
    alignSelf: 'center',
    width: '78%',
    marginTop: space.xl,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: space.s,
  },
  revealIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s,
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s,
  },
  note: {
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: space.l,
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
