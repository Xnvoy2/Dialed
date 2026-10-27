-- Kill switch for sending money. Separate from treasury.paused (which stops
-- new offer acceptances when funds run low): this one stops payouts going out.
ALTER TABLE treasury ADD COLUMN payouts_paused boolean NOT NULL DEFAULT false;

-- App Attest keys. One key per app install, bound to the first user who
-- registers it; a key can never move to another account.
CREATE TABLE device_keys (
  key_id       text PRIMARY KEY,                 -- base64 key identifier from the device
  user_id      uuid NOT NULL REFERENCES users(id),
  public_key   bytea NOT NULL,                   -- SPKI DER of the attested P-256 key
  counter      bigint NOT NULL DEFAULT 0,        -- last assertion counter seen (replay guard)
  environment  text NOT NULL CHECK (environment IN ('development','production')),
  receipt      bytea,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX device_keys_user ON device_keys (user_id);

-- One-time challenges for attesting a new key.
CREATE TABLE attest_challenges (
  challenge  text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
