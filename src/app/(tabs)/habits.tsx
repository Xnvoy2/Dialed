import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DayKey, addDays, formatRange, startOfWeek } from '../../domain/dates';
import { DayStatus, WeekSummary, consistency, describeSchedule, summarizeWeek } from '../../domain/habits';
import type { Habit } from '../../repos/habits';
import { Glass } from '../../ui/Glass';
import { checkIn, histories, listHabits, undoCheckIn } from '../../repos/habits';
import { useApp, useQuery } from '../../state/AppProvider';
import { EmptyState, Group, IconButton, Ring, Row, SectionHeader, SmallButton, T } from '../../ui/components';
import { RollingNumber } from '../../ui/RollingNumber';
import { useHaptics } from '../../ui/haptics';
import { Screen } from '../../ui/Screen';
import { WeekStrip } from '../../ui/WeekStrip';
import { SIDE, TILE_GAP, colors, radius, space } from '../../ui/theme';

export default function HabitsScreen() {
  const { db, today, prefs, refresh } = useApp();
  const haptics = useHaptics();
  const weekStart = startOfWeek(today, prefs.weekStart);
  const items = useQuery(
    (d, t) => {
      const all = listHabits(d);
      const h = histories(d, all.map((x) => x.id));
      return all.map((habit) => {
        const history = h.get(habit.id)!;
        return {
          habit,
          week: summarizeWeek(habit, history, startOfWeek(t, prefs.weekStart), t),
          stats: consistency(habit, history, t, prefs.weekStart),
        };
      });
    },
    [prefs.weekStart],
  );

  const toggle = (habitId: string, day: DayKey, status: DayStatus) => {
    if (status === 'done') {
      undoCheckIn(db, habitId, day);
      haptics.select();
    } else {
      checkIn(db, habitId, day, today);
      haptics.success();
    }
    refresh();
  };

  const archived = useQuery((d) => listHabits(d, true).filter((h) => h.archivedAt));
  const add = () => router.push({ pathname: '/habit/edit/[id]', params: { id: 'new' } });

  return (
    <Screen
      title="Habits"
      subtitle={`This week · ${formatRange(weekStart, addDays(weekStart, 6))}`}
      headerRight={<IconButton name="add" label="New habit" onPress={add} size={38} />}
    >
      {items.length === 0 ? (
        <Glass radius={radius.l} style={styles.card}>
          <EmptyState
            icon="repeat-outline"
            title="No habits yet"
            body="Start small: something you can do on most days. You can plan rest days, and missing one never wipes your history."
            actions={<SmallButton title="Create a habit" icon="add" onPress={add} />}
          />
        </Glass>
      ) : (
        <View style={{ gap: TILE_GAP }}>
          <Summary items={items} />
          {items.map(({ habit, week, stats }) => {
            const weekly = habit.frequency === 'weekly';
            const sofar = soFar(habit, week);
            return (
              <Glass
                key={habit.id}
                radius={radius.l}
                interactive
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
                accessibilityLabel={`${habit.name}. ${describeSchedule(habit)}. Opens history.`}
                style={styles.card}
              >
                <View style={styles.head}>
                  <View style={{ flex: 1 }}>
                    <T v="headline" numberOfLines={2}>
                      {habit.name}
                    </T>
                    <T v="footnote" color={colors.secondary}>
                      {describeSchedule(habit)}
                      {stats.streak > 0 ? ` · ${stats.streak} ${weekly ? 'week' : 'day'} streak` : ''}
                    </T>
                  </View>
                  <T v="subhead" color={colors.secondary} style={{ fontVariant: ['tabular-nums'] }}>
                    {`${sofar.done} of ${sofar.of}`}
                  </T>
                </View>
                <WeekStrip days={week.days} today={today} onPressDay={(day, status) => toggle(habit.id, day, status)} />
              </Glass>
            );
          })}
          {archived.length > 0 ? (
            <View style={{ marginTop: space.l }}>
              <SectionHeader title="Archived" />
              <Group>
                {archived.map((h) => (
                  <Row
                    key={h.id}
                    title={h.name}
                    muted
                    chevron
                    onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                  />
                ))}
              </Group>
            </View>
          ) : null}
          <T v="footnote" color={colors.tertiary} style={{ paddingHorizontal: SIDE }}>
            Tap a day to check in or undo. Open a habit to plan rest days and see its history. Check-ins are for
            you; they never earn rewards.
          </T>
        </View>
      )}
    </Screen>
  );
}

/** Counts today as an opportunity, so Monday reads "0 of 1", not "0 of 0". Weekly habits count against their target. */
function soFar(habit: Habit, week: WeekSummary): { done: number; of: number } {
  const done = week.days.filter((d) => d.status === 'done').length;
  if (habit.frequency === 'weekly') return { done: Math.min(done, habit.weeklyTarget), of: habit.weeklyTarget };
  const of = week.days.filter((d) => d.status === 'done' || d.status === 'missed' || d.status === 'pending').length;
  return { done, of };
}

function Summary({
  items,
}: {
  items: { habit: Habit; week: WeekSummary; stats: { lifetime: number; streak: number } }[];
}) {
  const totals = items.map((i) => soFar(i.habit, i.week));
  const done = totals.reduce((n, t) => n + t.done, 0);
  const opp = totals.reduce((n, t) => n + t.of, 0);
  const lifetime = items.reduce((n, i) => n + i.stats.lifetime, 0);
  const best = Math.max(0, ...items.map((i) => i.stats.streak));
  return (
    <Glass
      radius={radius.l}
      style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: space.xl, padding: space.xl }]}
    >
      <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.xl, flex: 1 }}
      accessible
      accessibilityLabel={`This week ${done} of ${opp} scheduled check-ins done. ${lifetime} check-ins all time. Longest current streak ${best}.`}
    >
      <Ring size={96} stroke={8} progress={opp ? done / opp : 0}>
        <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
          {opp ? Math.round((done / opp) * 100) : 0}
          <T v="subhead" color={colors.secondary}>
            %
          </T>
        </T>
      </Ring>
      <View style={{ flex: 1, gap: space.m }}>
        <View>
          <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
            {done} of {opp}
          </T>
          <T v="footnote" color={colors.secondary}>
            done so far this week
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: space.xl }}>
          <View>
            <RollingNumber value={lifetime} v="headline" />
            <T v="footnote" color={colors.secondary}>
              all-time
            </T>
          </View>
          <View>
            <RollingNumber value={best} v="headline" />
            <T v="footnote" color={colors.secondary}>
              best streak
            </T>
          </View>
        </View>
      </View>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SIDE - 4,
    padding: space.l,
    gap: space.l,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
});
