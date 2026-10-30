import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayKey, addDays, formatDayLong, startOfWeek, weekDays, weekdayInitial } from '../../domain/dates';
import { consistency, dayStatus, describeSchedule } from '../../domain/habits';
import { checkIn, getHabit, habitHistory, setRestDay, undoCheckIn } from '../../repos/habits';
import { useApp, useQuery } from '../../state/AppProvider';
import { Button, IconButton, T } from '../../ui/components';
import { useHaptics } from '../../ui/haptics';
import { DayDot } from '../../ui/WeekStrip';
import { SIDE, colors, radius, space } from '../../ui/theme';

const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1)));

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { db, today, prefs, refresh } = useApp();
  const haptics = useHaptics();
  const habit = useQuery((d) => getHabit(d, id), [id]);
  const history = useQuery((d) => habitHistory(d, id), [id]);
  const [ty, tm] = today.split('-').map(Number);
  const [month, setMonth] = useState({ y: ty, m: tm - 1 });
  const [selected, setSelected] = useState<DayKey>(today);

  if (!habit) {
    return (
      <View style={styles.fill}>
        <T v="headline" style={{ padding: SIDE }}>
          This habit was deleted.
        </T>
      </View>
    );
  }

  const stats = consistency(habit, history, today, prefs.weekStart);
  const weekly = habit.frequency === 'weekly';

  // Month grid aligned to the user's week start.
  const first = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const gridStart = startOfWeek(first, prefs.weekStart);
  const weeks: DayKey[][] = [];
  const monthKey = first.slice(0, 7);
  for (let w = gridStart; weekDays(w).some((d) => d.slice(0, 7) === monthKey); w = addDays(w, 7)) {
    weeks.push(weekDays(w));
  }

  const selStatus = dayStatus(habit, history, selected, today);
  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(month.y, month.m + delta, 1));
    setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  const act = (fn: () => void) => {
    try {
      fn();
      haptics.select();
      refresh();
    } catch (e) {
      Alert.alert('Can’t do that', (e as Error).message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/habit/edit/[id]', params: { id: habit.id } })}
              accessibilityRole="button"
              hitSlop={10}
            >
              <T v="body">Edit</T>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.fill} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={{ paddingHorizontal: SIDE, gap: 4 }}>
          <T v="largeTitle" accessibilityRole="header">
            {habit.name}
          </T>
          <T v="subhead" color={colors.secondary}>
            {describeSchedule(habit)}
            {habit.archivedAt ? ' · Archived' : ''}
          </T>
        </View>

        <View style={styles.stats}>
          <Stat value={String(stats.lifetime)} label={stats.lifetime === 1 ? 'check-in, all time' : 'check-ins, all time'} />
          <Stat value={String(stats.streak)} label={weekly ? 'week streak' : 'day streak'} />
          <Stat
            value={stats.rate == null ? '–' : `${Math.round(stats.rate * 100)}%`}
            label={stats.rate == null ? 'last 4 weeks' : `${stats.completed} of ${stats.opportunities}, 4 weeks`}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.monthHead}>
            <T v="headline" style={{ flex: 1 }}>
              {monthLabel(month.y, month.m)}
            </T>
            <IconButton name="chevron-back" label="Previous month" size={36} onPress={() => shiftMonth(-1)} />
            <IconButton name="chevron-forward" label="Next month" size={36} onPress={() => shiftMonth(1)} />
          </View>
          <View style={styles.weekRow}>
            {weeks[0].map((d) => (
              <T key={d} v="caption" color={colors.tertiary} style={styles.cellLabel}>
                {weekdayInitial(d)}
              </T>
            ))}
          </View>
          {weeks.map((w) => (
            <View key={w[0]} style={styles.weekRow}>
              {w.map((d) => {
                const inMonth = d.slice(0, 7) === first.slice(0, 7);
                const st = dayStatus(habit, history, d, today);
                const isSel = d === selected;
                return (
                  <Pressable
                    key={d}
                    disabled={!inMonth}
                    onPress={() => setSelected(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDayLong(d)}, ${st.replace('_', ' ')}`}
                    accessibilityState={{ selected: isSel }}
                    style={[styles.cell, isSel && styles.cellSelected, !inMonth && { opacity: 0 }]}
                  >
                    {st === 'done' || st === 'rest' ? (
                      <DayDot status={st} size={32} />
                    ) : (
                      <View style={[styles.num, st === 'missed' && { backgroundColor: colors.surfaceRaised }]}>
                        <T v="subhead" color={st === 'future' || st === 'before_start' ? colors.tertiary : colors.text}>
                          {Number(d.slice(8))}
                        </T>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View style={styles.legend}>
            <Legend status="done" label="Done" />
            {!weekly ? <Legend status="rest" label="Rest" /> : null}
            {!weekly ? <Legend status="missed" label="Missed" /> : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: SIDE, gap: space.s, marginTop: space.xl }}>
          <T v="headline">{selected === today ? 'Today' : formatDayLong(selected)}</T>
          {selected > today ? (
            <T v="subhead" color={colors.secondary}>
              You can check in on or after the day itself.
            </T>
          ) : selStatus === 'before_start' ? (
            <T v="subhead" color={colors.secondary}>
              Before this habit started.
            </T>
          ) : (
            <View style={{ gap: space.s }}>
              {selStatus === 'done' ? (
                <Button title="Undo check-in" kind="secondary" icon="arrow-undo" onPress={() => act(() => undoCheckIn(db, habit.id, selected))} />
              ) : (
                <Button title="Check in" icon="checkmark" onPress={() => act(() => checkIn(db, habit.id, selected, today))} />
              )}
              {!weekly && selStatus !== 'done' && selStatus !== 'unscheduled' ? (
                <Button
                  title={selStatus === 'rest' ? 'Remove rest day' : 'Plan as rest day'}
                  kind="secondary"
                  icon="bed-outline"
                  onPress={() => act(() => setRestDay(db, habit.id, selected, selStatus !== 'rest'))}
                />
              ) : null}
            </View>
          )}
        </View>
        {!weekly ? <FutureRest habitId={habit.id} /> : null}
      </ScrollView>
    </>
  );
}

/** Rest days are often planned in advance; allow selecting the next 14 days. */
function FutureRest({ habitId }: { habitId: string }) {
  const { db, today, refresh } = useApp();
  const history = useQuery((d) => habitHistory(d, habitId), [habitId]);
  const upcoming = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
  return (
    <View style={{ paddingHorizontal: SIDE, marginTop: space.xl, gap: space.s }}>
      <T v="headline">Plan rest days</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {upcoming.map((d) => {
          const rest = history.restDays.has(d);
          return (
            <Pressable
              key={d}
              onPress={() => {
                setRestDay(db, habitId, d, !rest);
                refresh();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: rest }}
              accessibilityLabel={`${formatDayLong(d)}${rest ? ', rest day' : ''}`}
              style={[styles.restChip, rest && { backgroundColor: colors.accent }]}
            >
              <T v="caption" color={rest ? colors.onPrimary : colors.secondary}>
                {weekdayInitial(d)}
              </T>
              <T v="subhead" color={rest ? colors.onPrimary : colors.text} style={{ fontWeight: '600' }}>
                {Number(d.slice(8))}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      <T v="footnote" color={colors.secondary}>
        {label}
      </T>
    </View>
  );
}

function Legend({ status, label }: { status: 'done' | 'rest' | 'missed'; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <DayDot status={status} size={14} />
      <T v="footnote" color={colors.secondary}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  stats: { flexDirection: 'row', gap: space.l, paddingHorizontal: SIDE, marginVertical: space.xl },
  card: {
    marginHorizontal: SIDE - 4,
    padding: space.l,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.xs,
  },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.s },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cellLabel: { width: 42, textAlign: 'center' },
  cell: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  cellSelected: { borderWidth: 1.5, borderColor: colors.accent },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: space.l, marginTop: space.m },
  restChip: {
    width: 48,
    height: 56,
    borderRadius: radius.m,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
