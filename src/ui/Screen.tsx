import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import React from 'react';
import { RefreshControlProps, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, T } from './components';
import { GlassBackdrop } from './GlassBackdrop';
import { SIDE, colors, space } from './theme';

export const DOCK_SPACE = 110;
const BAR = 52;

/**
 * Large left-aligned title that hands over to a small centred title on
 * scroll, with the settings control top-right (as in the reference).
 */
export function Screen({
  title,
  subtitle,
  headerRight,
  children,
  refreshControl,
  backdrop = 'ring',
}: {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  backdrop?: 'ring' | 'prism' | 'both' | 'none';
}) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [24, 56], [0, 1], 'clamp') }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {backdrop !== 'none' ? <GlassBackdrop variant={backdrop} /> : null}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingTop: insets.top + BAR, paddingBottom: insets.bottom + DOCK_SPACE }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: SIDE, marginBottom: space.l, marginTop: space.s }}>
          <T v="largeTitle" accessibilityRole="header">
            {title}
          </T>
          {subtitle ? (
            <T v="subhead" color={colors.secondary} style={{ marginTop: 2 }}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {children}
      </Animated.ScrollView>

      <View pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top, height: insets.top + BAR }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, barStyle]}>
          <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,23,0.6)' }]} />
          <View style={styles.hairline} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.smallTitle, { top: insets.top }, barStyle]}>
          <T v="headline" importantForAccessibility="no" accessibilityElementsHidden>
            {title}
          </T>
        </Animated.View>
        <View style={styles.right}>
          {headerRight}
          <IconButton name="person" label="Settings" onPress={() => router.push('/settings')} size={38} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'center' },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  smallTitle: { position: 'absolute', left: 80, right: 80, height: BAR, alignItems: 'center', justifyContent: 'center' },
  right: {
    position: 'absolute',
    right: SIDE - 4,
    bottom: 8,
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'center',
  },
});
