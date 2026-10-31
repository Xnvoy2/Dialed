import { Redirect, router } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import React, { useEffect } from 'react';
import { useApp } from '../../state/AppProvider';
import { Dock } from '../../ui/Dock';
import { colors } from '../../ui/theme';

export default function TabsLayout() {
  const { prefs, justCompletedId } = useApp();
  // A session finished while the app was away: show its completion step.
  useEffect(() => {
    if (prefs.onboarded && justCompletedId) router.push('/focus');
  }, [prefs.onboarded, justCompletedId]);
  // First open: the setup questions. Sign-in is optional (only Rewards needs it).
  if (!prefs.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="habits" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="rewards" />
    </Tabs>
  );
}
