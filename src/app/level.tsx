import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMinutes } from '../domain/focus';
import { MAX_LEVEL, levelFor, levelName, secondsForLevel } from '../domain/level';
import { focusStreak } from '../domain/streaks';
import { focusDays, focusTotals } from '../repos/sessions';
import { useApp, useQuery } from '../state/AppProvider';
import { Group, Note, Row, SectionHeader, T } from '../ui/components';
import { GlowBar, HeroGlow, LevelBadge } from '../ui/Level';
import { SIDE, colors, space } from '../ui/theme';

const HERO = 470;

export default function LevelScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { reduceMotion } = useApp();
  const totals = useQuery((d) => focusTotals(d));
  const streak = useQuery((d, t) => focusStreak(focusDays(d), t));
  const info = levelFor(totals.seconds);

  // The ladder: the level before, this one and the next four.
  const ladder = Array.from({ length: 6 }, (_, i) => info.level - 1 + i).filter((l) => l >= 1 && l <= MAX_LEVEL);
  const enter = (i: number) => (reduceMotion ? undefined : FadeInDown.delay(120 + i * 70).springify().damping(20));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ height: HERO + insets.top, paddingTop: insets.top }}>
          <HeroGlow width={width} height={HERO + insets.top} />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={22} color={colors.secondary} />
            <T v="body" style={{ fontWeight: '600' }}>
              Back
            </T>
          </Pressable>

          <View style={styles.heroBody}>
            <LevelBadge level={info.level} />
            <T v="subhead" color={colors.secondary} style={{ marginTop: space.s }}>
              {info.name}
            </T>
            <View style={{ marginTop: space.xxl }}>
              <GlowBar progress={info.progress} />
            </View>
            <View style={{ alignItems: 'center', gap: 4, marginTop: space.xl }}>
              <T v="footnote" color={colors.tertiary} style={styles.caps}>
                {info.nextLevel ? 'NEXT LEVEL' : 'TOP LEVEL'}
              </T>
              <T v="subhead" style={[styles.caps, { fontWeight: '600' }]}>
                {info.nextLevel
                  ? `LEVEL ${info.nextLevel} · ${formatMinutes(info.remainingSeconds).toUpperCase()} TO GO`
                  : 'YOU MAXED IT OUT'}
              </T>
            </View>
          </View>
        </View>

        <Animated.View entering={enter(0)}>
          <Group>
            <View style={styles.cardHead}>
              <Ionicons name="hourglass-outline" size={22} color={colors.secondary} />
              <T v="title2" style={{ fontWeight: '700' }}>
                Lock-ins
              </T>
            </View>
            <T v="subhead" color={colors.secondary} style={{ paddingHorizontal: space.l, marginTop: -space.s, marginBottom: space.s }}>
              Your level grows with time you actually lock in.
            </T>
            <Row title="Total locked in" value={formatMinutes(totals.seconds)} />
            <Row title="Sessions" value={String(totals.sessions)} />
            <Row title="Day streak" value={`${streak.current} ${streak.current === 1 ? 'day' : 'days'}`} />
            <Row title="Best streak" value={`${streak.best} ${streak.best === 1 ? 'day' : 'days'}`} />
          </Group>
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <SectionHeader title="The ladder" />
          <Group>
            {ladder.map((l) => {
              const reached = l <= info.level;
              const current = l === info.level;
              return (
                <Row
                  key={l}
                  muted={!reached}
                  leading={
                    <View style={[styles.rung, current && styles.rungNow]}>
                      <T v="subhead" color={current ? colors.onPrimary : reached ? colors.text : colors.tertiary} style={{ fontWeight: '700' }}>
                        {l}
                      </T>
                    </View>
                  }
                  title={levelName(l)}
                  subtitle={l === 1 ? 'Where everyone starts' : `${formatMinutes(secondsForLevel(l))} locked in`}
                  trailing={
                    current ? (
                      <T v="caption" color={colors.secondary}>
                        YOU
                      </T>
                    ) : reached ? (
                      <Ionicons name="checkmark" size={18} color={colors.secondary} />
                    ) : (
                      <Ionicons name="lock-closed-outline" size={16} color={colors.tertiary} />
                    )
                  }
                />
              );
            })}
          </Group>
        </Animated.View>

        <View style={{ paddingHorizontal: SIDE, marginTop: space.xl }}>
          <Note>Levels only track progress. They can’t be bought, spent or swapped for money.</Note>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: SIDE - 4, height: 44, alignSelf: 'flex-start' },
  heroBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: space.xl },
  caps: { letterSpacing: 0.8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.l, paddingBottom: space.m },
  rung: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  rungNow: { backgroundColor: colors.text },
});
