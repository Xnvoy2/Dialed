import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Frequency, WORKDAYS, maskHas, toggleMask } from '../../../domain/habits';
import { archiveHabit, createHabit, deleteHabit, getHabit, updateHabit } from '../../../repos/habits';
import { useApp } from '../../../state/AppProvider';
import { Button, Segmented, Stepper, T } from '../../../ui/components';
import { useHaptics } from '../../../ui/haptics';
import { SIDE, colors, radius, space } from '../../../ui/theme';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HabitEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, today, prefs, refresh } = useApp();
  const haptics = useHaptics();
  const existing = id && id !== 'new' ? getHabit(db, id) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'daily');
  const [mask, setMask] = useState(existing?.frequency === 'weekdays' ? existing.weekdaysMask : WORKDAYS);
  const [target, setTarget] = useState(existing?.weeklyTarget ?? 3);
  const order = prefs.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  const valid = name.trim().length > 0 && (frequency !== 'weekdays' || mask !== 0);

  const save = () => {
    if (!valid) return;
    const input = { name, frequency, weekdaysMask: mask, weeklyTarget: target };
    try {
      if (existing) updateHabit(db, existing.id, input);
      else createHabit(db, input, today);
      haptics.success();
      refresh();
      router.back();
    } catch (e) {
      Alert.alert('Can’t save', (e as Error).message);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <T v="title2" accessibilityRole="header">
        {existing ? 'Edit habit' : 'New habit'}
      </T>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Read 10 pages"
        placeholderTextColor={colors.tertiary}
        autoFocus={!existing}
        maxLength={120}
        style={styles.input}
        accessibilityLabel="Habit name"
        selectionColor={colors.text}
      />

      <View style={{ gap: space.m }}>
        <T v="subhead" color={colors.secondary}>
          How often
        </T>
        <Segmented<Frequency>
          value={frequency}
          onChange={(f) => (haptics.select(), setFrequency(f))}
          options={[
            { value: 'daily', label: 'Every day' },
            { value: 'weekdays', label: 'Some days' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
        {frequency === 'weekdays' ? (
          <View style={styles.days}>
            {order.map((d) => {
              const on = maskHas(mask, d);
              return (
                <Pressable
                  key={d}
                  onPress={() => (haptics.select(), setMask(toggleMask(mask, d)))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={DAY_LONG[d]}
                  style={[styles.day, on && { backgroundColor: colors.text, borderColor: colors.text }]}
                >
                  <T v="headline" color={on ? colors.onPrimary : colors.text}>
                    {DAY_NAMES[d]}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {frequency === 'weekdays' && mask === 0 ? (
          <T v="footnote" color={colors.secondary}>
            Pick at least one day.
          </T>
        ) : null}
        {frequency === 'weekly' ? (
          <View style={{ alignItems: 'center', gap: space.s }}>
            <Stepper
              label="Times per week"
              value={target}
              min={1}
              max={7}
              onChange={setTarget}
              format={(v) => `${v}× a week`}
            />
            <T v="footnote" color={colors.secondary} center>
              Any days count. Good for things like workouts where the exact day doesn’t matter.
            </T>
          </View>
        ) : null}
        {frequency === 'daily' ? (
          <T v="footnote" color={colors.secondary}>
            You can still plan rest days. They won’t count against you.
          </T>
        ) : null}
      </View>

      <Button title={existing ? 'Save' : 'Create habit'} onPress={save} disabled={!valid} />

      {existing ? (
        <View style={{ gap: space.s }}>
          <Button
            title={existing.archivedAt ? 'Restore habit' : 'Archive habit'}
            kind="secondary"
            icon="archive-outline"
            onPress={() => {
              archiveHabit(db, existing.id, !existing.archivedAt);
              refresh();
              router.dismissAll();
            }}
          />
          <Button
            title="Delete habit and history"
            kind="plain"
            onPress={() =>
              Alert.alert('Delete habit?', 'This removes all of its check-ins. Archiving keeps them.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteHabit(db, existing.id);
                    refresh();
                    router.dismissAll();
                  },
                },
              ])
            }
          />
        </View>
      ) : null}
      <T v="footnote" color={colors.tertiary}>
        Changing the schedule keeps every check-in. Consistency is recalculated with the new schedule.
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SIDE, paddingTop: space.xxl, gap: space.xl },
  input: {
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 52,
  },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
