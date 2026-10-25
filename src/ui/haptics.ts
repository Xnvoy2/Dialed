import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { useApp } from '../state/AppProvider';

export function useHaptics() {
  const { prefs } = useApp();
  return useMemo(() => {
    const on = prefs.haptics;
    const safe = (fn: () => Promise<void>) => () => {
      if (on) fn().catch(() => {});
    };
    return {
      select: safe(() => Haptics.selectionAsync()),
      impact: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
      success: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      warning: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    };
  }, [prefs.haptics]);
}
