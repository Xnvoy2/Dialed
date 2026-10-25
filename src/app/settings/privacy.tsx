import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../../config/app';
import { IconBubble, IconName, T, Tiles } from '../../ui/components';
import { colors, space } from '../../ui/theme';

const SECTIONS: [IconName, string, string][] = [
  [
    'phone-portrait-outline',
    'Stored on this phone',
    'Tasks, notes, habits, check-ins, focus sessions and settings live in a local database on this iPhone. The app works fully offline.',
  ],
  ['eye-off-outline', 'No account, no tracking', `${APP_NAME} has no sign-in, no analytics and no telemetry. Nothing about your tasks or habits is sent anywhere.`],
  [
    'lock-closed-outline',
    'Screen Time',
    'If you turn on app blocking, Apple’s picker gives the app anonymous tokens for the apps you choose. The app can’t see app names, your browsing or how you use your phone, and the tokens never leave this device.',
  ],
  ['notifications-outline', 'Notifications', 'Session alerts are scheduled on the device and use generic wording, so task names don’t appear on your lock screen.'],
  [
    'wallet-outline',
    'Future rewards',
    'If USDC rewards launch, only what’s needed to check a stated rule would go to the server (for example, a session’s length). Task names, habit names and notes would stay on this phone.',
  ],
  ['options-outline', 'Your control', 'Export everything as a JSON file, or delete it all, from Settings › Privacy & data.'],
];

export default function Privacy() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: space.s, paddingBottom: insets.bottom + 40 }}>
      <Tiles>
        {SECTIONS.map(([icon, h, b]) => (
          <View key={h} style={{ flexDirection: 'row', gap: space.m, padding: space.l }}>
            <IconBubble name={icon} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="headline">{h}</T>
              <T v="subhead" color={colors.secondary}>
                {b}
              </T>
            </View>
          </View>
        ))}
      </Tiles>
    </ScrollView>
  );
}
