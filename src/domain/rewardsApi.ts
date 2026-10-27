/**
 * Wire types for the Dialed server (lockin/server). Amounts are strings of
 * integer USDC base units ("100000" = 0.10 USDC). No task titles, habit names
 * or notes are ever part of a request.
 */
export type BaseUnitsString = string;
export type PayoutNetwork = 'simulated' | 'devnet' | 'mainnet';
export type ProgramStatus = 'not_live' | 'live' | 'paused_no_funds';

export interface ProgramInfo {
  status: ProgramStatus;
  network: PayoutNetwork;
  termsVersion: string | null;
  attestRequired?: boolean;
  /** Base units. Older servers don't send these. */
  minPayout?: BaseUnitsString;
  maxPayout?: BaseUnitsString;
  payoutsPaused?: boolean;
}

export interface OfferDTO {
  id: string;
  ruleVersion: string;
  title: string;
  amount: BaseUnitsString;
  minActiveSeconds: number;
  requiresBlocking: boolean;
  dailyCap: number;
  weeklyCap: number;
  usedToday: number;
  usedThisWeek: number;
  terms: string;
  reservationTtlSeconds: number;
  heldReservation: { id: string; expiresAt: string } | null;
}

export interface ReservationDTO {
  id: string;
  offerId: string;
  amount: BaseUnitsString;
  expiresAt: string;
  status: string;
}

/** What the client can honestly report about a session. Signals, not proof. */
export interface SessionEvidence {
  clientSessionId: string;
  reservationId: string;
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  activeSeconds: number;
  pauseCount: number;
  blockingApplied: boolean;
  appVersion: string;
}

export type AwardDecision =
  | { outcome: 'awarded'; entryId: string; amount: BaseUnitsString; state: 'pending' | 'available'; availableAt: string }
  | { outcome: 'not_eligible'; reason: string }
  | { outcome: 'duplicate'; entryId: string };

export interface BalancesDTO {
  pending: BaseUnitsString;
  available: BaseUnitsString;
  inflight: BaseUnitsString;
  paid: BaseUnitsString;
  network: PayoutNetwork;
}

export interface ActivityDTO {
  awards: { id: string; title: string; amount: BaseUnitsString; state: string; createdAt: string; availableAt: string }[];
  payouts: { id: string; amount: BaseUnitsString; status: string; network: string; signature: string | null; destination: string; createdAt: string }[];
}

export interface TransparencyDTO {
  network: PayoutNetwork;
  deposited: BaseUnitsString;
  unallocated: BaseUnitsString;
  reserved: BaseUnitsString;
  owed: BaseUnitsString;
  paid: BaseUnitsString;
  sources: { source: string; total: BaseUnitsString; deposits: number }[];
}

export interface PayoutDTO {
  id: string;
  status: string;
  amount: BaseUnitsString;
}

export interface RewardsApi {
  program(): Promise<ProgramInfo>;
  offers(): Promise<OfferDTO[]>;
  acceptOffer(offerId: string, idempotencyKey: string): Promise<ReservationDTO>;
  submitSession(evidence: SessionEvidence): Promise<AwardDecision>;
  balances(): Promise<BalancesDTO>;
  requestPayout(amount: BaseUnitsString, idempotencyKey: string): Promise<PayoutDTO>;
}

class NotLiveError extends Error {
  constructor() {
    super('USDC rewards are not live.');
    this.name = 'NotLiveError';
  }
}

/** Used when no server is configured: no offers, zero balances, nothing accepted or paid. */
export const notLiveRewardsApi: RewardsApi = {
  program: async () => ({ status: 'not_live', network: 'simulated', termsVersion: null }),
  offers: async () => [],
  acceptOffer: async () => {
    throw new NotLiveError();
  },
  submitSession: async () => ({ outcome: 'not_eligible', reason: 'USDC rewards are not live.' }),
  balances: async () => ({ pending: '0', available: '0', inflight: '0', paid: '0', network: 'simulated' }),
  requestPayout: async () => {
    throw new NotLiveError();
  },
};

/** The label every server balance carries. There is no real-money network in this build. */
export function networkLabel(n: PayoutNetwork): string {
  if (n === 'mainnet') return 'Real USDC on Solana';
  return n === 'devnet' ? 'Devnet test USDC · not real money' : 'Simulated · not real money';
}
