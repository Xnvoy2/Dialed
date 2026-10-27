# Going live with real USDC

Mainnet only starts when **every** safeguard is configured. Leave one out and
the server refuses to boot and names the missing piece.

| Safeguard | Default on mainnet | Can you loosen it? |
|---|---|---|
| `DIALED_ENV=production` + `DIALED_REAL_MONEY=yes` | required | no |
| App Attest on every money request | always on | no |
| Review before rewards can be paid | 24 h | only longer |
| Max per payout | 5 USDC | up to 25 |
| All payouts in any 24 h | 25 USDC | up to 500 |
| Min payout | 1 USDC | yes |
| USDC mint | Circle mainnet USDC, fixed | no |
| RPC genesis check | must be mainnet | no |
| Kill switch | `npm run dialed -- payouts pause` | n/a |

## 1. Host the server (Railway)

1. Sign up at railway.com, then **New project → Deploy from GitHub repo** → `Xnvoy2/Dialed`.
   Set the service's **root directory** to `lockin/server`. It builds the `Dockerfile`.
2. **New → Database → PostgreSQL** in the same project.
3. On the API service, **Settings → Networking → Generate domain**. That HTTPS URL is your API.
4. **Variables** on the API service:

```
DIALED_ENV=production
DIALED_PAYOUT_NETWORK=devnet            # devnet first; mainnet in step 4
DATABASE_URL=${{Postgres.DATABASE_URL}}
DIALED_SESSION_SECRET=<openssl rand -hex 32>
APPLE_BUNDLE_ID=com.joshbarton.dialed
APPLE_TEAM_ID=PPNNNASZJX
SOLANA_RPC_URL=https://api.devnet.solana.com
DIALED_SIGNER_KEY=<contents of the devnet key file, see step 2>
DIALED_REQUIRE_ATTEST=1
```

Keep it at **one replica**: payout jobs run inside the server.

## 2. Treasury keys

Make one key per network on your Mac. Never commit them, never reuse them:

```bash
cd lockin/server
npm run dialed -- keygen ~/.config/dialed/treasury-devnet.json
npm run dialed -- keygen ~/.config/dialed/treasury-mainnet.json
```

Paste the file's contents (a `[12,34,…]` array) into the `DIALED_SIGNER_KEY`
variable yourself. Treat the mainnet key as a **hot wallet**: only keep in it
what you're prepared to lose. Top it up in small amounts.

## 3. Rehearse on devnet (hosted)

1. Fund the devnet treasury address with devnet SOL and Circle devnet USDC (see README).
2. Open a shell on the service (`railway ssh`) and run:
   ```bash
   node --import tsx src/cli/dialed.ts deposit 10 --ref <faucet tx> --source "Circle devnet faucet"
   node --import tsx src/cli/dialed.ts rule --version focus-25-v1 --title "Complete a 25-minute lock-in" --minutes 25 --amount 0.10 --daily 2 --weekly 8
   node --import tsx src/cli/dialed.ts offer open --rule focus-25-v1 --budget 5
   node --import tsx src/cli/dialed.ts status
   ```
3. Build the app against it and install on your iPhone:
   ```bash
   cd lockin
   DIALED_API_URL=https://<your-domain> xcodebuild … (same command as before)
   ```
4. On the phone, go through Rewards: Sign in with Apple, accept, lock in 25 min,
   wait out the 24 h review, then pay out to your own wallet. Check the
   transaction on explorer.solana.com (devnet).

## 4. Switch to mainnet

Only after the devnet run worked end to end, and after the legal check below.

```
DIALED_PAYOUT_NETWORK=mainnet
DIALED_REAL_MONEY=yes
SOLANA_RPC_URL=<a paid mainnet RPC, e.g. Helius or Triton>
DIALED_SIGNER_KEY=<contents of treasury-mainnet.json>
DIALED_ATTEST_ENV=production            # App Store/TestFlight builds only
```

Use a **fresh database**: devnet balances must not become mainnet IOUs.
(New Railway Postgres, or drop and recreate.)

Then send real USDC + ~0.05 SOL (fees and token-account rent) to the mainnet
treasury address yourself, and record it:

```bash
node --import tsx src/cli/dialed.ts deposit 25 --ref <your transfer signature> --source "Founders"
```

`deposit` refuses unless the on-chain balance already covers it.

`DIALED_ATTEST_ENV=production` means only TestFlight/App Store builds can earn.
While testing a build installed from Xcode, use `either`.

## Day to day

```bash
node --import tsx src/cli/dialed.ts status            # funding, caps, payouts state, on-chain balance
node --import tsx src/cli/dialed.ts payouts pause     # stop money going out right now
node --import tsx src/cli/dialed.ts payouts resume
node --import tsx src/cli/dialed.ts offer pause <id>  # stop new acceptances on one offer
```

Watch `status` daily at first. Pause if `owed` grows faster than people could
really be locking in.

## Not covered by code (do these before launch)

- **Legal.** Paying users can make you a money transmitter; payouts may be
  taxable income you must report; you'll need terms, an age minimum (18+) and
  a list of countries you serve. Get a lawyer's sign-off.
- **Sanctions screening.** Payout addresses aren't screened against OFAC lists
  yet. Add a screening provider (e.g. Chainalysis or TRM sanctions API) before
  real users.
- **App Store review.** Expect questions about crypto payouts (guideline 3.1.5).
  Be explicit that rewards are funded by you, not by users, and are not an investment.
- **One person, many Apple IDs.** App Attest stops scripts and fake apps, and
  each install's key is bound to one account. It doesn't stop someone with
  several iPhones. Keep caps low and watch the numbers.
