/**
 * Rewards domain (client side). USDC rewards are NOT live.
 *
 * The client never decides eligibility and never computes a balance it could
 * show as money. In production it can only display what a future server
 * returns; today that is no offers and zero balances.
 *
 * A development-only demo exists for design work. Its values carry the
 * 'simulated' provenance in the type itself, so they cannot be passed to
 * anything that renders or sums real balances.
 */

/** Integer USDC base units. 1 USDC = 1,000,000 (6 decimals). */
export type UsdcBaseUnits = number & { readonly __unit: 'usdc-base' };
export const USDC_DECIMALS = 6;
export const USDC_BASE = 1_000_000;

export function usdc(baseUnits: number): UsdcBaseUnits {
  if (!Number.isSafeInteger(baseUnits) || baseUnits < 0) {
    throw new RangeError(`USDC amounts must be non-negative integer base units, got ${baseUnits}`);
  }
  return baseUnits as UsdcBaseUnits;
}

export const ZERO = usdc(0);

export function formatUsdc(amount: UsdcBaseUnits): string {
  const whole = Math.floor(amount / USDC_BASE);
  const cents = Math.floor((amount % USDC_BASE) / 10_000);
  return `${whole}.${String(cents).padStart(2, '0')} USDC`;
}

export type RewardState = 'pending' | 'available' | 'paid';
export type Provenance = 'live' | 'simulated';

export interface RewardOffer<P extends Provenance = Provenance> {
  provenance: P;
  id: string;
  ruleVersion: string;
  title: string;
  /** Fixed amount, disclosed before the user opts in. */
  amount: UsdcBaseUnits;
  minActiveMinutes: number;
  dailyCap: number;
  weeklyCap: number;
}

export interface RewardEntry<P extends Provenance = Provenance> {
  provenance: P;
  id: string;
  offerId: string;
  state: RewardState;
  amount: UsdcBaseUnits;
  createdAt: number;
}

export interface Balances<P extends Provenance = Provenance> {
  provenance: P;
  pending: UsdcBaseUnits;
  available: UsdcBaseUnits;
  paid: UsdcBaseUnits;
}

export type ProgramStatus = 'not_live' | 'live' | 'paused_no_funds';

export interface RewardsSnapshot<P extends Provenance = Provenance> {
  provenance: P;
  status: ProgramStatus;
  offers: RewardOffer<P>[];
  entries: RewardEntry<P>[];
  balances: Balances<P>;
}

/** What production shows today: nothing, honestly. */
export function notLiveSnapshot(): RewardsSnapshot<'live'> {
  return {
    provenance: 'live',
    status: 'not_live',
    offers: [],
    entries: [],
    balances: { provenance: 'live', pending: ZERO, available: ZERO, paid: ZERO },
  };
}

/**
 * Sums entries into balances. Refuses to mix provenances: a simulated entry
 * can never contribute to a live balance or vice versa.
 */
export function sumBalances<P extends Provenance>(provenance: P, entries: RewardEntry<P>[]): Balances<P> {
  const totals = { pending: 0, available: 0, paid: 0 };
  for (const e of entries) {
    if (e.provenance !== provenance) {
      throw new Error(`Refusing to add a ${e.provenance} entry to a ${provenance} balance`);
    }
    totals[e.state] += e.amount;
  }
  return {
    provenance,
    pending: usdc(totals.pending),
    available: usdc(totals.available),
    paid: usdc(totals.paid),
  };
}

/** Use this wherever a balance would be presented as real money. */
export function assertLive<T extends { provenance: Provenance }>(value: T): T & { provenance: 'live' } {
  if (value.provenance !== 'live') {
    throw new Error('Simulated rewards data cannot be shown as a real balance');
  }
  return value as T & { provenance: 'live' };
}

/** Things the app records that someone might imagine earn money. */
export type ActivitySignal =
  | { kind: 'habit_checkin' }
  | { kind: 'task_completed' }
  | { kind: 'focus_session'; activeSeconds: number; completed: boolean };

export type Eligibility = { eligible: false; reason: string };

/**
 * The client's answer is always "not eligible". Manual check-ins and task
 * ticks are the user's own say-so and will never earn money. Focus sessions
 * may one day qualify, but only by a server decision against a versioned rule;
 * a client-side timer is not proof of work.
 */
export function clientEligibility(signal: ActivitySignal): Eligibility {
  switch (signal.kind) {
    case 'habit_checkin':
      return { eligible: false, reason: 'Manual habit check-ins never earn rewards.' };
    case 'task_completed':
      return { eligible: false, reason: 'Ticking off a task never earns rewards.' };
    case 'focus_session':
      return { eligible: false, reason: 'USDC rewards are not live. Eligibility will be decided by the server.' };
  }
}

/**
 * Development-only demo data. The `allowed` flag must come from __DEV__ and a
 * user toggle; production builds always pass false.
 */
export function simulatedSnapshot(allowed: boolean): RewardsSnapshot<'simulated'> | null {
  if (!allowed) return null;
  const offers: RewardOffer<'simulated'>[] = [
    {
      provenance: 'simulated',
      id: 'demo-offer-1',
      ruleVersion: 'demo-1',
      title: 'Complete a 25-minute focus session',
      amount: usdc(100_000),
      minActiveMinutes: 25,
      dailyCap: 2,
      weeklyCap: 8,
    },
  ];
  const entries: RewardEntry<'simulated'>[] = [
    { provenance: 'simulated', id: 'demo-e1', offerId: 'demo-offer-1', state: 'pending', amount: usdc(100_000), createdAt: 0 },
    { provenance: 'simulated', id: 'demo-e2', offerId: 'demo-offer-1', state: 'available', amount: usdc(200_000), createdAt: 0 },
    { provenance: 'simulated', id: 'demo-e3', offerId: 'demo-offer-1', state: 'paid', amount: usdc(100_000), createdAt: 0 },
  ];
  return {
    provenance: 'simulated',
    status: 'not_live',
    offers,
    entries,
    balances: sumBalances('simulated', entries),
  };
}
