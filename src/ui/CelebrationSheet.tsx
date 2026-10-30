import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useApp } from '../state/AppProvider';
import { T } from './components';
import { useHaptics } from './haptics';
import { colors, font } from './theme';

export type Celebration =
  | {
      kind: 'reward';
      /** Big figure, e.g. "0.50". */
      amount: string;
      /** Shown as a tag so a test reward is never mistaken for money. */
      tag: string;
      title: string;
      body: string;
      action: string;
    }
  | { kind: 'level'; level: number; title: string; body: string; action: string };

/**
 * Bottom sheet that celebrates an earned reward or a new level: confetti, a
 * chrome figure with a metal plate, and one clear action.
 */
export function CelebrationSheet({
  item,
  onAction,
  onClose,
}: {
  item: Celebration | null;
  onAction: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useApp();
  const haptics = useHaptics();

  useEffect(() => {
    if (item) haptics.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  return (
    <Modal visible={!!item} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {item ? (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, styles.scrim]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          <Animated.View
            entering={reduceMotion ? FadeIn : SlideInDown.springify().damping(20).stiffness(180)}
            exiting={reduceMotion ? FadeOut : SlideOutDown.duration(220)}
            style={[styles.sheet, { marginBottom: Math.max(insets.bottom, 10) }]}
            accessibilityViewIsModal
          >
            <View style={styles.grabber} />
            <View style={styles.stage}>
              {reduceMotion ? null : <Confetti />}
              <Chrome text={item.kind === 'reward' ? item.amount : String(item.level)} prefix={item.kind === 'reward' ? '$' : 'LV '} />
              <Plate text={item.kind === 'reward' ? 'YOU EARNED' : 'LEVEL UP'} />
            </View>
            {item.kind === 'reward' ? (
              <View style={styles.tag}>
                <T v="caption" color={colors.onPrimary} style={{ fontWeight: '700', letterSpacing: 0.6 }}>
                  {item.tag}
                </T>
              </View>
            ) : null}
            <T v="title2" center accessibilityRole="header" style={{ fontWeight: '700', marginTop: 14 }}>
              {item.title}
            </T>
            <T v="subhead" color={colors.secondary} center style={{ marginTop: 6, paddingHorizontal: 12 }}>
              {item.body}
            </T>
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <LinearGradient
                colors={['#6A9BFF', '#2F63F0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
              />
              <T v="headline" color={colors.onPrimary} style={{ fontWeight: '700' }}>
                {item.action}
              </T>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 12 }}>
              <T v="subhead" color={colors.secondary} style={{ fontWeight: '600' }}>
                Not now
              </T>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

/** Polished chrome figure, drawn as SVG text with a metal gradient. */
function Chrome({ text, prefix }: { text: string; prefix: string }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 60, 330);
  const label = `${prefix}${text}`;
  const size = label.length > 6 ? 64 : 76;
  return (
    <Svg width={w} height={96} accessibilityLabel={label}>
      <Defs>
        <SvgGradient id="metal" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.45" stopColor="#D9DCE3" />
          <Stop offset="0.55" stopColor="#8D919B" />
          <Stop offset="0.8" stopColor="#E9ECF2" />
          <Stop offset="1" stopColor="#A6AAB4" />
        </SvgGradient>
      </Defs>
      <SvgText
        x={w / 2}
        y={78}
        fontSize={size}
        fontFamily={font('800')}
        textAnchor="middle"
        fill="url(#metal)"
        stroke="#FFFFFF"
        strokeOpacity={0.35}
        strokeWidth={0.8}
        letterSpacing={-1.5}
      >
        {label}
      </SvgText>
    </Svg>
  );
}

/** Brushed metal plate with screws, slightly tilted, over the figure. */
function Plate({ text }: { text: string }) {
  const W = 150;
  const H = 40;
  return (
    <View style={{ marginTop: -20, transform: [{ rotate: '-4deg' }] }}>
      <Svg width={W} height={H}>
        <Defs>
          <SvgGradient id="plate" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F7F8FA" />
            <Stop offset="0.5" stopColor="#C9CCD3" />
            <Stop offset="1" stopColor="#ECEEF2" />
          </SvgGradient>
        </Defs>
        <Rect x={1} y={1} width={W - 2} height={H - 2} rx={7} fill="url(#plate)" stroke="#FFFFFF" strokeWidth={1} />
        {[
          [9, 9],
          [W - 9, 9],
          [9, H - 9],
          [W - 9, H - 9],
        ].map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2} fill="#9A9EA8" />
        ))}
        <SvgText x={W / 2} y={H / 2 + 6} fontSize={16} fontFamily={font('800')} textAnchor="middle" fill="#6B6F78" letterSpacing={1}>
          {text}
        </SvgText>
      </Svg>
    </View>
  );
}

const PIECES = 26;
const TINTS = ['#FFFFFF', '#D6DBE5', '#B9CCFF', '#9FE3D0', '#E9ECF2'];

/** Paper bits that drift down and tumble, looping gently behind the figure. */
function Confetti() {
  const { width } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * (width - 40),
        delay: Math.random() * 1400,
        duration: 2600 + Math.random() * 2200,
        w: 4 + Math.random() * 5,
        h: 8 + Math.random() * 10,
        spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        tint: TINTS[i % TINTS.length],
      })),
    [width],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} />
      ))}
    </View>
  );
}

function Piece({ x, delay, duration, w, h, spin, tint }: { x: number; delay: number; duration: number; w: number; h: number; spin: number; tint: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [delay, duration, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.08 ? t.value / 0.08 : t.value > 0.8 ? (1 - t.value) / 0.2 : 1,
    transform: [{ translateY: -20 + t.value * 190 }, { translateX: Math.sin(t.value * 6) * 8 }, { rotate: `${t.value * spin}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: w, height: h, borderRadius: 1.5, backgroundColor: tint }, style]} />;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    borderRadius: 34,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  stage: { height: 170, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  tag: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  cta: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    shadowColor: '#C9D8FF',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
});
