import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useApp } from '../state/AppProvider';

/**
 * Abstract chrome-and-glass shapes behind the content, after the reference:
 * a polished ring and a glass prism with faint red/blue fringing at the edges.
 * They drift very slowly; reduced motion holds them still. Purely decorative.
 */
export function GlassBackdrop({ variant = 'ring' }: { variant?: 'ring' | 'prism' | 'both' }) {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useApp();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduceMotion, t]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -18 + t.value * 36 }, { rotate: `${-14 + t.value * 10}deg` }],
  }));
  const prismStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 14 - t.value * 28 }, { rotate: `${22 - t.value * 8}deg` }],
  }));

  const s = Math.min(width * 1.25, 520);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      {variant !== 'prism' ? (
        <Animated.View style={[{ position: 'absolute', top: height * 0.06, right: -s * 0.38, width: s, height: s }, ringStyle]}>
          <ChromeRing size={s} />
        </Animated.View>
      ) : null}
      {variant !== 'ring' ? (
        <Animated.View style={[{ position: 'absolute', top: height * 0.44, left: -s * 0.3, width: s * 0.9, height: s * 0.9 }, prismStyle]}>
          <Prism size={s * 0.9} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function ChromeRing({ size }: { size: number }) {
  const c = size / 2;
  const rx = size * 0.42;
  const ry = size * 0.26;
  const w = size * 0.11;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="chrome" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="0.28" stopColor="#5A5A60" stopOpacity="0.9" />
          <Stop offset="0.5" stopColor="#0B0B0C" stopOpacity="0.95" />
          <Stop offset="0.7" stopColor="#D8D8DE" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#2A2A2E" stopOpacity="0.9" />
        </LinearGradient>
        <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <G rotation={-28} origin={`${c}, ${c}`}>
        {/* Chromatic fringe: faint red and blue copies, offset a few points. */}
        <Ellipse cx={c - 3} cy={c + 2} rx={rx} ry={ry} stroke="#FF3B30" strokeOpacity={0.28} strokeWidth={w} fill="none" />
        <Ellipse cx={c + 3} cy={c - 2} rx={rx} ry={ry} stroke="#0A84FF" strokeOpacity={0.32} strokeWidth={w} fill="none" />
        <Ellipse cx={c} cy={c} rx={rx} ry={ry} stroke="url(#chrome)" strokeWidth={w} fill="none" />
        <Ellipse cx={c} cy={c - w * 0.22} rx={rx} ry={ry} stroke="url(#sheen)" strokeOpacity={0.55} strokeWidth={w * 0.12} fill="none" />
      </G>
    </Svg>
  );
}

function Prism({ size }: { size: number }) {
  const p = (x: number, y: number) => `${x * size},${y * size}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="0.45" stopColor="#9A9AA2" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.35" />
        </LinearGradient>
        <RadialGradient id="core" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d={`M${p(0.08, 0.72)} L${p(0.52, 0.06)} L${p(0.94, 0.62)} Z`} fill="url(#glass)" />
      <Path d={`M${p(0.08, 0.72)} L${p(0.52, 0.06)}`} stroke="#FF453A" strokeOpacity={0.45} strokeWidth={3} />
      <Path d={`M${p(0.1, 0.735)} L${p(0.54, 0.075)}`} stroke="#64D2FF" strokeOpacity={0.5} strokeWidth={3} />
      <Path d={`M${p(0.52, 0.06)} L${p(0.94, 0.62)}`} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1.5} />
      <Ellipse cx={size * 0.5} cy={size * 0.5} rx={size * 0.16} ry={size * 0.1} fill="url(#core)" opacity={0.6} />
    </Svg>
  );
}
