import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { formatClock, formatDayLong } from '../../domain/dates';
import { formatMinutes } from '../../domain/focus';
import { getSession, setSessionNote } from '../../repos/sessions';
import { useApp } from '../../state/AppProvider';
import { Group, Note, Row, T } from '../../ui/components';
import { SIDE, colors, radius, space } from '../../ui/theme';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, refresh } = useApp();
  const s = getSession(db, id);
  const [note, setNote] = useState(s?.note ?? '');
  if (!s) {
    return (
      <View style={styles.fill}>
        <T v="headline">Session not found</T>
      </View>
    );
  }
  const pausedMinutes = Math.round(
    s.pauses.reduce((sum, p) => sum + ((p.resumedAt ?? s.endedAt ?? p.pausedAt) - p.pausedAt), 0) / 60000,
  );
  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={styles.fill} keyboardShouldPersistTaps="handled">
      <T v="title2" accessibilityRole="header">
        {s.taskTitle ?? 'Focus session'}
      </T>
      <T v="subhead" color={colors.secondary}>
        {formatDayLong(s.localDay)} · {formatClock(s.startedAt)}
        {s.endedAt ? ` – ${formatClock(s.endedAt)}` : ''}
      </T>
      <Group style={{ marginHorizontal: 0, backgroundColor: colors.surfaceRaised }}>
        <Row title="Outcome" value={s.status === 'completed' ? 'Completed' : s.status === 'ended_early' ? 'Ended early' : 'In progress'} />
        <Row title="Focused" value={formatMinutes(s.activeSeconds ?? 0)} />
        <Row title="Planned" value={formatMinutes(s.plannedSeconds)} />
        <Row title="Pauses" value={s.pauses.length ? `${s.pauses.length} · ${pausedMinutes} min` : 'None'} />
        {s.blockingRequested ? <Row title="App blocking" value={s.blockingApplied ? 'Applied' : 'Not applied'} /> : null}
      </Group>
      <T v="subhead" color={colors.secondary}>
        Private note
      </T>
      <TextInput
        value={note}
        onChangeText={setNote}
        onBlur={() => {
          setSessionNote(db, s.id, note);
          refresh();
        }}
        placeholder="Add a note"
        placeholderTextColor={colors.tertiary}
        multiline
        style={styles.note}
        accessibilityLabel="Private note"
        selectionColor={colors.text}
      />
      <Note icon="time-outline">
        Times are shown in your current time zone. The session counts toward the day it started{s.timeZone ? ` (${s.timeZone})` : ''}.
      </Note>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { padding: SIDE, paddingTop: space.xxl, gap: space.l },
  note: {
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    padding: space.l,
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
