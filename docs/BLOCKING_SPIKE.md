# iOS app blocking — technical spike

## Status (2026-10-25)

| | Stage | Status |
| --- | --- | --- |
| A | Working timer | **Done.** Timestamp-based, survives backgrounding and force-quit (unit-tested against real SQLite; exercised in the iOS 27 Simulator). |
| B | Native blocking code implemented | **Done, compiles, and runs in the Simulator** (module + 2 extensions embedded). The authorisation call reaches Apple's real Screen Time prompt. |
| C | Blocking tested on a physical iPhone | **Not done.** No device was available in this session. |
| D | Distribution entitlement approved | **Not requested.** Needs Apple approval for the app *and* each extension bundle ID. |

The app shows blocking as unavailable whenever the native module is missing
(Expo Go, Android, web) and only says "Selected apps are shielded" after the
native layer reads the shield back from `ManagedSettingsStore`.

## What's built

`modules/lockin-blocking/ios/LockinBlockingModule.swift`
- `requestAuthorization()` → `AuthorizationCenter.shared.requestAuthorization(for: .individual)`.
  Status is re-read on every foreground, so revocation in iOS Settings is picked up.
- `presentActivityPicker()` → SwiftUI `FamilyActivityPicker` in a sheet. The
  `FamilyActivitySelection` (opaque tokens) is JSON-encoded into the App Group
  `UserDefaults`. It never leaves the device.
- `startShield(endsAtMs)` → named store `lockin.focus`: `shield.applications`,
  `shield.applicationCategories = .specific(...)`, `shield.webDomains`; then
  `DeviceActivityCenter.startMonitoring("lockin.session")` with a non-repeating
  schedule ending at the session end. Returns what it **read back**.
- `stopShield()` → `clearAllSettings()` + `stopMonitoring`.
- `shieldState()` → diagnostics (shielded, monitoring, end time, when the
  extension last lifted a shield).

`targets/activity-monitor` — `DeviceActivityMonitor.intervalDidEnd` clears the
store and records a timestamp in the App Group, so apps unlock on time even if
the main app was killed.

`targets/shield-config` — neutral grey shield: "Focusing. You chose to block
this until 14:30."

App behaviour: shields go on at start/resume, come off at pause/end/completion,
and on every launch/foreground the app lifts any shield that has no running
session behind it.

## What the Simulator showed (iPhone 18 Pro, iOS 27.0)

- The native module loads; diagnostics read real state (not authorised, no shield).
- "Allow Screen Time access" opens Apple's genuine system prompt.
- **Don't Allow**: the app shows "Screen Time access not granted" and stays fully
  usable. Note iOS left the status at `notDetermined` (not `denied`), so the app
  treats any request that ends unapproved as declined.
- **Continue**: authorisation does not complete. The system log shows
  `FamilyControlsAgent … CKError "Not Authenticated"` — the simulator has no
  Apple Account signed in. So the picker, shields and the monitor extension were
  **not** exercised. This needs a physical iPhone (or a simulator signed in to
  an Apple Account, untested).

## Constraints found

- **15-minute minimum** DeviceActivity interval (`MonitoringError.intervalTooShort`).
  For shorter sessions the schedule starts in the past so it still ends at the
  session end. *Unverified on device* whether iOS honours an interval whose
  start is already past; if not, short sessions would rely on the app lifting
  the shield on its next launch (which it does).
- **Simulator**: Apple doesn't document support. Forum reports say the picker
  shows only categories and authorisation is unreliable. Treat device testing as
  required.
- **Entitlement**: `com.apple.developer.family-controls` works with development
  signing. TestFlight/App Store need approval via
  https://developer.apple.com/contact/request/family-controls-distribution —
  one request each for `dev.lockin.app`, `dev.lockin.app.monitor`,
  `dev.lockin.app.shield` (change if the bundle ID changes).
- **What it can't do**: prove work, block other devices, or stop someone
  removing the authorisation. The user chooses what to block.

## Device test plan (stage C)

1. Build to an iPhone with your team: `APPLE_TEAM_ID=… npx expo prebuild -p ios --clean && npx expo run:ios --device`.
2. Settings › App blocking › Allow Screen Time access (Face ID). Deny once first
   and confirm the app stays fully usable and says "Not allowed".
3. Choose 1–2 apps. Start a 15-minute focus with blocking on → open a chosen
   app → grey shield appears.
4. Pause → apps open. Resume → shielded again.
5. End early → apps open immediately.
6. Diagnostics › "Test: shield for 2 minutes" → force-quit the app → wait →
   chosen apps unlock at the stated time; reopen and check "Extension last
   lifted a shield".
7. Start a 25-minute session, force-quit, wait past the end → apps unlock;
   reopen → session shows completed at the right time.
8. Revoke Screen Time access in iOS Settings mid-session → reopen → blocking
   shows "Not allowed"; timer unaffected.
