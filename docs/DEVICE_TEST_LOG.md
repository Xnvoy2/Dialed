# Blocking test on a physical iPhone

Device: iPhone 16 · iOS 26.5 · Release-configuration development build
(JS bundled, no Metro). Signed with team PPNNNASZJX, Family Controls
(Development) entitlement.

Mark each step pass / fail and note anything odd. "Expected" is what the code
is designed to do; this run is what proves it.

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 1 | Settings › App blocking › Allow Screen Time access → **Don't Allow** | Alert "Screen Time access not granted"; rest of app fully usable | |
| 2 | Allow Screen Time access → **Continue** → Face ID / passcode | Status row shows "Allowed" | |
| 3 | Choose apps and sites → pick 2–3 apps → Done | Row shows e.g. "3 apps"; "Block chosen apps during focus" turns on | |
| 4 | Start a 15-min focus (blocking on) → open a chosen app | Grey "Focusing" shield over the app; timer shows "Selected apps are shielded" | |
| 5 | Pause → open the app; Resume → open it again | Opens while paused; shielded again after resume | |
| 6 | End early → open the app | Opens immediately | |
| 7 | Diagnostics › Test: shield for 2 minutes → force-quit Dialed → wait 3 min | Apps unlock at the stated time with Dialed closed; on reopen "Extension last lifted a shield" shows that time | |
| 8 | Start a 15-min session → force-quit → wait past the end | Apps unlock at the end time; reopening shows the session completed at the right time | |
| 9 | Mid-session, revoke access in iOS Settings › Screen Time › Apps with Screen Time access → reopen Dialed | Blocking shows "Not allowed"; timer unaffected; no "shielded" claim | |

Step 7 is the key unknown: DeviceActivity needs at least a 15-minute
interval, so for short shields the schedule starts in the past. If iOS ignores
that, step 7 fails while step 8 passes — then short sessions need a different
approach (e.g. a `warningTime` or event threshold).

## Notes

-
