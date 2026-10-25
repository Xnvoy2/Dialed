import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DayKey,
  addDays,
  formatClock,
  formatDayLong,
  formatDayShort,
  formatRange,
  startOfWeek,
  weekDays,
  weekdayInitial,
} from '../../domain/dates';
import { formatMinutes } from '../../domain/focus';
import { summarizeWeek } from '../../domain/habits';
import { compareWeekSoFar, describeDelta, sumDays } from '../../domain/progress';
import { focusStreak } from '../../domain/streaks';
import { histories, listHabits } from '../../repos/habits';
import { FocusSession, focusDays, focusSecondsByDay, focusTotals, recentSessions } from '../../repos/sessions';
import { useApp, useQuery } from '../../state/AppProvider';
import { Card, EmptyState, Row, SectionHeader, SmallButton, T, Tiles } from '../../ui/components';
import { RollingNumber } from '../../ui/RollingNumber';
import { Screen } from '../../ui/Screen';
import { TILE_GAP, colors, space } from '../../ui/theme';

const RECAP_WEEKS = 4;
/** Recap rows start at the first week with any focus, so a new user isn't shown empty weeks. */

export default function ProgressScreen() {
  const { today, prefs } = useApp();
  const weekStart = startOfWeek(today, prefs.weekStart);
  const days = weekDays(weekStart);
  const oldest = addDays(weekStart, -7 * (RECAP_WEEKS - 1));

  const byDay = useQuery((d) => focusSecondsByDay(d, oldest, addDays(weekStart, 6)), [weekStart]);
  const totals = useQuery((d) => focusTotals(d));
  const streak = useQuery((d, t) => focusStreak(focusDays(d), t));
  const comparison = compareWeekSoFar(byDay, weekStart, today);
  const sessions = useQuery((d) => recentSessions(d, 40));
  const habitWeeks = useQuery(
    (d, t) => {
      const all = listHabits(d);
      const h = histories(d, all.map((x) => x.id));
      let thisDone = 0,
        thisOpp = 0,
        lastDone = 0,
        lastOpp = 0;
      for (const habit of all) {
        const hist = h.get(habit.id)!;
        const a = summarizeWeek(habit, hist, weekStart, t);
        const b = summarizeWeek(habit, hist, addDays(weekStart, -7), t);
        thisDone += a.completed;
        thisOpp += a.opportunities;
        lastDone += b.completed;
        lastOpp += b.opportunities;
      }
      return { count: all.length, thisDone, thisOpp, lastDone, lastOpp };
    },
    [weekStart],
  );

  const max = Math.max(...days.map((d) => byDay.get(d) ?? 0), 1);
  const firstWeek = totals.firstDay ? startOfWeek(totals.firstDay, prefs.weekStart) : weekStart;
  const recaps = Array.from({ length: RECAP_WEEKS }, (_, i) => addDays(weekStart, -7 * i)).filter((ws) => ws >= firstWeek);

  return (
    <Screen title="Progress" subtitle="From what you’ve recorded on this phone">
      <View style={{ gap: TILE_GAP }}>
        <Card style={{ padding: space.xl, gap: 2 }}>
          <T v="subhead" color={colors.secondary}>
            {totals.firstDay ? `Focusing since ${formatDayShort(totals.firstDay)}` : 'No focus recorded yet'}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <RollingNumber value={Math.floor(totals.seconds / 60)} v="display" />
            <T v="headline" color={colors.secondary}>
              min
            </T>
          </View>
          <T v="footnote" color={colors.secondary}>
            focused in total
          </T>
          <View style={styles.stats}>
            <Stat value={totals.sessions} label={totals.sessions === 1 ? 'session' : 'sessions'} />
            <Stat value={streak.current} label="day streak" />
            <Stat value={streak.best} label="best streak" />
          </View>
        </Card>

        <Card style={{ padding: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T v="headline" style={{ flex: 1 }}>
              This week
            </T>
            <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMinutes(comparison.current)}
            </T>
          </View>
          <T v="footnote" color={colors.secondary}>
            {describeDelta(comparison, formatMinutes)}
          </T>
          <View style={styles.chart} accessibilityRole="image" accessibilityLabel={chartLabel(days, byDay)}>
            {days.map((d) => {
              const secs = byDay.get(d) ?? 0;
              const h = secs > 0 ? Math.max(8, (secs / max) * 104) : 6;
              const isToday = d === today;
              return (
                <View key={d} style={styles.barCol}>
                  <T v="caption" color={colors.secondary} style={{ opacity: secs > 0 ? 1 : 0 }}>
                    {Math.round(secs / 60)}
                  </T>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: h,
                          backgroundColor: secs > 0 ? (isToday ? colors.text : '#BDBDC2') : d > today ? colors.surface : colors.track,
                          borderWidth: d > today ? 1 : 0,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>
                  <T v="caption" color={isToday ? colors.text : colors.tertiary} style={isToday ? { fontWeight: '700' } : undefined}>
                    {weekdayInitial(d)}
                  </T>
                </View>
              );
            })}
          </View>
        </Card>

        <Card style={{ padding: space.xl }}>
          <T v="headline">Habits this week</T>
          {habitWeeks.count === 0 ? (
            <T v="subhead" color={colors.secondary} style={{ marginTop: 4 }}>
              Completion shows here once you add a habit.
            </T>
          ) : (
            <View style={[styles.stats, { marginTop: space.m }]}>
              <View style={{ flex: 1 }}>
                <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
                  {habitWeeks.thisDone}
                  <T v="headline" color={colors.secondary}>
                    {' '}
                    / {habitWeeks.thisOpp}
                  </T>
                </T>
                <T v="footnote" color={colors.secondary}>
                  done of scheduled so far
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="title" color={colors.secondary} style={{ fontVariant: ['tabular-nums'] }}>
                  {habitWeeks.lastOpp ? `${habitWeeks.lastDone} / ${habitWeeks.lastOpp}` : '–'}
                </T>
                <T v="footnote" color={colors.secondary}>
                  last week
                </T>
              </View>
            </View>
          )}
        </Card>
      </View>

      <SectionHeader title="Weekly recaps" />
      <Tiles>
        {recaps.map((ws) => {
          const wd = weekDays(ws);
          const total = sumDays(byDay, wd);
          const active = wd.filter((d) => (byDay.get(d) ?? 0) > 0).length;
          const weekMax = Math.max(...wd.map((d) => byDay.get(d) ?? 0), 1);
          const current = ws === weekStart;
          return (
            <View key={ws} style={styles.recap} accessible accessibilityLabel={`${formatRange(ws, addDays(ws, 6))}: ${formatMinutes(total)}, ${active} of 7 days`}>
              <View style={styles.spark}>
                {wd.map((d) => {
                  const v = byDay.get(d) ?? 0;
                  return (
                    <View
                      key={d}
                      style={{
                        width: 4,
                        height: v ? Math.max(4, (v / weekMax) * 26) : 3,
                        borderRadius: 2,
                        backgroundColor: v ? colors.secondary : colors.track,
                      }}
                    />
                  );
                })}
              </View>
              <View style={{ flex: 1 }}>
                <T v="headline">{current ? 'This week' : formatRange(ws, addDays(ws, 6))}</T>
                <T v="footnote" color={colors.secondary}>
                  {active} of 7 days with focus
                </T>
              </View>
              <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
                {formatMinutes(total)}
              </T>
            </View>
          );
        })}
      </Tiles>

      <SectionHeader title="Focus history" />
      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon="time-outline"
            title="No sessions yet"
            body="Finished and ended sessions appear here with their task and outcome."
            actions={<SmallButton title="Start focusing" icon="timer-outline" onPress={() => router.push('/focus')} />}
          />
        </Card>
      ) : (
        <View style={{ gap: space.l }}>
          {groupByDay(sessions).map(([day, list]) => (
            <View key={day} style={{ gap: space.s }}>
              <T v="footnote" color={colors.secondary} style={{ paddingHorizontal: 16 }}>
                {day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : formatDayLong(day)} ·{' '}
                {formatMinutes(list.reduce((s, x) => s + (x.activeSeconds ?? 0), 0))}
              </T>
              <Tiles>
                {list.map((s) => (
                  <Row
                    key={s.id}
                    icon={s.status === 'completed' ? 'checkmark' : 'flag-outline'}
                    title={s.taskTitle ?? 'No task'}
                    subtitle={sessionSubtitle(s)}
                    value={formatMinutes(s.activeSeconds ?? 0)}
                    chevron
                    onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
                  />
                ))}
              </Tiles>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <RollingNumber value={value} v="title2" />
      <T v="footnote" color={colors.secondary}>
        {label}
      </T>
    </View>
  );
}

function sessionSubtitle(s: FocusSession): string {
  const parts = [formatClock(s.startedAt)];
  parts.push(s.status === 'completed' ? 'Completed' : `Ended early of ${formatMinutes(s.plannedSeconds)}`);
  if (s.pauses.length) parts.push(`${s.pauses.length} pause${s.pauses.length === 1 ? '' : 's'}`);
  if (s.note) parts.push('Note');
  return parts.join(' · ');
}

function groupByDay(list: FocusSession[]): [DayKey, FocusSession[]][] {
  const map = new Map<DayKey, FocusSession[]>();
  for (const s of list) map.set(s.localDay, [...(map.get(s.localDay) ?? []), s]);
  return [...map.entries()];
}

function chartLabel(days: DayKey[], byDay: Map<DayKey, number>): string {
  return 'Focus minutes by day: ' + days.map((d) => `${formatDayLong(d)} ${Math.round((byDay.get(d) ?? 0) / 60)}`).join(', ');
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.l, marginTop: space.l },
  chart: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.l },
  barCol: { alignItems: 'center', gap: 6, flex: 1 },
  barTrack: { height: 106, justifyContent: 'flex-end' },
  bar: { width: 26, borderRadius: 13 },
  recap: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l, minHeight: 64 },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    width: 44,
    height: 44,
    paddingBottom: 9,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
});
