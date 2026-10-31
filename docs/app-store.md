# Dialed: TestFlight and App Store details

Paste these into App Store Connect.

## Build

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

The production profile points at the live API and leaves app blocking out
(`DIALED_BLOCKING=0`) until Apple approves the Family Controls distribution
entitlement. Once it's approved, delete `DIALED_BLOCKING` from `eas.json` and
rebuild.

Request the entitlement here, once for the app and each extension:
https://developer.apple.com/contact/request/family-controls-distribution
Bundle IDs: `com.joshbarton.dialed`, `.monitor`, `.action`, `.shield`.

## URLs

- Privacy Policy: https://dialed-api-ten.vercel.app/privacy
- Support: https://dialed-api-ten.vercel.app/support

## TestFlight › Test Information

**Beta App Description**
Dialed helps you lock in: start a focus session, build daily habits and run a
90-day arc. Accept a reward offer and qualifying focus sessions earn test USDC
on Solana devnet.

**What to Test**
Sign in with Apple, set up your arc, run a 25-minute focus session, check off
a habit. On Rewards, accept the offer and finish a session. App blocking is
switched off in this build.

**Feedback email:** your Apple ID email (App Store Connect fills it in).

## App Store listing

- **Name:** Dialed
- **Subtitle:** Lock in. Build the habit.
- **Category:** Productivity (secondary: Health & Fitness)
- **Age rating:** 4+ (no objectionable content)
- **Keywords:** focus,habit,tracker,pomodoro,timer,productivity,streak,discipline,routine,goals,study,arc

**Description**
Dialed is a focus timer and habit tracker built around one idea: lock in.

• Lock in: start a focus session in one tap. Pauses and early exits are tracked honestly.
• Habits: check in daily, keep streaks and see your week at a glance.
• Your arc: pick what you're quitting and what you're building, then follow a 90-day plan.
• Progress: focus minutes, completed tasks and habit history.
• Rewards: accept an offer and qualifying focus sessions earn USDC under published rules.

Private by design: your tasks, habits and notes stay on your iPhone. No ads, no
analytics, no tracking.

## App Privacy (nutrition label)

Data used to track you: **None**.

Data linked to you:
- **Identifiers › User ID**: Sign in with Apple ID. Purpose: App Functionality.
- **Contact Info › Name**: only if shared at sign-in. Purpose: App Functionality.
- **Financial Info › Other Financial Info**: wallet address and reward/payout records. Purpose: App Functionality.
- **Usage Data › Product Interaction**: focus session length for reward checks. Purpose: App Functionality.

Not collected: email, location, contacts, health, browsing, diagnostics.

## Review notes (App Store submission)

Sign in with Apple is required to set up. Rewards are paid in USDC on Solana
under published, capped rules (0.10 USDC per qualifying 25-minute session, 2
per day). Users add their own wallet address; Dialed holds no user funds and
offers no exchange or trading. Account deletion: Settings › Delete account.
