# Dialed (working name)

An iOS-first app for planning the day, focusing on one thing at a time, and
building habits. Everything is stored locally; no account or wallet is needed.
USDC rewards are **not live**.

Change the working name without touching code: `APP_DISPLAY_NAME="New Name"`
when you run prebuild (see `app.config.ts`).

## Stack

Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router · expo-sqlite
(migrations + typed repositories) · Reanimated 4 · a local Swift Expo module
(`modules/lockin-blocking`) · two app extensions via `@bacons/apple-targets`
(`targets/`). iOS development build only; Expo Go can't run the Screen Time code.

## Layout

```
src/app/            routes (tabs: Today, Habits, Progress, Rewards; focus, settings, sheets)
src/domain/         pure logic: dates, focus timing, habit schedules, progress, rewards
src/db/             SQLite driver interface, expo-sqlite driver, migrations
src/repos/          typed repositories (tasks, sessions, habits, preferences, export/delete)
src/state/          app provider (DB, prefs, day rollover, foreground recovery), focus actions
src/native/         blocking provider (iOS / Android / fallback), notifications
src/ui/             theme, components, dock, collapsing header, week strip
modules/lockin-blocking/   Swift: FamilyControls, ManagedSettings, DeviceActivity
targets/            DeviceActivityMonitor (lifts shield at end) and ShieldConfiguration
tests/              vitest against real SQLite (node:sqlite)
docs/               blocking spike, rewards backend design, session signals
```

## Run it

```bash
npm install
npm test                  # 39 tests, real SQLite
npm run typecheck
```

iOS Simulator (development build):

```bash
LANG=en_US.UTF-8 npx expo run:ios --device "iPhone 18 Pro"
```

Physical iPhone (development build, needs your Apple team in Xcode):

```bash
APPLE_TEAM_ID=YOURTEAMID npx expo prebuild --platform ios --clean
LANG=en_US.UTF-8 npx expo run:ios --device
```

Or with EAS: `npx eas-cli@latest build --profile development --platform ios`
(needs an `eas.json` and an Expo account).

If `pod install` fails with `Unicode Normalization not appropriate for
ASCII-8BIT`, your shell locale isn't UTF-8: `export LANG=en_US.UTF-8`.

## Key decisions

- **Timer truth is timestamps.** Sessions store start, pauses and end in SQLite;
  elapsed time is computed, never counted. A session that ran out while the app
  was closed is completed at the moment it actually ended.
- **One open session**, enforced by a unique index as well as in code.
- **Day keys** (`YYYY-MM-DD`) are captured in the zone the user was in at the
  time; all day arithmetic is done in UTC so DST can't skip or repeat days.
  A session counts toward the day it started.
- **Habits**: today is pending, not missed; rest days remove an opportunity;
  lifetime check-ins never go down.
- **Rewards**: production shows no offers and zero balances. A dev-only demo
  is typed `'simulated'` and cannot be summed into or rendered as a real balance.

See `docs/` for the blocking spike status, rewards backend design and what a
session can and can't prove.
