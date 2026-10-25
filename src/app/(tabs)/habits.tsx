import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DayKey, addDays, formatRange, startOfWeek } from '../../domain/dates';
import { DayStatus, consistency, describeSchedule, summarizeWeek } from '../../domain/habits';
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
        <View style={styles.card}>
          <EmptyState
            icon="repeat-outline"
            title="No habits yet"
            body="Start small: something you can do on most days. You can plan rest days, and missing one never wipes your history."
            actions={<SmallButton title="Create a habit" icon="add" onPress={add} />}
          />
        </View>
      ) : (
        <View style={{ gap: TILE_GAP }}>
          <Summary items={items} />
          {items.map(({ habit, week, stats }) => {
            const weekly = habit.frequency === 'weekly';
            const done = weekly ? Math.min(week.days.filter((d) => d.status === 'done').length, 7) : week.completed;
            return (
              <Pressable
                key={habit.id}
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${habit.name}. ${describeSchedule(habit)}. Opens history.`}
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfacePressed }]}
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
                    {weekly ? `${done} of ${habit.weeklyTarget}` : `${done} of ${week.opportunities}`}
                  </T>
                </View>
                <WeekStrip days={week.days} today={today} onPressDay={(day, status) => toggle(habit.id, day, status)} />
              </Pressable>
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

function Summary({
  items,
}: {
  items: { habit: { frequency: string }; week: { completed: number; opportunities: number }; stats: { lifetime: number; streak: number } }[];
}) {
  const done = items.reduce((n, i) => n + i.week.completed, 0);
  const opp = items.reduce((n, i) => n + i.week.opportunities, 0);
  const lifetime = items.reduce((n, i) => n + i.stats.lifetime, 0);
  const best = Math.max(0, ...items.map((i) => i.stats.streak));
  return (
    <View
      style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: space.xl, padding: space.xl }]}
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
            scheduled so far this week
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
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SIDE - 4,
    padding: space.l,
    gap: space.l,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
});
