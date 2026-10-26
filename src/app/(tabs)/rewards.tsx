import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { API_URL, ApiError, api, httpRewardsApi, newIdempotencyKey } from '../../api/client';
import { formatClock } from '../../domain/dates';
import { formatUsdc, usdc } from '../../domain/rewards';
import { ActivityDTO, BalancesDTO, OfferDTO, ProgramInfo, TransparencyDTO, networkLabel } from '../../domain/rewardsApi';
import { useApp } from '../../state/AppProvider';
import { acceptOffer, connectDev } from '../../state/rewards';
import { Button, Card, IconBubble, Row, SectionHeader, SmallButton, T, Tiles } from '../../ui/components';
import { Screen } from '../../ui/Screen';
import { SIDE, TILE_GAP, colors, radius, space } from '../../ui/theme';

const fmt = (s: string) => formatUsdc(usdc(Number(s))).replace(' USDC', '');

interface Data {
  program: ProgramInfo;
  offers: OfferDTO[];
  balances: BalancesDTO;
  activity: ActivityDTO;
  transparency: TransparencyDTO;
  payoutAddress: string | null;
}

export default function RewardsScreen() {
  const { prefs, setPrefs } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [address, setAddress] = useState('');

  const load = useCallback(async () => {
    if (!API_URL) return;
    setLoading(true);
    setError(null);
    try {
      const [program, transparency] = await Promise.all([httpRewardsApi.program(), api.transparency()]);
      if (!prefs.serverUserId) {
        setData({ program, transparency, offers: [], balances: { pending: '0', available: '0', inflight: '0', paid: '0', network: program.network }, activity: { awards: [], payouts: [] }, payoutAddress: null });
        return;
      }
      const [offers, balances, activity, me] = await Promise.all([
        httpRewardsApi.offers(),
        httpRewardsApi.balances(),
        api.activity(),
        api.me(),
      ]);
      setData({ program, offers, balances, activity, transparency, payoutAddress: me.payoutAddress });
      setAddress(me.payoutAddress ?? '');
      // Drop a reservation the server no longer holds.
      const r = prefs.activeReservation;
      if (r && !offers.some((o) => o.heldReservation?.id === r.id)) setPrefs({ activeReservation: null });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) setPrefs({ serverUserId: null });
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.serverUserId, prefs.activeReservation?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!API_URL) return <NotConfigured />;

  const accept = async (o: OfferDTO) => {
    setBusy(o.id);
    try {
      setPrefs({ activeReservation: await acceptOffer(o) });
      await load();
    } catch (e) {
      Alert.alert('Couldn’t accept', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    const r = prefs.activeReservation;
    if (!r) return;
    await api.releaseReservation(r.id).catch(() => {});
    setPrefs({ activeReservation: null });
    load();
  };

  const saveAddress = async () => {
    setBusy('address');
    try {
      await api.setPayoutAddress(address.trim() || null);
      await load();
    } catch (e) {
      Alert.alert('Address not saved', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const payout = async () => {
    if (!data) return;
    setBusy('payout');
    try {
      await httpRewardsApi.requestPayout(data.balances.available, newIdempotencyKey());
      await load();
    } catch (e) {
      Alert.alert('Payout not started', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setBusy('connect');
    try {
      const u = await connectDev();
      if (u) setPrefs({ serverUserId: u.id });
      else Alert.alert('Sign in needed', 'Redo setup from Settings and sign in with Apple to join rewards.');
    } catch (e) {
      Alert.alert('Couldn’t connect', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const net = data?.program.network ?? 'simulated';
  const b = data?.balances;
  const status = data?.program.status;

  return (
    <Screen
      title="Rewards"
      subtitle={status === 'live' ? 'Offers open' : status === 'paused_no_funds' ? 'Paused until more funding arrives' : 'No offers right now'}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.secondary} />}
    >
      <View style={{ gap: TILE_GAP }}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <T v="caption" color={colors.onPrimary} style={{ fontWeight: '700', letterSpacing: 0.6 }}>
              {networkLabel(net).toUpperCase()}
            </T>
          </View>
        </View>

        {error ? (
          <Card style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <IconBubble name="cloud-offline-outline" />
            <T v="subhead" color={colors.secondary} style={{ flex: 1 }}>
              {error}
            </T>
            <SmallButton title="Retry" onPress={load} />
          </Card>
        ) : null}

        {!prefs.serverUserId ? (
          <Card style={{ gap: space.m }}>
            <T v="headline">Join rewards</T>
            <T v="subhead" color={colors.secondary}>
              Rewards need your Dialed account. Everything else works without it.
            </T>
            {__DEV__ ? <Button title="Connect (development)" onPress={connect} loading={busy === 'connect'} /> : null}
            <Button title="Sign in with Apple" kind={__DEV__ ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/onboarding', params: { redo: '1' } })} />
          </Card>
        ) : null}

        <Card style={{ padding: space.xl, gap: space.l }}>
          <View>
            <T v="subhead" color={colors.secondary}>
              Available to pay out
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T v="display">{b ? fmt(b.available) : '–'}</T>
              <T v="headline" color={colors.secondary}>
                USDC
              </T>
            </View>
          </View>
          <View style={styles.cols}>
            {(
              [
                ['Pending review', b?.pending],
                ['Paying out', b?.inflight],
                ['Paid', b?.paid],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={{ flex: 1 }}>
                <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
                  {v ? fmt(v) : '–'}
                </T>
                <T v="footnote" color={colors.secondary}>
                  {k}
                </T>
              </View>
            ))}
          </View>
        </Card>
      </View>

      {prefs.activeReservation ? (
        <>
          <SectionHeader title="Working towards" />
          <Card style={{ gap: space.s }}>
            <T v="headline">{prefs.activeReservation.title}</T>
            <T v="subhead" color={colors.secondary}>
              {fmt(prefs.activeReservation.amount)} USDC when you finish a lock-in of at least{' '}
              {Math.round(prefs.activeReservation.minActiveSeconds / 60)} minutes
              {prefs.activeReservation.requiresBlocking ? ' with app blocking on' : ''}. Held for you until{' '}
              {formatClock(new Date(prefs.activeReservation.expiresAt).getTime())}.
            </T>
            <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
              <SmallButton title="Lock in now" icon="lock-closed" onPress={() => router.push('/focus')} />
              <SmallButton title="Give up offer" onPress={release} />
            </View>
          </Card>
        </>
      ) : null}

      <SectionHeader title="Offers" />
      {data && data.offers.length > 0 ? (
        <View style={{ gap: TILE_GAP }}>
          {data.offers.map((o) => {
            const held = !!o.heldReservation;
            const capped = o.usedToday >= o.dailyCap || o.usedThisWeek >= o.weeklyCap;
            return (
              <Card key={o.id} style={{ gap: space.s }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <T v="headline" style={{ flex: 1 }}>
                    {o.title}
                  </T>
                  <T v="headline">{fmt(o.amount)} USDC</T>
                </View>
                <T v="footnote" color={colors.secondary}>
                  {o.terms}
                </T>
                <T v="footnote" color={colors.tertiary}>
                  Today {o.usedToday}/{o.dailyCap} · this week {o.usedThisWeek}/{o.weeklyCap} · rule {o.ruleVersion}
                </T>
                <Button
                  title={held ? 'Accepted' : capped ? 'Limit reached' : `Accept · ${fmt(o.amount)} USDC`}
                  kind={held || capped ? 'secondary' : 'primary'}
                  disabled={held || capped || !!prefs.activeReservation}
                  loading={busy === o.id}
                  onPress={() => accept(o)}
                  style={{ marginTop: space.s }}
                />
              </Card>
            );
          })}
        </View>
      ) : (
        <Card style={styles.empty}>
          <Ionicons name="pricetags-outline" size={22} color={colors.secondary} />
          <T v="subhead" color={colors.secondary} center>
            {loading && !data ? 'Loading…' : 'No offers right now. Each offer shows its fixed amount and rules before you join.'}
          </T>
        </Card>
      )}

      {prefs.serverUserId && data ? (
        <>
          <SectionHeader title="Pay out" />
          <Card style={{ gap: space.m }}>
            <T v="subhead" color={colors.secondary}>
              Your Solana address. Dialed pays the network fee. {net === 'devnet' ? 'Devnet test USDC only.' : 'Simulated: nothing is sent.'}
            </T>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Solana address"
              placeholderTextColor={colors.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              accessibilityLabel="Solana payout address"
              selectionColor={colors.text}
            />
            {address.trim() !== (data.payoutAddress ?? '') ? (
              <Button title="Save address" kind="secondary" onPress={saveAddress} loading={busy === 'address'} />
            ) : null}
            <Button
              title={b && b.available !== '0' ? `Pay out ${fmt(b.available)} USDC` : 'Nothing to pay out yet'}
              disabled={!b || b.available === '0' || !data.payoutAddress}
              onPress={payout}
              loading={busy === 'payout'}
            />
          </Card>

          {data.activity.awards.length + data.activity.payouts.length > 0 ? (
            <>
              <SectionHeader title="Activity" />
              <Tiles>
                {data.activity.payouts.map((p) => (
                  <Row
                    key={p.id}
                    icon="arrow-up-outline"
                    title={`Payout · ${p.status}`}
                    subtitle={`${new Date(p.createdAt).toLocaleDateString()} · ${p.network}${p.signature ? ` · ${p.signature.slice(0, 10)}…` : ''}`}
                    value={`${fmt(p.amount)}`}
                  />
                ))}
                {data.activity.awards.map((a) => (
                  <Row
                    key={a.id}
                    icon="checkmark"
                    title={a.title}
                    subtitle={`${new Date(a.createdAt).toLocaleDateString()} · ${a.state}`}
                    value={`+${fmt(a.amount)}`}
                  />
                ))}
              </Tiles>
            </>
          ) : null}
        </>
      ) : null}

      {data ? (
        <>
          <SectionHeader title="Where rewards come from" />
          <Card style={{ gap: space.m }}>
            <View style={styles.cols}>
              {(
                [
                  ['Funded', data.transparency.deposited],
                  ['Owed', data.transparency.owed],
                  ['Paid', data.transparency.paid],
                ] as const
              ).map(([k, v]) => (
                <View key={k} style={{ flex: 1 }}>
                  <T v="headline">{fmt(v)}</T>
                  <T v="footnote" color={colors.secondary}>
                    {k}
                  </T>
                </View>
              ))}
            </View>
            {data.transparency.sources.map((s) => (
              <View key={s.source} style={{ flexDirection: 'row' }}>
                <T v="subhead" style={{ flex: 1 }}>
                  {s.source}
                </T>
                <T v="subhead" color={colors.secondary}>
                  {fmt(s.total)} USDC
                </T>
              </View>
            ))}
            <T v="footnote" color={colors.tertiary}>
              Offers only open when this funding covers them. Check-ins and ticked tasks never earn.
            </T>
          </Card>
        </>
      ) : loading ? (
        <ActivityIndicator color={colors.secondary} style={{ marginTop: space.xl }} />
      ) : null}
    </Screen>
  );
}

function NotConfigured() {
  return (
    <Screen backdrop="rewards" title="Rewards" subtitle="USDC rewards are not live">
      <Card style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start' }}>
        <IconBubble name="hourglass-outline" />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="headline">Not live yet</T>
          <T v="subhead" color={colors.secondary}>
            Nothing is being earned. Every feature works without rewards, an account or a wallet.
          </T>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: { paddingHorizontal: SIDE, flexDirection: 'row' },
  badge: { backgroundColor: colors.text, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  cols: {
    flexDirection: 'row',
    gap: space.m,
    paddingTop: space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  empty: { alignItems: 'center', gap: space.s, paddingVertical: space.xl },
  input: {
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    fontVariant: ['tabular-nums'],
  },
});
