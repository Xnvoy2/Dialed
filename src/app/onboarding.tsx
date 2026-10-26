import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME, REQUIRE_SIGN_IN } from '../config/app';
import {
  ARC_LENGTHS,
  ArcAnswers,
  DEFAULT_ANSWERS,
  DISTRACTIONS,
  Distraction,
  GOALS,
  GoalId,
  buildPlan,
} from '../domain/arc';
import { blocking } from '../native/blocking';
import { selectionCount } from '../native/blocking/types';
import { applyPlan } from '../repos/arc';
import { connectDev, connectWithApple } from '../state/rewards';
import { useApp } from '../state/AppProvider';
import { Button, CheckCircle, Chip, IconButton, IconName, ProgressBar, T } from '../ui/components';
import { useHaptics } from '../ui/haptics';
import { SIDE, colors, radius, space } from '../ui/theme';

type Step = 'welcome' | 'signin' | 'quit' | 'build' | 'details' | 'distractions' | 'length' | 'why' | 'plan' | 'setup';

const BEDTIMES = ['22:00', '22:30', '23:00', '23:30', '00:00'];
const FOCUS = [15, 25, 45, 60];

export default function Onboarding() {
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const insets = useSafeAreaInsets();
  const { db, today, prefs, setPrefs, reduceMotion, refresh } = useApp();
  const haptics = useHaptics();
  const [a, setA] = useState<ArcAnswers>({ ...DEFAULT_ANSWERS, focusMinutes: prefs.focusMinutes, why: prefs.why ?? '' });
  const plan = useMemo(() => buildPlan(a), [a]);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Fixed when the screen opens, so signing in doesn't reshuffle the steps.
  const [askSignIn] = useState(() => !redo && REQUIRE_SIGN_IN && !prefs.appleUserId);

  const needsDetails = a.build.includes('gym') || a.build.includes('sleep') || a.build.includes('study') || a.build.includes('project');
  const steps: Step[] = useMemo(() => {
    const s: Step[] = [];
    if (!redo) s.push('welcome');
    if (askSignIn) s.push('signin');
    s.push('quit', 'build');
    if (needsDetails) s.push('details');
    s.push('distractions', 'length', 'why', 'plan', 'setup');
    return s;
  }, [redo, askSignIn, needsDetails]);
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];

  // Everything in the plan starts ticked whenever the plan changes.
  useEffect(() => {
    const k = new Set(plan.habits.map((h) => h.key));
    if (plan.blockDuringLockIn) k.add('block');
    if (plan.adultFilter) k.add('adult');
    setKeep(k);
  }, [plan]);

  const next = () => {
    haptics.select();
    setI((n) => Math.min(n + 1, steps.length - 1));
  };
  const back = () => setI((n) => Math.max(0, n - 1));
  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const done = () => {
    setPrefs({ onboarded: true });
    if (redo) router.back();
    else router.replace('/');
  };

  const finishPlan = () => {
    applyPlan(db, plan, { keep, goals: [...a.quit, ...a.build], today });
    refresh();
    haptics.success();
    if (keep.has('block') || keep.has('adult')) next();
    else done();
  };

  const setUpScreenTime = async () => {
    setBusy(true);
    try {
      const r = await blocking.requestAuthorization();
      if (r.availability.state !== 'approved') {
        Alert.alert('Screen Time not allowed', 'Everything else is set up. You can turn on blocking later from Lock in.');
        return;
      }
      if (keep.has('adult')) {
        const f = await blocking.setAdultFilter(true);
        if (!f.on) Alert.alert('Adult-site filter didn’t turn on', 'You can try again from Settings › App blocking.');
      }
      if (keep.has('block')) {
        const s = await blocking.chooseApps();
        if (s && selectionCount(s) > 0) setPrefs({ blockingEnabled: true });
      }
      done();
    } catch (e) {
      Alert.alert('Something went wrong', String(e));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    try {
      const c = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
      const name = c.fullName ? AppleAuthentication.formatFullName(c.fullName, 'short') : '';
      setPrefs({ appleUserId: c.user, displayName: name || prefs.displayName });
      // Link to the rewards server when one is configured. Failure never blocks setup.
      connectWithApple(c.identityToken, name || null)
        .then((u) => u && setPrefs({ serverUserId: u.id }))
        .catch(() => {});
      next();
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Couldn’t sign in', 'Check you’re signed in to your Apple Account in iOS Settings, then try again.');
    }
  };

  const enter = reduceMotion ? undefined : FadeIn.duration(220);
  const canContinue = ['quit', 'build', 'details', 'distractions', 'length', 'why'].includes(step);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <View style={[styles.inner, { paddingTop: insets.top + space.m, paddingBottom: insets.bottom + space.m }]}>
      <View style={styles.top}>
        {i > 0 && step !== 'signin' ? (
          <IconButton name="chevron-back" label="Back" size={36} onPress={back} />
        ) : (
          <View style={{ width: 36 }} />
        )}
        <View style={{ flex: 1 }}>
          <ProgressBar progress={(i + 1) / steps.length} />
        </View>
        {redo ? <IconButton name="close" label="Close" size={36} onPress={() => router.back()} /> : <View style={{ width: 36 }} />}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.xl }} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={enter} style={{ gap: space.l }}>
          {step === 'welcome' ? (
            <>
              <T v="largeTitle" accessibilityRole="header">
                {APP_NAME}
              </T>
              <T v="title2" color={colors.secondary}>
                Your winter arc starts now.
              </T>
              <T v="callout" color={colors.secondary}>
                A few questions about what you want to quit and what you want to build. Then {APP_NAME} sets itself up
                around you: the right habits, the right apps blocked, and a clear finish line.
              </T>
            </>
          ) : null}

          {step === 'signin' ? (
            <>
              <T v="title" accessibilityRole="header">
                Sign in to start
              </T>
              <T v="callout" color={colors.secondary}>
                Your account keeps your arc yours. Your habits, tasks and notes stay on this phone.
              </T>
            </>
          ) : null}

          {step === 'quit' ? (
            <>
              <Heading title="What do you want to quit?" sub="Pick any. No judgement; it stays on your phone." />
              <View style={styles.grid}>
                {GOALS.filter((g) => g.kind === 'quit').map((g) => (
                  <Option
                    key={g.id}
                    icon={g.icon as IconName}
                    label={g.label}
                    selected={a.quit.includes(g.id)}
                    onPress={() => setA((p) => ({ ...p, quit: toggle<GoalId>(p.quit, g.id) }))}
                  />
                ))}
              </View>
            </>
          ) : null}

          {step === 'build' ? (
            <>
              <Heading title="What do you want to build?" sub="Pick what matters most. You can change it later." />
              <View style={styles.grid}>
                {GOALS.filter((g) => g.kind === 'build').map((g) => (
                  <Option
                    key={g.id}
                    icon={g.icon as IconName}
                    label={g.label}
                    selected={a.build.includes(g.id)}
                    onPress={() => setA((p) => ({ ...p, build: toggle<GoalId>(p.build, g.id) }))}
                  />
                ))}
              </View>
            </>
          ) : null}

          {step === 'details' ? (
            <>
              <Heading title="A few details" />
              {a.build.includes('gym') ? (
                <Detail title="Gym days per week">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <Chip key={n} label={`${n}`} selected={a.gymDays === n} onPress={() => setA((p) => ({ ...p, gymDays: n }))} />
                  ))}
                </Detail>
              ) : null}
              {a.build.includes('sleep') ? (
                <Detail title="In bed by">
                  {BEDTIMES.map((t) => (
                    <Chip key={t} label={t} selected={a.bedtime === t} onPress={() => setA((p) => ({ ...p, bedtime: t }))} />
                  ))}
                </Detail>
              ) : null}
              <Detail title="How long can you focus in one go?">
                {FOCUS.map((m) => (
                  <Chip key={m} label={`${m} min`} selected={a.focusMinutes === m} onPress={() => setA((p) => ({ ...p, focusMinutes: m }))} />
                ))}
              </Detail>
            </>
          ) : null}

          {step === 'distractions' ? (
            <>
              <Heading
                title="What pulls you off track?"
                sub="You’ll pick the exact apps in Apple’s Screen Time picker. Dialed never sees which."
              />
              <View style={styles.grid}>
                {DISTRACTIONS.map((d) => (
                  <Option
                    key={d.id}
                    label={d.label}
                    selected={a.distractions.includes(d.id)}
                    onPress={() => setA((p) => ({ ...p, distractions: toggle<Distraction>(p.distractions, d.id) }))}
                  />
                ))}
              </View>
            </>
          ) : null}

          {step === 'length' ? (
            <>
              <Heading title="How long is your arc?" sub="A clear finish line. Missed days never reset your progress." />
              {ARC_LENGTHS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setA((p) => ({ ...p, lengthDays: n }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: a.lengthDays === n }}
                  style={[styles.length, a.lengthDays === n && styles.selected]}
                >
                  <T v="title2" color={a.lengthDays === n ? colors.onPrimary : colors.text}>
                    {n} days
                  </T>
                  <T v="footnote" color={a.lengthDays === n ? '#46464B' : colors.secondary}>
                    {n === 30 ? 'A focused month' : n === 60 ? 'Long enough to stick' : 'The full winter arc'}
                  </T>
                </Pressable>
              ))}
            </>
          ) : null}

          {step === 'why' ? (
            <>
              <Heading title="Why does this matter to you?" sub="We’ll show you this if you try to open a blocked app." />
              <TextInput
                value={a.why}
                onChangeText={(why) => setA((p) => ({ ...p, why }))}
                placeholder="e.g. be proud of who I am by New Year"
                placeholderTextColor={colors.tertiary}
                maxLength={140}
                multiline
                style={styles.input}
                accessibilityLabel="Why does this matter to you?"
                selectionColor={colors.text}
              />
            </>
          ) : null}

          {step === 'plan' ? (
            <>
              <Heading title="Your arc" sub={`${a.lengthDays} days, starting today. Untick anything you don’t want.`} />
              <View style={styles.planCard}>
                {plan.habits.length === 0 && !plan.blockDuringLockIn && !plan.adultFilter ? (
                  <T v="subhead" color={colors.secondary} style={{ padding: space.l }}>
                    Nothing picked yet. Go back and choose something, or start with just Lock in.
                  </T>
                ) : null}
                {plan.habits.map((h) => (
                  <PlanRow
                    key={h.key}
                    title={h.name}
                    sub={h.frequency === 'weekly' ? `${h.weeklyTarget}× a week` : h.frequency === 'weekdays' ? 'Weekdays' : 'Every day'}
                    on={keep.has(h.key)}
                    onToggle={() => setKeep(toggleSet(keep, h.key))}
                  />
                ))}
                {plan.blockDuringLockIn ? (
                  <PlanRow
                    title="Block distracting apps when you lock in"
                    sub="You choose the apps next"
                    on={keep.has('block')}
                    onToggle={() => setKeep(toggleSet(keep, 'block'))}
                  />
                ) : null}
                {plan.adultFilter ? (
                  <PlanRow
                    title="Block adult websites, always"
                    sub="Apple’s Screen Time filter in Safari and other browsers"
                    on={keep.has('adult')}
                    onToggle={() => setKeep(toggleSet(keep, 'adult'))}
                  />
                ) : null}
                <PlanRow title={`${plan.focusMinutes}-minute lock-ins`} sub="Default length; change it any time" />
              </View>
              {plan.why ? (
                <T v="footnote" color={colors.secondary}>
                  Your why: “{plan.why}”
                </T>
              ) : null}
            </>
          ) : null}

          {step === 'setup' ? (
            <>
              <Heading
                title="Turn on blocking"
                sub="iOS will ask you to allow Screen Time with Face ID. Then you pick the apps to block."
              />
              <View style={styles.planCard}>
                {keep.has('adult') ? <PlanRow title="Adult websites" sub="Blocked all the time" /> : null}
                {keep.has('block') ? <PlanRow title="Your distracting apps" sub="Blocked while you’re locked in" /> : null}
              </View>
              <T v="footnote" color={colors.tertiary}>
                Dialed only gets anonymous tokens from Apple. It can’t see app names, your browsing or your usage.
              </T>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {step === 'welcome' ? <Button title="Get started" onPress={next} /> : null}
        {step === 'signin' ? (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={26}
              style={{ height: 52 }}
              onPress={signIn}
            />
            {__DEV__ ? (
              <Button
                title="Skip (development build only)"
                kind="plain"
                onPress={() => {
                  connectDev()
                    .then((u) => u && setPrefs({ serverUserId: u.id }))
                    .catch(() => {});
                  next();
                }}
              />
            ) : null}
          </>
        ) : null}
        {canContinue ? <Button title="Continue" onPress={next} /> : null}
        {step === 'plan' ? <Button title="Start my arc" icon="flag" onPress={finishPlan} /> : null}
        {step === 'setup' ? (
          <>
            <Button title="Allow Screen Time" icon="lock-closed" onPress={setUpScreenTime} loading={busy} />
            <Button title="Not now" kind="plain" onPress={done} />
          </>
        ) : null}
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function toggleSet(s: Set<string>, k: string): Set<string> {
  const n = new Set(s);
  if (n.has(k)) n.delete(k);
  else n.add(k);
  return n;
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: space.s }}>
      <T v="title" accessibilityRole="header">
        {title}
      </T>
      {sub ? (
        <T v="callout" color={colors.secondary}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

function Option({ icon, label, selected, onPress }: { icon?: IconName; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: 0.8 }]}
    >
      {icon ? <Ionicons name={icon} size={22} color={selected ? colors.onPrimary : colors.text} /> : null}
      <T v="callout" color={selected ? colors.onPrimary : colors.text} style={{ fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.s }}>
      <T v="headline">{title}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>{children}</View>
    </View>
  );
}

function PlanRow({ title, sub, on, onToggle }: { title: string; sub?: string; on?: boolean; onToggle?: () => void }) {
  return (
    <View style={styles.planRow}>
      {onToggle ? (
        <CheckCircle checked={!!on} onPress={onToggle} label={title} />
      ) : (
        <View style={{ width: 36, alignItems: 'center' }}>
          <Ionicons name="checkmark" size={20} color={colors.secondary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" color={onToggle && !on ? colors.tertiary : colors.text}>
          {title}
        </T>
        {sub ? (
          <T v="footnote" color={colors.secondary}>
            {sub}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: SIDE },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  option: {
    width: '48.5%',
    minHeight: 76,
    padding: space.m,
    gap: space.s,
    borderRadius: radius.l,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.text },
  length: { padding: space.l, borderRadius: radius.l, backgroundColor: colors.surface, gap: 2 },
  input: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    padding: space.l,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  planCard: { backgroundColor: colors.surface, borderRadius: radius.l, overflow: 'hidden' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, minHeight: 60 },
  footer: { gap: space.xs, paddingTop: space.s },
});
