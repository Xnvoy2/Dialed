import React, { useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatClock } from '../../domain/dates';
import { blocking } from '../../native/blocking';
import { describeSelection, selectionCount } from '../../native/blocking/types';
import { getOpenSession } from '../../repos/sessions';
import { useApp } from '../../state/AppProvider';
import { Button, Group, Note, Row, SectionHeader, T, Tiles, ToggleRow } from '../../ui/components';
import { SIDE, colors, space } from '../../ui/theme';
import { SheetHeader } from '../../ui/SheetHeader';

export default function BlockingSettings() {
  const insets = useSafeAreaInsets();
  const { db, prefs, setPrefs, refresh, version } = useApp();
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avail = React.useMemo(() => blocking.availability(), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diag = React.useMemo(() => blocking.diagnostics(), [version, testResult]);

  const authorise = async () => {
    setBusy(true);
    try {
      const r = await blocking.requestAuthorization();
      if (r.declined) {
        Alert.alert('Screen Time access not granted', 'Everything else works as normal. Blocking stays off until you allow it.');
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const choose = async () => {
    try {
      const s = await blocking.chooseApps();
      if (s && selectionCount(s) > 0) setPrefs({ blockingEnabled: true });
    } catch (e) {
      Alert.alert('Couldn’t open the app picker', String(e));
    }
    refresh();
  };

  /** Device test: shield for 2 minutes, then let the system lift it (even if the app is killed). */
  const runExpiryTest = async () => {
    if (getOpenSession(db)) {
      Alert.alert('A session is running', 'Run this test when no session is active.');
      return;
    }
    const endsAt = Date.now() + 2 * 60_000;
    const r = await blocking.startShield(endsAt, { reason: 'Testing the shield', resetCounts: false });
    setTestResult(
      r.applied
        ? `Shield applied (verified). Auto-removal ${r.autoExpiry ? `scheduled for ${formatClock(endsAt)}` : `NOT scheduled: ${r.reason ?? 'unknown'}`}. Force-quit the app and check the apps unlock on time.`
        : `Shield not applied: ${r.reason ?? 'unknown'}`,
    );
    refresh();
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <SheetHeader title="App blocking" action="back" />
      <View style={{ padding: SIDE, gap: space.s }}>
        <T v="subhead" color={colors.secondary}>
          Optionally shield chosen apps while you focus, using Apple’s Screen Time. You pick the apps in Apple’s own
          picker; this app only receives anonymous tokens, never app names or your usage.
        </T>
      </View>

      {avail.state === 'unsupported' ? (
        <Tiles>
          <Row icon="alert-circle-outline" title="Not available in this build" subtitle={avail.reason} />
        </Tiles>
      ) : (
        <>
          <SectionHeader title="1. Screen Time access" />
          <Tiles>
            <Row
              icon={avail.state === 'approved' ? 'checkmark-circle' : 'ellipse-outline'}
              title={avail.state === 'approved' ? 'Allowed' : avail.state === 'denied' ? 'Not allowed' : 'Not asked yet'}
              subtitle={
                avail.state === 'denied'
                  ? 'Turn it on in iOS Settings › Screen Time, or try again.'
                  : avail.state === 'approved'
                    ? 'You can turn this off any time in iOS Settings.'
                    : 'iOS will confirm with Face ID or your passcode.'
              }
            />
          </Tiles>
          {avail.state !== 'approved' ? (
            <View style={{ paddingHorizontal: SIDE, marginTop: space.m, gap: space.s }}>
              <Button title="Allow Screen Time access" onPress={authorise} loading={busy} />
              {avail.state === 'denied' ? <Button title="Open iOS Settings" kind="secondary" onPress={() => Linking.openSettings()} /> : null}
            </View>
          ) : null}

          {avail.state === 'approved' ? (
            <>
              <SectionHeader title="2. Apps to block" />
              <Tiles>
                <Row icon="apps-outline" title="Choose apps and sites" value={describeSelection(avail.selection)} chevron onPress={choose} />
              </Tiles>
              <SectionHeader title="3. During focus" />
              <Tiles>
                <ToggleRow
                  title="Block chosen apps during focus"
                  subtitle="Lifted when you pause, end, or the session finishes."
                  value={prefs.blockingEnabled}
                  disabled={selectionCount(avail.selection) === 0}
                  onChange={(v) => setPrefs({ blockingEnabled: v })}
                />
              </Tiles>
            </>
          ) : null}
        </>
      )}

      <View style={{ height: space.m }} />
      <Note>
        Blocking helps you avoid reflex app opens on this iPhone. It can’t prove you were working, and it doesn’t
        affect your other devices. Leaving this app is not treated as a distraction.
      </Note>

      {diag ? (
        <>
          <SectionHeader title="Diagnostics" />
          <Group>
            <Row title="Running in Simulator" value={diag.isSimulator ? 'Yes' : 'No'} />
            <Row title="Shield active now (read back)" value={diag.shielded ? 'Yes' : 'No'} />
            <Row title="Expiry monitor scheduled" value={diag.monitoring ? 'Yes' : 'No'} />
            {diag.endsAtMs ? <Row title="Shield ends" value={formatClock(diag.endsAtMs)} /> : null}
            <Row
              title="Extension last lifted a shield"
              value={diag.extensionLastClearedAtMs ? formatClock(diag.extensionLastClearedAtMs) : 'Never'}
            />
          </Group>
          {avail.state === 'approved' && selectionCount(avail.selection) > 0 ? (
            <View style={{ paddingHorizontal: SIDE, marginTop: space.m, gap: space.s }}>
              <Button title="Test: shield for 2 minutes" kind="secondary" onPress={runExpiryTest} />
              <Button
                title="Lift shield now"
                kind="plain"
                onPress={async () => {
                  await blocking.stopShield();
                  setTestResult('Shield lifted.');
                  refresh();
                }}
              />
              {testResult ? (
                <T v="footnote" color={colors.secondary}>
                  {testResult}
                </T>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
