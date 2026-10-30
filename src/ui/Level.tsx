import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { useApp } from '../state/AppProvider';
import { T } from './components';
import { colors, font } from './theme';

/** One laurel branch: a curved stem with pointed leaves in pairs. Mirrored for the right side. */
export function Laurel({ size = 120, side = 'left', color = '#DCE4F0' }: { size?: number; side?: 'left' | 'right'; color?: string }) {
  const h = size;
  const w = size * 0.5;
  // The stem is the left part of a circle centred just right of this box.
  const r = h * 0.44;
  const cx = w + r * 0.45;
  const cy = h * 0.5;
  const at = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(t), y: cy - r * Math.sin(t), t };
  };
  const leaf = (k: number) => `M0 0 C ${6.5 * k} ${-5 * k}, ${7 * k} ${-14 * k}, 0 ${-21 * k} C ${-7 * k} ${-14 * k}, ${-6.5 * k} ${-5 * k}, 0 0 Z`;
  const start = 245;
  const end = 128;
  const N = 7;
  const leaves: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const deg = start - ((start - end) * i) / (N - 1);
    const { x, y, t } = at(deg);
    // Direction of travel up the stem, as a rotation from "pointing up".
    const dir = (Math.atan2(Math.sin(t), -Math.cos(t)) * 180) / Math.PI;
    const k = (size / 120) * (1.05 - i * 0.07);
    leaves.push(
      <Path key={`o${i}`} d={leaf(k)} fill={color} opacity={0.95} transform={`translate(${x} ${y}) rotate(${dir - 48})`} />,
      <Path key={`i${i}`} d={leaf(k * 0.85)} fill={color} opacity={0.75} transform={`translate(${x} ${y}) rotate(${dir + 42})`} />,
    );
  }
  const tip = at(end - 6);
  const tipDir = (Math.atan2(Math.sin(tip.t), -Math.cos(tip.t)) * 180) / Math.PI;
  const a = at(start + 6);
  const z = at(end - 6);
  const stem = `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${z.x} ${z.y}`;
  return (
    <Svg width={w} height={h} style={side === 'right' ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d={stem} stroke={color} strokeWidth={Math.max(1.4, size / 60)} fill="none" strokeLinecap="round" opacity={0.85} />
      {leaves}
      <Path d={leaf((size / 120) * 0.7)} fill={color} transform={`translate(${tip.x} ${tip.y}) rotate(${tipDir})`} />
    </Svg>
  );
}

/** Soft light and faint orbit lines behind the level, after the reference. */
export function HeroGlow({ width, height }: { width: number; height: number }) {
  const cx = width / 2;
  const cy = height * 0.48;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx={cx} cy={cy} r={width * 0.75} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#9DB7FF" stopOpacity="0.32" />
          <Stop offset="0.4" stopColor="#5B6E9C" stopOpacity="0.14" />
          <Stop offset="1" stopColor="#050506" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={width * 0.75} fill="url(#glow)" />
      {[0.32, 0.5, 0.7].map((k) => (
        <Circle key={k} cx={cx} cy={cy} r={width * k} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={1} fill="none" />
      ))}
      <Ellipse cx={cx - width * 0.22} cy={cy} rx={width * 0.5} ry={width * 0.5} stroke="#FFFFFF" strokeOpacity={0.04} fill="none" />
      <Ellipse cx={cx + width * 0.22} cy={cy} rx={width * 0.5} ry={width * 0.5} stroke="#FFFFFF" strokeOpacity={0.04} fill="none" />
    </Svg>
  );
}

/** Level number between two laurels. */
export function LevelBadge({ level, size = 1 }: { level: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={`Level ${level}`}>
      <Laurel size={150 * size} side="left" />
      <View style={{ alignItems: 'center', minWidth: 92 * size, marginTop: -6 }}>
        <T v="display" style={{ fontSize: 64 * size, lineHeight: 70 * size, fontWeight: '700', letterSpacing: -1.5 }}>
          {level}
        </T>
        <T v="caption" style={{ fontWeight: '700', letterSpacing: 1.6, fontSize: 13 * size }}>
          LEVEL
        </T>
      </View>
      <Laurel size={150 * size} side="right" />
    </View>
  );
}

/** Glass pill with a glowing fill, as in the reference. Fills up on appear. */
export function GlowBar({ progress, width = 220, height = 44 }: { progress: number; width?: number; height?: number }) {
  const { reduceMotion } = useApp();
  const p = useSharedValue(reduceMotion ? progress : 0);
  useEffect(() => {
    p.value = reduceMotion ? progress : withDelay(250, withTiming(progress, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [progress, reduceMotion, p]);
  const inner = width - 8;
  const fill = useAnimatedStyle(() => ({ width: Math.max(height - 8, inner * Math.min(1, Math.max(0, p.value))) }));
  return (
    <View
      style={[styles.track, { width, height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Animated.View style={[styles.fill, { height: height - 8, borderRadius: (height - 8) / 2 }, fill]}>
        <LinearGradient
          colors={['#6A9BFF', '#2F63F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: (height - 8) / 2 }]}
        />
      </Animated.View>
    </View>
  );
}

/** Small pill for headers: mini laurel and the level. Opens the Level screen. */
export function LevelChip({ level, onPress }: { level: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Level ${level}. Open your level.`}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
      hitSlop={6}
    >
      <Laurel size={22} side="left" color={colors.text} />
      <T v="subhead" style={{ fontFamily: font('700'), fontVariant: ['tabular-nums'] }}>
        {level}
      </T>
      <Laurel size={22} side="right" color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  fill: {
    shadowColor: '#C9D8FF',
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  chip: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
});
