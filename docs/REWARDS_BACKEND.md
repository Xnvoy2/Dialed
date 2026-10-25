# Rewards backend — design (not built)

Status: **design only**. The app ships with `notLiveRewardsApi` (no offers, zero
balances). Nothing in this document is implemented. The client contract lives in
`src/domain/rewardsApi.ts`.

## Principles

1. The server decides eligibility and balances. The phone only reports signals.
2. Money exists before promises: an offer can only be accepted after its amount is
   reserved from funded treasury.
3. Amounts are integer USDC base units (6 decimals) everywhere — `BIGINT` in
   PostgreSQL, strings on the wire. No floats.
4. Every write is idempotent. Retrying never pays twice.
5. Manual check-ins and task ticks never earn. Only server-evaluated sessions
   against a versioned, published rule can.
6. No private content (task titles, habit names, notes) ever reaches the server.

## Ledger model (PostgreSQL)

```sql
-- Funds the operator has actually deposited (mirrors on-chain treasury balance).
CREATE TABLE treasury_accounts (
  id            UUID PRIMARY KEY,
  mint          TEXT NOT NULL,              -- USDC mint
  onchain_owner TEXT NOT NULL,              -- treasury wallet (server-held key, KMS/HSM)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Double-entry journal. Every movement is two rows that sum to zero.
CREATE TABLE ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  journal_id     UUID NOT NULL,
  account        TEXT NOT NULL,   -- 'treasury:unallocated' | 'treasury:reserved' | 'user:<id>:pending' | 'user:<id>:available' | 'user:<id>:paid' | 'fees'
  amount         BIGINT NOT NULL, -- base units, signed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_entries (account);
-- Invariant (checked in the same transaction): SUM(amount) per journal_id = 0.

CREATE TABLE reward_rules (
  version        TEXT PRIMARY KEY,           -- e.g. 'focus-25m-v1'
  min_active_s   INT NOT NULL,
  amount         BIGINT NOT NULL CHECK (amount > 0),
  daily_cap      INT NOT NULL,
  weekly_cap     INT NOT NULL,
  terms_text     TEXT NOT NULL,              -- shown to the user before opt-in
  published_at   TIMESTAMPTZ NOT NULL,
  retired_at     TIMESTAMPTZ
);

CREATE TABLE offers (
  id             UUID PRIMARY KEY,
  rule_version   TEXT NOT NULL REFERENCES reward_rules(version),
  status         TEXT NOT NULL CHECK (status IN ('open','paused','closed')),
  budget_total   BIGINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id             UUID PRIMARY KEY,
  offer_id       UUID NOT NULL REFERENCES offers(id),
  user_id        UUID NOT NULL,
  amount         BIGINT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('held','consumed','released','expired')),
  expires_at     TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE awards (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  reservation_id  UUID NOT NULL UNIQUE REFERENCES reservations(id),  -- one award per reservation
  client_session_id TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('pending','available','paid','voided')),
  amount          BIGINT NOT NULL,
  rule_version    TEXT NOT NULL,
  evidence        JSONB NOT NULL,          -- signals only, never private content
  UNIQUE (user_id, client_session_id)      -- same session can never be awarded twice
);

CREATE TABLE payouts (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  amount          BIGINT NOT NULL,
  destination     TEXT NOT NULL,           -- user's Solana address (embedded wallet)
  status          TEXT NOT NULL CHECK (status IN ('requested','submitted','confirmed','failed_retryable','needs_reconciliation')),
  tx_signature    TEXT,
  blockhash_last_valid_height BIGINT,
  idempotency_key TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);
```

### Outstanding obligations vs unallocated funds

- `treasury:unallocated` — deposited, not promised to anyone.
- `treasury:reserved` — held for accepted offers (reservations).
- `user:*:pending` / `user:*:available` — owed to users.
- Solvency check, run on every reservation and continuously:
  `onchain_treasury_balance >= reserved + sum(pending) + sum(available) + in-flight payouts`.

## Flows

**Accept offer** (one DB transaction, `SERIALIZABLE` or `SELECT … FOR UPDATE` on the offer budget row):
1. Check offer `open`, rule not retired, user under daily/weekly caps.
2. Check `treasury:unallocated >= amount`. If not, set offer `paused` and return
   `paused_no_funds` (existing obligations are still honoured).
3. Journal: `treasury:unallocated −amount`, `treasury:reserved +amount`.
4. Insert reservation `held` with `expires_at`. Idempotent on `(user_id, idempotency_key)`.

**Submit session**: evaluate evidence against the rule version recorded on the
reservation. On success, journal `treasury:reserved → user:pending` and insert
award (unique on reservation and on client session id). On failure, release.

**Expiry/release**: a job moves `held` reservations past `expires_at` to
`expired` and journals `reserved → unallocated`. Explicit release does the same.

**Pending → available**: after a review window (fraud checks, appeal period).

**Payout**:
1. Move `available → paid-in-flight` in the ledger, insert payout `requested`.
2. Build a USDC SPL transfer from the treasury, **signed server-side only**
   (KMS/HSM). Treasury pays the SOL fee and, if needed, creates the user's
   associated token account, so users never need SOL.
3. Record signature and `lastValidBlockHeight` before sending → `submitted`.
4. Confirm. If the outcome is unknown (timeout, RPC error), mark
   `needs_reconciliation`: look up the signature; only if the blockhash has
   expired **and** the signature is not found may it be retried with a new
   transaction under the same idempotency key. Never blind-retry.

## Chain

- Native USDC on Solana. Mainnet mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;
  devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle docs,
  developers.circle.com/stablecoins/usdc-contract-addresses). 6 decimals.
- Development uses labelled simulation (in-app) or devnet with Circle's faucet.
  Never mainnet in development.

## Identity and wallets (to evaluate, not chosen)

Privy's Expo SDK (`@privy-io/expo`, 0.77.0 as of 2026-10-25) offers email and
Apple sign-in plus embedded Solana wallets. Open questions before choosing it:
- Expo SDK 58 compatibility is not stated in Privy's docs; needs a spike.
- It adds polyfills, a custom Metro resolver and several native peers.
- Wallet creation should be lazy: only when a user opts into rewards. The
  productivity app must never require sign-in or a wallet.

## Not doing

Deposits, wagering, staking, token purchases, points or a project token in place
of USDC, screen recording, webcam monitoring or uploading private work.
