/**
 * Contract for a FUTURE rewards server. Nothing here talks to a network today.
 * See docs/REWARDS_BACKEND.md for the server design behind these shapes.
 *
 * Wire rules:
 * - Amounts are strings of integer USDC base units ("1000000" = 1 USDC), so
 *   they survive JSON without float loss.
 * - Every state-changing call carries a client-generated idempotency key.
 * - No task titles, habit names or notes are ever part of a request.
 */
export type BaseUnitsString = string;

export interface ProgramInfo {
  status: 'not_live' | 'live' | 'paused_no_funds';
  /** Shown verbatim before the user can join anything. */
  termsVersion: string | null;
}

export interface OfferDTO {
  id: string;
  ruleVersion: string;
  title: string;
  amount: BaseUnitsString;
  minActiveSeconds: number;
  dailyCap: number;
  weeklyCap: number;
  /** Funds are reserved server-side before an offer can be accepted. */
  reservationExpiresAt: string | null;
}

export interface ReservationDTO {
  id: string;
  offerId: string;
  amount: BaseUnitsString;
  expiresAt: string;
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
  /** Shield was applied and read back on device. Not proof of focus. */
  blockingApplied: boolean;
  /** Placeholder for App Attest / DeviceCheck; proves the app binary, not the work. */
  attestation: string | null;
  appVersion: string;
}

export type AwardDecision =
  | { outcome: 'awarded'; entryId: string; amount: BaseUnitsString; state: 'pending' | 'available' }
  | { outcome: 'not_eligible'; reason: string }
  | { outcome: 'duplicate'; entryId: string };

export interface BalancesDTO {
  pending: BaseUnitsString;
  available: BaseUnitsString;
  paid: BaseUnitsString;
}

export interface PayoutDTO {
  id: string;
  amount: BaseUnitsString;
  status: 'requested' | 'submitted' | 'confirmed' | 'failed_retryable' | 'needs_reconciliation';
  signature: string | null;
}

export interface RewardsApi {
  program(): Promise<ProgramInfo>;
  offers(): Promise<OfferDTO[]>;
  acceptOffer(offerId: string, idempotencyKey: string): Promise<ReservationDTO>;
  submitSession(evidence: SessionEvidence, idempotencyKey: string): Promise<AwardDecision>;
  balances(): Promise<BalancesDTO>;
  requestPayout(amount: BaseUnitsString, idempotencyKey: string): Promise<PayoutDTO>;
}

class NotLiveError extends Error {
  constructor() {
    super('USDC rewards are not live.');
    this.name = 'NotLiveError';
  }
}

/** The only implementation that ships today. */
export const notLiveRewardsApi: RewardsApi = {
  program: async () => ({ status: 'not_live', termsVersion: null }),
  offers: async () => [],
  acceptOffer: async () => {
    throw new NotLiveError();
  },
  submitSession: async () => ({ outcome: 'not_eligible', reason: 'USDC rewards are not live.' }),
  balances: async () => ({ pending: '0', available: '0', paid: '0' }),
  requestPayout: async () => {
    throw new NotLiveError();
  },
};
