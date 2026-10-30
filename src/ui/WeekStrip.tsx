import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DayKey, formatDayLong, weekdayInitial } from '../domain/dates';
import { DayStatus } from '../domain/habits';
import { T } from './components';
import { colors } from './theme';

const DESCRIBE: Record<DayStatus, string> = {
  done: 'done',
  missed: 'missed',
  rest: 'rest day',
  pending: 'not done yet',
  future: 'upcoming',
  unscheduled: 'not scheduled',
  before_start: 'before this habit started',
};

/** Seven day circles (after the reference's streak row). */
export function WeekStrip({
  days,
  today,
  onPressDay,
  size = 34,
}: {
  days: { day: DayKey; status: DayStatus }[];
  today: DayKey;
  onPressDay?: (day: DayKey, status: DayStatus) => void;
  size?: number;
}) {
  return (
    <View style={styles.strip}>
      {days.map(({ day, status }) => {
        const isToday = day === today;
        const tappable = !!onPressDay && day <= today && status !== 'before_start';
        return (
          <Pressable
            key={day}
            disabled={!tappable}
            onPress={() => onPressDay?.(day, status)}
            accessibilityRole={tappable ? 'button' : undefined}
            accessibilityLabel={`${formatDayLong(day)}, ${DESCRIBE[status]}`}
            accessibilityHint={tappable ? (status === 'done' ? 'Undo check-in' : 'Check in') : undefined}
            style={styles.cell}
          >
            <T v="caption" color={isToday ? colors.text : colors.tertiary} style={isToday ? { fontWeight: '700' } : undefined}>
              {weekdayInitial(day)}
            </T>
            <DayDot status={status} size={size} isToday={isToday} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function DayDot({ status, size, isToday }: { status: DayStatus; size: number; isToday?: boolean }) {
  const base = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
  switch (status) {
    case 'done':
      return (
        <View style={[base, { backgroundColor: colors.accent }]}>
          <Ionicons name="checkmark" size={size * 0.55} color={colors.onPrimary} />
        </View>
      );
    case 'rest':
      return (
        <View style={[base, { backgroundColor: colors.surfaceRaised }]}>
          <T v="caption" color={colors.secondary} style={{ fontWeight: '700' }}>
            R
          </T>
        </View>
      );
    case 'missed':
      return <View style={[base, { backgroundColor: colors.surfaceRaised, opacity: 0.55 }]} />;
    case 'pending':
      return <View style={[base, { borderWidth: 1.5, borderColor: isToday ? colors.text : colors.borderStrong }]} />;
    case 'future':
      return <View style={[base, { borderWidth: 1, borderColor: colors.border }]} />;
    default:
      return (
        <View style={base}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 6, minWidth: 40, minHeight: 56 },
});
