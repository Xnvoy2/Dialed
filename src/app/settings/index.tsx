import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME, APP_VERSION } from '../../config/app';
import { blocking } from '../../native/blocking';
import { describeSelection } from '../../native/blocking/types';
import {
  NotificationPermission,
  cancelSessionEnd,
  notificationPermission,
  requestNotificationPermission,
} from '../../native/notifications';
import { deleteAll, exportAll } from '../../repos/data';
import { getOpenSession } from '../../repos/sessions';
import { useApp } from '../../state/AppProvider';
import { Card, Row, SectionHeader, SegmentRow, StepperRow, T, Tiles, ToggleRow } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { db, prefs, setPrefs, refresh, version } = useApp();
  const [perm, setPerm] = useState<NotificationPermission>('undetermined');
  useEffect(() => {
    notificationPermission().then(setPerm).catch(() => {});
  }, [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avail = React.useMemo(() => blocking.availability(), [version]);

  const blockingSummary =
    avail.state === 'unsupported'
      ? 'Unavailable'
      : avail.state === 'denied'
        ? 'Screen Time access off'
        : avail.state === 'not_determined'
          ? 'Not set up'
          : prefs.blockingEnabled
            ? `On · ${describeSelection(avail.selection)}`
            : 'Off';

  const doExport = async () => {
    try {
      const data = exportAll(db, APP_NAME);
      const file = new File(Paths.cache, `lockin-export-${new Date().toISOString().slice(0, 10)}.json`);
      file.create({ overwrite: true });
      await file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export data' });
      } else {
        Alert.alert('Export saved', file.uri);
      }
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const doDelete = () => {
    if (getOpenSession(db)) {
      Alert.alert('A session is running', 'End it before deleting your data.');
      return;
    }
    Alert.alert(
      'Delete all data?',
      'Tasks, habits, check-ins, focus history, notes and settings will be removed from this phone. This can’t be undone. Export first if you want a copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            deleteAll(db);
            await cancelSessionEnd();
            await blocking.stopShield().catch(() => {});
            refresh();
            router.dismissAll();
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: space.s }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.l, padding: space.xl }}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="headline">{APP_NAME}</T>
          <T v="footnote" color={colors.secondary}>
            No account. Everything is stored on this iPhone.
          </T>
        </View>
      </Card>

      <SectionHeader title="Focus" />
      <Tiles>
        <StepperRow
          icon="timer-outline"
          title="Focus length"
          value={prefs.focusMinutes}
          min={5}
          max={180}
          step={5}
          onChange={(v) => setPrefs({ focusMinutes: v })}
          format={(v) => `${v} min`}
        />
        <StepperRow
          icon="cafe-outline"
          title="Break length"
          value={prefs.breakMinutes}
          min={1}
          max={60}
          onChange={(v) => setPrefs({ breakMinutes: v })}
          format={(v) => `${v} min`}
        />
        <Row
          icon="lock-closed-outline"
          title="App blocking"
          subtitle={blockingSummary}
          chevron
          onPress={() => router.push('/settings/blocking')}
        />
      </Tiles>

      <SectionHeader title="Notifications" />
      <Tiles>
        <ToggleRow
          title="Alert when a session ends"
          subtitle={
            perm === 'denied'
              ? 'Turned off for this app in iOS Settings.'
              : 'Generic text only. Task names never appear on the lock screen.'
          }
          value={prefs.notifyOnSessionEnd && perm === 'granted'}
          onChange={async (v) => {
            if (!v) return setPrefs({ notifyOnSessionEnd: false });
            const p = await requestNotificationPermission();
            setPerm(p);
            setPrefs({ notificationsAsked: true, notifyOnSessionEnd: p === 'granted' });
            if (p === 'denied') Alert.alert('Notifications are off', 'You can turn them on in iOS Settings.');
          }}
        />
        {perm === 'denied' ? <Row icon="open-outline" title="Open iOS Settings" chevron onPress={() => Linking.openSettings()} /> : null}
      </Tiles>

      <SectionHeader title="Display" />
      <Tiles>
        <SegmentRow
          icon="calendar-outline"
          title="Week starts on"
          value={prefs.weekStart}
          onChange={(v) => setPrefs({ weekStart: v })}
          options={[
            { value: 1 as const, label: 'Monday' },
            { value: 0 as const, label: 'Sunday' },
          ]}
        />
        <SegmentRow
          icon="text-outline"
          title="Text size"
          subtitle="On top of your iOS text size"
          value={prefs.textScale}
          onChange={(v) => setPrefs({ textScale: v })}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'large', label: 'Large' },
            { value: 'larger', label: 'Larger' },
          ]}
        />
        <SegmentRow
          icon="sparkles-outline"
          title="Motion"
          value={prefs.motion}
          onChange={(v) => setPrefs({ motion: v })}
          options={[
            { value: 'system', label: 'Follow iOS' },
            { value: 'reduce', label: 'Reduce' },
          ]}
        />
        <ToggleRow title="Haptics" subtitle="Light taps when you check in or start a session" value={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} />
      </Tiles>

      <SectionHeader title="Privacy & data" />
      <Tiles>
        <Row icon="hand-left-outline" title="How your data is handled" chevron onPress={() => router.push('/settings/privacy')} />
        <Row icon="share-outline" title="Export data" subtitle="A JSON file of everything stored on this phone" chevron onPress={doExport} />
        <Row icon="trash-outline" title="Delete all data" subtitle="Removes tasks, habits, history and settings" onPress={doDelete} />
      </Tiles>

      <T v="footnote" color={colors.tertiary} center style={{ marginTop: space.xxl }}>
        {APP_NAME} {APP_VERSION} · working name
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
