import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../ui/theme';

export default function SettingsLayout() {
  // Each page draws its own title row (SheetHeader), so there's no header bar.
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
