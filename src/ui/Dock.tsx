import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeMs } from '../domain/focus';
import { getOpenSession } from '../repos/sessions';
import { useApp, useNow, useQuery } from '../state/AppProvider';
import { IconName, Ring } from './components';
import { Glass } from './Glass';
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
 * Always visible; it does not hide on scroll.
 */
export function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useApp();
  const haptics = useHaptics();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const itemW = width / count;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = state.index * itemW;
    x.value = reduceMotion || !width ? target : withSpring(target, SPRING);
  }, [state.index, itemW, reduceMotion, width, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}>
      <View style={{ flex: 1, height: H }}>
        <View
          style={styles.pill}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}
        >
          <Glass radius={H / 2} tint="rgba(20,20,22,0.35)" style={StyleSheet.absoluteFill} />
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
        </View>

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
      accessibilityLabel={open ? `Open current session, ${Math.round(progress * 100)} percent done` : 'Lock in'}
      accessibilityHint="Start a lock-in or open the current one"
      onPress={onPress}
      style={({ pressed }) => [styles.focus, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Glass radius={H / 2} tint="rgba(20,20,22,0.35)" style={StyleSheet.absoluteFill} interactive />
      {open ? (
        <Ring size={H - 8} stroke={3} progress={progress} animate={false}>
          <Ionicons name={open.status === 'paused' ? 'pause' : 'hourglass'} size={22} color={colors.text} />
        </Ring>
      ) : (
        <Ionicons name="lock-closed-outline" size={24} color={colors.text} />
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
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: (H - 8) / 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 12, fontWeight: '600' },
  focus: {
    width: H,
    height: H,
    borderRadius: H / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
