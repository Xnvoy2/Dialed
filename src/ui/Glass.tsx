import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useApp } from '../state/AppProvider';

let liquid: boolean | null = null;
/** iOS 26+ has Apple's Liquid Glass. Older iOS gets a blur that looks close. */
export function hasLiquidGlass(): boolean {
  if (liquid === null) {
    try {
      liquid = isLiquidGlassAvailable();
    } catch {
      liquid = false;
    }
  }
  return liquid;
}

/**
 * A glass surface. Children sit on top; whatever is behind (the backdrop
 * shapes) is refracted through it. Reduce Transparency/Motion users get a
 * solid surface, which is clearer to read.
 */
export function Glass({
  children,
  style,
  radius = 26,
  tint = 'rgba(28,28,30,0.42)',
  interactive,
  onPress,
  accessibilityLabel,
  clear,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
  interactive?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Clearer glass, for small controls. */
  clear?: boolean;
}) {
  const { reduceMotion } = useApp();
  const shape = { borderRadius: radius, overflow: 'hidden' as const };
  const surface = reduceMotion ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1C1C1E' }]} />
  ) : hasLiquidGlass() ? (
    <GlassView
      style={StyleSheet.absoluteFill}
      glassEffectStyle={clear ? 'clear' : 'regular'}
      colorScheme="dark"
      tintColor={tint}
      isInteractive={interactive}
    />
  ) : (
    <>
      <BlurView tint="dark" intensity={45} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,30,32,0.55)' }]} />
    </>
  );
  const body = (
    <>
      {surface}
      {/* Fine rim light along the edge, like the reference. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.rim]} />
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [shape, style, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[shape, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  rim: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' },
});
