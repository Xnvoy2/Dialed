import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../config/app';
import { FOCUS_PRESETS } from '../domain/focus';
import { createTask } from '../repos/tasks';
import { useApp } from '../state/AppProvider';
import { Button, Chip, IconName, T } from '../ui/components';
import { useHaptics } from '../ui/haptics';
import { SIDE, colors, radius, space } from '../ui/theme';

const POINTS: [IconName, string, string][] = [
  ['list-outline', 'Plan the day', 'Write down what matters today. Unfinished tasks wait for you.'],
  ['timer-outline', 'Focus on one thing', 'A calm timer that keeps time even if you close the app.'],
  ['repeat-outline', 'Build habits', 'Flexible schedules and rest days. Missing a day never erases your progress.'],
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { db, today, setPrefs, reduceMotion } = useApp();
  const haptics = useHaptics();
  const [step, setStep] = useState(0);
  const [minutes, setMinutes] = useState(25);
  const [title, setTitle] = useState('');

  const finish = (withTask: boolean) => {
    if (withTask && title.trim()) createTask(db, { title, day: today });
    setPrefs({ onboarded: true, focusMinutes: minutes });
    haptics.success();
    router.replace('/');
  };

  const enter = reduceMotion ? undefined : FadeIn.duration(260);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.l }]}
    >
      <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, i === step && { backgroundColor: colors.text, width: 20 }]} />
        ))}
      </View>

      {step === 0 ? (
        <Animated.View key="s0" entering={enter} style={styles.body}>
          <T v="largeTitle" accessibilityRole="header">
            {APP_NAME}
          </T>
          <T v="title2" color={colors.secondary} style={{ marginBottom: space.xl }}>
            Get dialed in on what matters today.
          </T>
          {POINTS.map(([icon, head, body]) => (
            <View key={head} style={styles.point}>
              <View style={styles.pointIcon}>
                <Ionicons name={icon} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="headline">{head}</T>
                <T v="subhead" color={colors.secondary}>
                  {body}
                </T>
              </View>
            </View>
          ))}
          <T v="footnote" color={colors.tertiary} style={{ marginTop: space.l }}>
            No account or wallet needed. Everything stays on this phone.
          </T>
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View key="s1" entering={enter} style={styles.body}>
          <T v="title" accessibilityRole="header">
            How long do you like to focus?
          </T>
          <T v="callout" color={colors.secondary}>
            Your default session length. You can pick a different one each time.
          </T>
          <View style={styles.chips}>
            {FOCUS_PRESETS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => (haptics.select(), setMinutes(m))} />
            ))}
          </View>
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View key="s2" entering={enter} style={styles.body}>
          <T v="title" accessibilityRole="header">
            What’s one thing you want to get done today?
          </T>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Finish the project outline"
            placeholderTextColor={colors.tertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => finish(true)}
            style={styles.input}
            accessibilityLabel="First task"
            selectionColor={colors.text}
          />
          <T v="footnote" color={colors.tertiary}>
            We’ll ask about notifications the first time you start a session, and about Screen Time only if you
            turn on app blocking.
          </T>
        </Animated.View>
      ) : null}

      <View style={styles.footer}>
        {step < 2 ? (
          <Button title="Continue" onPress={() => (haptics.select(), setStep(step + 1))} />
        ) : (
          <>
            <Button title="Add and start" onPress={() => finish(true)} disabled={!title.trim()} />
            <Button title="Skip for now" kind="plain" onPress={() => finish(false)} />
          </>
        )}
        {step > 0 ? <Button title="Back" kind="plain" onPress={() => setStep(step - 1)} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: SIDE },
  dots: { flexDirection: 'row', gap: 6, marginBottom: space.xxl },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  body: { flex: 1, gap: space.l },
  point: { flexDirection: 'row', gap: space.l, alignItems: 'flex-start', paddingVertical: space.s },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  input: {
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 54,
  },
  footer: { gap: space.xs },
});
