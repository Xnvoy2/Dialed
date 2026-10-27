# Dialed server

Sign in with Apple, the rewards ledger, and payouts. **Simulated or Solana
devnet by default. Real USDC (mainnet) only with every safeguard in [DEPLOY.md](DEPLOY.md).** Node 22+, PostgreSQL 15+.

## Run it locally

```bash
cd lockin/server
npm install
createdb dialed_dev && createdb dialed_test
cp .env.example .env          # simulated payouts, simulator sign-in on
npm test                      # 29 integration tests against dialed_test
npm run dev                   # API on :4020, applies migrations, runs jobs
```

Point the app at it with `DIALED_API_URL` (in `lockin/.env.local`):
`http://localhost:4020` for the simulator, `http://<your Mac's LAN IP>:4020`
for an iPhone on the same Wi‑Fi. Rebuild the app after changing it.

## Operate it

```bash
npm run dialed -- status                     # funding, obligations, offers (and on-chain balance on devnet)
npm run dialed -- deposit 25 --ref <id> --source "Founders"
npm run dialed -- rule --version focus-25-v1 --title "Complete a 25-minute lock-in" \
     --minutes 25 --amount 0.10 --daily 2 --weekly 8 [--blocking]
npm run dialed -- offer open --rule focus-25-v1 --budget 10
npm run dialed -- offer pause|open-again|close <offer id>
npm run dialed -- tick                       # run jobs once
```

Rules are versioned and never edited; publish a new version instead.

## How money moves

Double-entry ledger in integer USDC base units. Postgres enforces, at commit,
that every journal sums to zero and no account goes negative; entries can't be
updated, deleted or truncated.

```
deposit           treasury:deposits   → treasury:unallocated
accept offer      unallocated         → reserved          (offer budget and caps checked, treasury row locked)
release / expiry  reserved            → unallocated
award             reserved            → user:pending      (after the review window → user:available)
payout request    user:available      → user:inflight
payout confirmed  user:inflight       → user:paid
payout failed     user:inflight       → user:available
account deleted   pending/available   → unallocated       (only with explicit confirmation)
```

If unallocated funds can't cover the cheapest open offer, new acceptances pause
(`paused_no_funds`); accepted offers, awards and payouts are still honoured.
A deposit resumes them on the next tick.

## What the server checks on a session

Numbers only (never task titles or notes): the session must start after the
offer was accepted, meet the rule's active minutes, not claim more active time
than its own length, not end in the future, and **not claim more focus than
time has passed on the server's clock since accepting**. Optional: app blocking
was on. This bounds cheating; it does not prove work. See
`../docs/SESSION_SIGNALS.md`.

## Devnet payouts

1. `npm run dialed -- keygen ~/.config/dialed/treasury-devnet.json` (writes a
   mode-600 key outside the repo and prints the treasury address).
2. Fund that address with devnet SOL (`solana airdrop 2 <address> -u devnet`
   or faucet.solana.com) for fees and token-account rent, and with devnet USDC
   from faucet.circle.com (Solana Devnet).
3. In `.env`: `DIALED_PAYOUT_NETWORK=devnet`, `DIALED_SIGNER_KEYPAIR=<path>`.
4. `npm run dialed -- deposit <amount> --ref <faucet tx signature> --source "Circle devnet faucet"`
   (refused unless the on-chain balance covers everything owed plus the deposit).

The signer only builds one kind of transaction: create the recipient's token
account if needed, `transferChecked` of the configured mint, and a memo, capped
per payout (`DIALED_MAX_PAYOUT_USDC`, default 50). The signature and blockhash
expiry are stored before sending; an uncertain send is retried only after the
old transaction can no longer land.

## Deploying (staging)

Set `DIALED_ENV=staging`, a 32+ character `DIALED_SESSION_SECRET`,
`DATABASE_URL`, and `APPLE_BUNDLE_ID`. Dev sign-in is always off in staging.
Run behind HTTPS; the app's release build won't talk to plain HTTP outside the
local network.
