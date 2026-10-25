# Blocking test on a physical iPhone

Device: iPhone 16 · iOS 26.5 · Release-configuration development build
(JS bundled, no Metro). Signed with team PPNNNASZJX, Family Controls
(Development) entitlement on the app and all three extensions
(monitor, shield screen, shield actions).

Mark each step pass / fail and note anything odd.

## Run 1 (2026-10-25) — before Lock-in mode

Focus session started with blocking never set up: the database recorded
`blocking_requested = 0`, so nothing was blocked. Setup lived only in
Settings and Focus started silently without it. Fixed by Lock-in mode.

## Run 2 — Lock-in mode and distraction intercept

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 1 | Today › **Lock in** › Set up blocking → **Continue** → Face ID | Apple's app picker opens straight after | |
| 2 | Pick 2–3 apps → Done | Card shows "Block 3 apps and sites", switched on; button reads "Lock in · 25 min" | |
| 3 | Type a reason (e.g. "finish my portfolio") → choose **15 min** → Lock in | Timer starts; it says "Selected apps are shielded" | |
| 4 | Open a blocked app | Grey screen: "You're locked in", your reason, end time, **Back to focus** / **Open for 5 minutes** | |
| 5 | Tap **Back to focus** | App closes | |
| 6 | Open it again → **Open for 5 minutes** | That app opens; other chosen apps still blocked | |
| 7 | Wait ~5 min (Dialed closed) → open that app again | Blocked again. If not, open Dialed once: it re-blocks on return | |
| 8 | End early | All apps open; completion shows "Went back to focus 1 time · Took 1 deliberate break from blocking" | |
| 9 | Lock in 15 min → force-quit Dialed → wait past the end | Apps unlock on time; reopening shows session completed | |
| 10 | Mid-session, revoke Screen Time access in iOS Settings → reopen Dialed | No false "shielded"; timer unaffected | |

Unknowns this run settles:
- Step 7: whether DeviceActivity runs an interval that starts in the past
  (needed for 5-minute re-blocks and sessions under 15 minutes).
- Step 6: whether exempting one app from a *category* shield works
  (`.specific(categories, except: [app])`). Pick individual apps, not only
  categories, to test the simpler path first.

## Notes

-
