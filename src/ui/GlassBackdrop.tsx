import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useApp } from '../state/AppProvider';

/**
 * One rendered 3D glass object per page (made with tools/glass-render), sitting
 * behind the content so the glass cards refract it. Each page gets its own
 * shape. It drifts very slowly; reduced motion holds it still.
 */
const SCENES = {
  today: require('../../assets/glass/today.jpg'),
  habits: require('../../assets/glass/habits.jpg'),
  progress: require('../../assets/glass/progress.jpg'),
  rewards: require('../../assets/glass/rewards.jpg'),
  lockin: require('../../assets/glass/lockin.jpg'),
} as const;

export type GlassScene = keyof typeof SCENES;

export function GlassBackdrop({ scene }: { scene: GlassScene }) {
  const { reduceMotion } = useApp();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduceMotion, t]);

  const drift = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 + t.value * 12 }, { scale: 1.02 + t.value * 0.02 }],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Image source={SCENES[scene]} resizeMode="cover" style={styles.image} accessible={false} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', backgroundColor: '#050506' },
  image: { width: '100%', height: '100%' },
});
