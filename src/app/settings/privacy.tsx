import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../../config/app';
import { IconBubble, IconName, T, Tiles } from '../../ui/components';
import { colors, space } from '../../ui/theme';
import { SheetHeader } from '../../ui/SheetHeader';

const SECTIONS: [IconName, string, string][] = [
  [
    'phone-portrait-outline',
    'Stored on this phone',
    'Tasks, notes, habits, check-ins, focus sessions and settings live in a local database on this iPhone. They are never sent to us.',
  ],
  [
    'person-circle-outline',
    'Your account',
    'Sign in with Apple gives our server a random ID and the name you share. We never ask for your email.',
  ],
  [
    'wallet-outline',
    'Rewards',
    'For rewards, the server keeps the offers you accept, the numbers needed to check each rule (like a session’s length), your wallet address and your payouts. Payouts are public on the Solana blockchain.',
  ],
  ['shield-checkmark-outline', 'App Attest', 'A device key proves requests come from the real app on a real iPhone. It contains nothing about you.'],
  [
    'lock-closed-outline',
    'Screen Time',
    'If you turn on app blocking, Apple’s picker gives the app anonymous tokens for the apps you choose. The app can’t see app names, your browsing or how you use your phone, and the tokens never leave this device.',
  ],
  ['notifications-outline', 'Notifications', 'Session alerts are scheduled on the device and use generic wording, so task names don’t appear on your lock screen.'],
  ['eye-off-outline', 'No tracking', `${APP_NAME} has no ads, no analytics and no tracking. Nothing is sold or shared.`],
  ['options-outline', 'Your control', 'Export or delete everything on this phone from Settings › Privacy & data, and delete your account from Settings. Full policy: dialed-api-ten.vercel.app/privacy'],
];

export default function Privacy() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingTop: space.s, paddingBottom: insets.bottom + 40 }}>
      <SheetHeader title="Privacy" action="back" />
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
