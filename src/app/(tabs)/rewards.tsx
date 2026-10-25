import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DEMO_REWARDS_ALLOWED } from '../../config/app';
import {
  Balances,
  RewardsSnapshot,
  assertLive,
  formatUsdc,
  notLiveSnapshot,
  simulatedSnapshot,
} from '../../domain/rewards';
import { useApp } from '../../state/AppProvider';
import { Card, IconBubble, Row, SectionHeader, T, Tiles, ToggleRow } from '../../ui/components';
import { Screen } from '../../ui/Screen';
import { SIDE, TILE_GAP, colors, radius, space } from '../../ui/theme';

export default function RewardsScreen() {
  const { prefs, setPrefs } = useApp();
  // Production: the only source is the (not yet built) server; today that is nothing.
  const live = assertLive(notLiveSnapshot());
  const demo = simulatedSnapshot(DEMO_REWARDS_ALLOWED && prefs.demoRewards);

  return (
    <Screen title="Rewards" subtitle="USDC rewards are not live">
      <View style={{ gap: TILE_GAP }}>
        <BalanceCard balances={live.balances} offers={live.offers.length} />

        <Card style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start' }}>
          <IconBubble name="hourglass-outline" />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="headline">Not live yet</T>
            <T v="subhead" color={colors.secondary}>
              Nothing is being earned today. Every feature works without rewards, an account or a wallet.
            </T>
          </View>
        </Card>
      </View>

      <SectionHeader title="Offers" />
      <Card style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="pricetags-outline" size={22} color={colors.secondary} />
        </View>
        <T v="headline" center>
          No offers right now
        </T>
        <T v="subhead" color={colors.secondary} center>
          When offers exist, each shows its fixed amount and rules before you join.
        </T>
      </Card>

      <SectionHeader title="How it would work" />
      <Tiles>
        <Row icon="document-text-outline" title="Rules up front" subtitle="A fixed amount and the exact requirements, shown before you opt in." />
        <Row icon="server-outline" title="Decided by a server" subtitle="Eligibility, caps and balances are checked server-side, never by this phone alone." />
        <Row icon="checkmark-done-outline" title="Check-ins never earn" subtitle="Habit check-ins and ticked tasks are for you. They will never generate money." />
        <Row icon="shield-checkmark-outline" title="Funded first" subtitle="Offers only open when the money to pay them is already set aside." />
        <Row icon="eye-off-outline" title="Your work stays private" subtitle="Task names, habit names and notes are never sent for rewards." />
      </Tiles>
      <T v="footnote" color={colors.tertiary} style={styles.footnote}>
        A timer can’t prove work happened. Any future reward will be for meeting a clearly stated rule, not a
        judgement of your productivity.
      </T>

      {DEMO_REWARDS_ALLOWED ? (
        <>
          <SectionHeader title="Developer demo" />
          <Tiles>
            <ToggleRow
              title="Show simulated rewards"
              subtitle="Development builds only. Fake data, kept separate from real balances."
              value={prefs.demoRewards}
              onChange={(v) => setPrefs({ demoRewards: v })}
            />
          </Tiles>
          {demo ? <DemoPanel demo={demo} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Real balances. In production these are always the server's numbers; today, zero. */
function BalanceCard({ balances, offers }: { balances: Balances<'live'>; offers: number }) {
  const cols: [string, string][] = [
    ['Pending', formatUsdc(balances.pending)],
    ['Paid out', formatUsdc(balances.paid)],
    [offers === 1 ? 'Offer open' : 'Offers open', String(offers)],
  ];
  return (
    <Card
      style={{ padding: space.xl, gap: space.l }}
      accessibilityLabel={`Your balance. Available ${formatUsdc(balances.available)}. ${cols.map(([k, v]) => `${k} ${v}`).join(', ')}`}
    >
      <View>
        <T v="subhead" color={colors.secondary}>
          Your balance
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <T v="display">{formatUsdc(balances.available).replace(' USDC', '')}</T>
          <T v="headline" color={colors.secondary}>
            USDC
          </T>
        </View>
        <T v="footnote" color={colors.secondary}>
          available to pay out
        </T>
      </View>
      <View style={styles.cols}>
        {cols.map(([k, v]) => (
          <View key={k} style={{ flex: 1 }}>
            <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
              {v.replace(' USDC', '')}
            </T>
            <T v="footnote" color={colors.secondary}>
              {k}
            </T>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Visually and structurally separate from real data. */
function DemoPanel({ demo }: { demo: RewardsSnapshot<'simulated'> }) {
  return (
    <View style={styles.demo} accessibilityLabel="Simulated rewards. Not real money.">
      <View style={styles.badge}>
        <T v="caption" color={colors.onPrimary} style={{ fontWeight: '700', letterSpacing: 0.8 }}>
          SIMULATED · NOT REAL MONEY
        </T>
      </View>
      {demo.offers.map((o) => (
        <View key={o.id} style={{ gap: 2 }}>
          <T v="headline">{o.title}</T>
          <T v="footnote" color={colors.secondary}>
            Demo amount {formatUsdc(o.amount)} · up to {o.dailyCap}/day, {o.weeklyCap}/week · rule {o.ruleVersion}
          </T>
        </View>
      ))}
      <View style={styles.cols}>
        {(['pending', 'available', 'paid'] as const).map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <T v="footnote" color={colors.secondary}>
              Demo {k}
            </T>
            <T v="headline">{formatUsdc(demo.balances[k])}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: {
    flexDirection: 'row',
    gap: space.m,
    paddingTop: space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  footnote: { paddingHorizontal: SIDE, marginTop: space.m },
  demo: {
    marginHorizontal: SIDE - 4,
    marginTop: TILE_GAP,
    padding: space.l,
    gap: space.l,
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.secondary,
  },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.text, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});
