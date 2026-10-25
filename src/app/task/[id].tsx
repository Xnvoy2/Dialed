import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { createTask, deleteTask, getTask, updateTask } from '../../repos/tasks';
import { useApp } from '../../state/AppProvider';
import { Button, Chip, T } from '../../ui/components';
import { useHaptics } from '../../ui/haptics';
import { SIDE, colors, radius, space } from '../../ui/theme';

const ESTIMATES: (number | null)[] = [null, 15, 30, 45, 60, 90, 120];

export default function TaskEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, today, refresh } = useApp();
  const haptics = useHaptics();
  const existing = id && id !== 'new' ? getTask(db, id) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [estimate, setEstimate] = useState<number | null>(existing?.estimateMinutes ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const canSave = title.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (existing) {
      updateTask(db, existing.id, { title, estimateMinutes: estimate, notes });
    } else {
      createTask(db, { title, estimateMinutes: estimate, notes, day: today });
    }
    haptics.success();
    refresh();
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <T v="title2" accessibilityRole="header">
        {existing ? 'Edit task' : 'New task'}
      </T>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What do you want to get done?"
        placeholderTextColor={colors.tertiary}
        autoFocus={!existing}
        returnKeyType="done"
        onSubmitEditing={save}
        maxLength={200}
        style={styles.titleInput}
        accessibilityLabel="Task title"
        selectionColor={colors.text}
      />

      <View style={{ gap: space.s }}>
        <T v="subhead" color={colors.secondary}>
          Estimated time (optional)
        </T>
        <View style={styles.chips}>
          {ESTIMATES.map((m) => (
            <Chip
              key={String(m)}
              label={m == null ? 'None' : m < 60 ? `${m}m` : `${m / 60}h`}
              accessibilityLabel={m == null ? 'No estimate' : `${m} minutes`}
              selected={estimate === m}
              onPress={() => {
                haptics.select();
                setEstimate(m);
              }}
            />
          ))}
        </View>
      </View>

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes"
        placeholderTextColor={colors.tertiary}
        multiline
        style={styles.notes}
        accessibilityLabel="Notes"
        selectionColor={colors.text}
      />

      <Button title={existing ? 'Save' : 'Add to today'} onPress={save} disabled={!canSave} />
      {existing ? (
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button
            title="Focus on this"
            icon="play"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              router.back();
              router.push({ pathname: '/focus', params: { taskId: existing.id } });
            }}
          />
          <Button
            title="Delete"
            icon="trash-outline"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() =>
              Alert.alert('Delete task?', 'Focus history keeps the task’s title.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteTask(db, existing.id);
                    refresh();
                    router.back();
                  },
                },
              ])
            }
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SIDE, paddingTop: space.xxl, gap: space.xl },
  titleInput: {
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 52,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  notes: {
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingTop: space.m,
    paddingBottom: space.m,
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
