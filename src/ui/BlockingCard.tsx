import React, { useMemo, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { BlockingReadiness, blockingReadiness } from '../domain/lockin';
import { blocking } from '../native/blocking';
import { selectionCount } from '../native/blocking/types';
import { useApp } from '../state/AppProvider';
import { Button, Card, IconBubble, SmallButton, T, ToggleRow } from './components';
import { colors, space } from './theme';

export function useBlockingReadiness(): BlockingReadiness {
  const { prefs, version } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const avail = useMemo(() => blocking.availability(), [version]);
  return blockingReadiness(avail, prefs.blockingEnabled);
}

/**
 * Sets up and controls blocking where you start a lock-in: one button asks for
 * Screen Time access and then opens Apple's app picker. Never claims blocking
 * is on unless it is ready.
 */
export function BlockingCard() {
  const { setPrefs, refresh } = useApp();
  const r = useBlockingReadiness();
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    try {
      const s = await blocking.chooseApps();
      if (s && selectionCount(s) > 0) setPrefs({ blockingEnabled: true });
    } catch (e) {
      Alert.alert('Couldn’t open the app picker', String(e));
    }
    refresh();
  };

  const setUp = async () => {
    setBusy(true);
    try {
      const res = await blocking.requestAuthorization();
      if (res.availability.state === 'approved') {
        await choose();
      } else {
        Alert.alert(
          'Screen Time access not given',
          'You can still lock in; apps just won’t be blocked. Try again any time.',
        );
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  switch (r.kind) {
    case 'unavailable':
      return (
        <Card style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
          <IconBubble name="lock-open-outline" />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="callout">App blocking unavailable</T>
            <T v="footnote" color={colors.secondary}>
              {r.detail}
            </T>
          </View>
        </Card>
      );
    case 'needs_permission':
    case 'denied':
      return (
        <Card style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <IconBubble name="lock-closed-outline" />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="headline">Block distracting apps</T>
              <T v="footnote" color={colors.secondary}>
                {r.kind === 'denied'
                  ? 'Screen Time access is off. Turn it on to block apps while you’re locked in.'
                  : 'Uses Apple’s Screen Time. You pick the apps; Dialed never sees which ones.'}
              </T>
            </View>
          </View>
          <Button title="Set up blocking" icon="lock-closed" onPress={setUp} loading={busy} />
          {r.kind === 'denied' ? <Button title="Open iOS Settings" kind="plain" onPress={() => Linking.openSettings()} /> : null}
        </Card>
      );
    case 'needs_apps':
      return (
        <Card style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <IconBubble name="apps-outline" />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="headline">Choose apps to block</T>
              <T v="footnote" color={colors.secondary}>
                Screen Time is on. Pick what distracts you.
              </T>
            </View>
          </View>
          <Button title="Choose apps" icon="apps" onPress={choose} />
        </Card>
      );
    case 'ready':
      return (
        <Card style={{ padding: 0 }}>
          <ToggleRow
            title={`Block ${r.count} ${r.count === 1 ? 'app or site' : 'apps and sites'}`}
            subtitle={r.on ? 'Blocked until the session ends. Unlocked while paused.' : 'Off for this lock-in'}
            value={r.on}
            onChange={(v) => setPrefs({ blockingEnabled: v })}
          />
          <View style={{ paddingHorizontal: space.l, paddingBottom: space.m, flexDirection: 'row' }}>
            <SmallButton title="Change apps" icon="swap-horizontal" onPress={choose} />
          </View>
        </Card>
      );
  }
}
