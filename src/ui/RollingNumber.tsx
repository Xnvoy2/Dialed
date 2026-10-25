import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useApp } from '../state/AppProvider';
import { T } from './components';
import { TEXT_SCALE, Variant, colors, type } from './theme';

/**
 * Digits roll when a real value changes (e.g. today's focus minutes after a
 * session). Not used for the countdown, and never for money.
 */
export function RollingNumber({ value, v = 'title', color = colors.text }: { value: number; v?: Variant; color?: string }) {
  const { reduceMotion, prefs } = useApp();
  const text = String(Math.max(0, Math.round(value)));
  const lh = (type[v].lineHeight ?? 34) * (TEXT_SCALE[prefs.textScale] ?? 1);
  if (reduceMotion) {
    return (
      <T v={v} color={color} style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </T>
    );
  }
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={text}>
      {text.split('').map((ch, i) => (
        <Digit key={`${text.length}-${i}`} digit={Number(ch)} lh={lh} v={v} color={color} />
      ))}
    </View>
  );
}

function Digit({ digit, lh, v, color }: { digit: number; lh: number; v: Variant; color: string }) {
  const y = useSharedValue(-digit * lh);
  useEffect(() => {
    y.value = withSpring(-digit * lh, { damping: 20, stiffness: 180 });
  }, [digit, lh, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height: lh, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants">
      <Animated.View style={style}>
        {Array.from({ length: 10 }, (_, n) => (
          <T key={n} v={v} color={color} style={{ height: lh, fontVariant: ['tabular-nums'] }}>
            {n}
          </T>
        ))}
      </Animated.View>
    </View>
  );
}
