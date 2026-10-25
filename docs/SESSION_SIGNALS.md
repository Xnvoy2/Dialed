# What a focus session can and cannot tell us

A timer does not prove work. This table is what the app can honestly observe.

| Signal | Where it comes from | Trust | Limits |
| --- | --- | --- | --- |
| Start / end / pause timestamps | Device clock, stored in SQLite | Low | The user controls the clock and can edit the local database on a jailbroken or backed-up device. Moving the clock forward "completes" a session. |
| Active seconds (pauses excluded) | Derived from the timestamps | Low | Same as above; it is arithmetic on user-controlled times. |
| Session completed vs ended early | App state machine | Low | Says the timer ran out, not that anything was done. |
| Shield applied (read back from ManagedSettings) | iOS Screen Time | Medium | Proves chosen apps were shielded on this iPhone. Says nothing about other devices, other apps not chosen, or what the person did. The user picks what to block and can choose nothing meaningful. |
| Screen Time authorisation status | iOS | Medium | Can be revoked at any time in Settings. |
| App backgrounded | AppState | None | Deliberately ignored. Leaving the app is not distraction: people read on paper, take calls, use other tools. |
| App Attest / DeviceCheck (future) | Apple | Medium for "a genuine copy of this app on a real device" | Does not prove the person worked. |
| Server-received times (future) | Server clock at start and end requests | Medium for duration bounds | Requires being online at both ends; still not proof of work. |

## Consequences

- Rewards, if launched, must be framed as "meeting a published rule"
  (e.g. "a 25-minute session with blocking on, at most twice a day"), with caps
  sized so cheating gains little.
- The server should bound durations with its own clock and reject impossible
  sequences (overlaps, future timestamps, more sessions than hours in a day).
- We do not claim tamper-proof verification, and we do not add surveillance
  (screen recording, camera, uploading work) to try to get it.
