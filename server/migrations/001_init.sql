-- Dialed rewards backend. Amounts are integer USDC base units (6 decimals).
-- Nothing private (task titles, habit names, notes) is ever stored here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_sub      text UNIQUE NOT NULL,          -- Sign in with Apple stable user id
  display_name   text,
  payout_address text,                          -- Solana address the user gave us
  token_version  int NOT NULL DEFAULT 1,        -- bump to sign out every device
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Single row. Locked FOR UPDATE by every operation that moves treasury money,
-- so reservations can never promise more than is funded.
CREATE TABLE treasury (
  id      int PRIMARY KEY CHECK (id = 1),
  paused  boolean NOT NULL DEFAULT false
);
INSERT INTO treasury (id) VALUES (1);

-- Double-entry journal. Every journal's entries sum to zero, and no account
-- except the deposit source may go negative. Both are enforced at commit.
CREATE TABLE ledger_entries (
  id          bigserial PRIMARY KEY,
  journal_id  uuid NOT NULL,
  account     text NOT NULL,
  amount      bigint NOT NULL CHECK (amount <> 0),
  memo        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account ON ledger_entries (account);
CREATE INDEX ledger_entries_journal ON ledger_entries (journal_id);

CREATE FUNCTION ledger_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s bigint;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO s FROM ledger_entries WHERE journal_id = NEW.journal_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'ledger journal % does not balance (sum %)', NEW.journal_id, s;
  END IF;
  IF NEW.account <> 'treasury:deposits' THEN
    SELECT COALESCE(SUM(amount), 0) INTO s FROM ledger_entries WHERE account = NEW.account;
    IF s < 0 THEN
      RAISE EXCEPTION 'ledger account % would go negative (%)', NEW.account, s;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check();

CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger entries are append-only'; END $$;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

-- Funds the operator has put into the treasury.
CREATE TABLE deposits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount      bigint NOT NULL CHECK (amount > 0),
  network     text NOT NULL,
  reference   text UNIQUE NOT NULL,           -- devnet tx signature, or a label for simulated funds
  source      text NOT NULL,                  -- who contributed it (shown on the transparency screen)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Versioned, published rules. Never edited once published; publish a new version.
CREATE TABLE reward_rules (
  version             text PRIMARY KEY,
  title               text NOT NULL,
  min_active_seconds  int NOT NULL CHECK (min_active_seconds >= 60),
  requires_blocking   boolean NOT NULL DEFAULT false,
  amount              bigint NOT NULL CHECK (amount > 0),
  daily_cap           int NOT NULL CHECK (daily_cap > 0),
  weekly_cap          int NOT NULL CHECK (weekly_cap > 0),
  terms               text NOT NULL,
  published_at        timestamptz NOT NULL DEFAULT now(),
  retired_at          timestamptz
);

CREATE TABLE offers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version            text NOT NULL REFERENCES reward_rules(version),
  status                  text NOT NULL CHECK (status IN ('open','paused','closed')),
  budget_total            bigint NOT NULL CHECK (budget_total > 0),
  budget_remaining        bigint NOT NULL CHECK (budget_remaining >= 0),
  reservation_ttl_seconds int NOT NULL DEFAULT 86400 CHECK (reservation_ttl_seconds >= 600),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id         uuid NOT NULL REFERENCES offers(id),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount           bigint NOT NULL CHECK (amount > 0),
  status           text NOT NULL CHECK (status IN ('held','consumed','released','expired')),
  release_reason   text,
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  closed_at        timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX reservations_held ON reservations (status, expires_at);
CREATE INDEX reservations_user ON reservations (user_id, created_at);

CREATE TABLE awards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id     uuid UNIQUE NOT NULL REFERENCES reservations(id),
  client_session_id  text NOT NULL,
  rule_version       text NOT NULL REFERENCES reward_rules(version),
  amount             bigint NOT NULL CHECK (amount > 0),
  state              text NOT NULL CHECK (state IN ('pending','available','forfeited')),
  evidence           jsonb NOT NULL,     -- numbers only, never private content
  created_at         timestamptz NOT NULL DEFAULT now(),
  available_at       timestamptz NOT NULL,
  UNIQUE (user_id, client_session_id)
);
CREATE INDEX awards_pending ON awards (state, available_at);

CREATE TABLE payouts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id),
  amount                  bigint NOT NULL CHECK (amount > 0),
  destination             text NOT NULL,
  network                 text NOT NULL,
  status                  text NOT NULL CHECK (status IN ('requested','submitted','confirmed','failed')),
  signature               text,
  last_valid_block_height bigint,
  attempts                int NOT NULL DEFAULT 0,
  last_error              text,
  idempotency_key         text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX payouts_open ON payouts (status) WHERE status IN ('requested','submitted');
