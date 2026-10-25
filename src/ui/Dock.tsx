import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { activeMs } from '../domain/focus';
import { getOpenSession } from '../repos/sessions';
import { useApp, useNow, useQuery } from '../state/AppProvider';
import { IconName, Ring } from './components';
import { useDockCollapse } from './dockState';
import { useHaptics } from './haptics';
import { colors } from './theme';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['sunny-outline', 'sunny'],
  habits: ['repeat-outline', 'repeat'],
  progress: ['stats-chart-outline', 'stats-chart'],
  rewards: ['wallet-outline', 'wallet'],
};
const LABELS: Record<string, string> = { index: 'Today', habits: 'Habits', progress: 'Progress', rewards: 'Rewards' };
const SPRING = { damping: 22, stiffness: 260, mass: 0.9 };
const H = 64;

/**
 * Floating glass pill with a separate round Focus button, after the reference.
 * Scrolling down collapses it to two small buttons; scrolling up restores it.
 */
export function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useApp();
  const haptics = useHaptics();
  const collapsed = useDockCollapse();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const itemW = width / count;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = state.index * itemW;
    x.value = reduceMotion || !width ? target : withSpring(target, SPRING);
  }, [state.index, itemW, reduceMotion, width, x]);

  // Expand whenever the tab changes.
  useEffect(() => {
    if (collapsed) collapsed.value = 0;
  }, [state.index, collapsed]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const zero = useSharedValue(0);
  const target = collapsed ?? zero;
  const progress = useDerivedValue(() =>
    reduceMotion ? (target.value > 0.5 ? 1 : 0) : withTiming(target.value, { duration: 220 }),
  );
  const pillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.92]) }],
  }));
  const miniStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.8, 1]) }],
  }));
  const [pillInteractive, setPillInteractive] = useState(true);
  // Mirror the shared value into React state so hidden controls can't be tapped.
  useAnimatedReaction(
    () => (collapsed?.value ?? 0) < 0.5,
    (expanded, prev) => {
      if (expanded !== prev) scheduleOnRN(setPillInteractive, expanded);
    },
  );

  const current = state.routes[state.index];
  const [, currentIcon] = ICONS[current?.name] ?? ['ellipse', 'ellipse'];

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}>
      <View style={{ flex: 1, height: H }} pointerEvents="box-none">
        <Animated.View
          pointerEvents={pillInteractive ? 'auto' : 'none'}
          style={[styles.pill, pillStyle]}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}
        >
          <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.dock }]} />
          {width > 0 ? <Animated.View style={[styles.indicator, { width: itemW }, indicator]} /> : null}
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const [off, on] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
            const label = LABELS[route.name] ?? route.name;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={() => {
                  if (!focused) haptics.select();
                  navigateToTab(route.key);
                }}
                style={styles.item}
              >
                <Ionicons name={focused ? on : off} size={21} color={focused ? colors.text : colors.secondary} />
                <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: focused ? colors.text : colors.secondary }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>

        <Animated.View pointerEvents={pillInteractive ? 'none' : 'auto'} style={[styles.miniWrap, miniStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${LABELS[current?.name] ?? ''}. Show tabs`}
            onPress={() => {
              if (collapsed) collapsed.value = 0;
            }}
            style={styles.mini}
          >
            <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.dock }]} />
            <Ionicons name={currentIcon} size={21} color={colors.text} />
          </Pressable>
        </Animated.View>
      </View>

      <FocusButton
        onPress={() => {
          haptics.impact();
          router.push('/focus');
        }}
      />
    </View>
  );
}

/** Glass circle; while a session runs, a ring shows how far through it you are. */
function FocusButton({ onPress }: { onPress: () => void }) {
  const open = useQuery((db) => getOpenSession(db));
  const now = useNow(5000, open?.status === 'running');
  const progress = open ? activeMs(open, now) / (open.plannedSeconds * 1000) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? `Open current session, ${Math.round(progress * 100)} percent done` : 'Focus'}
      accessibilityHint="Opens the focus timer"
      onPress={onPress}
      style={({ pressed }) => [styles.focus, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.dock }]} />
      {open ? (
        <Ring size={H - 8} stroke={3} progress={progress} animate={false}>
          <Ionicons name={open.status === 'paused' ? 'pause' : 'hourglass'} size={22} color={colors.text} />
        </Ring>
      ) : (
        <Ionicons name="timer-outline" size={25} color={colors.text} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: H / 2,
    flexDirection: 'row',
    padding: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: (H - 8) / 2,
    backgroundColor: colors.dockActive,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 12, fontWeight: '600' },
  miniWrap: { position: 'absolute', left: 0, top: 0 },
  mini: {
    width: H,
    height: H,
    borderRadius: H / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  focus: {
    width: H,
    height: H,
    borderRadius: H / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
