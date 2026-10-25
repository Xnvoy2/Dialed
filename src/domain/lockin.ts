/**
 * Lock-in mode: one tap starts focus, blocks chosen apps, and shows the
 * user's own reason on the shield. This file decides what the setup screen
 * shows and what the shield says. No platform code here, so it is testable.
 */

export interface SelectionCounts {
  applications: number;
  categories: number;
  webDomains: number;
}

export type AvailabilityLike =
  | { state: 'unsupported'; reason: string }
  | { state: 'not_determined' }
  | { state: 'denied' }
  | { state: 'approved'; selection: SelectionCounts };

export type BlockingReadiness =
  /** No Screen Time code in this build or platform. Lock-in still works, without blocking. */
  | { kind: 'unavailable'; detail: string }
  /** Never asked. One button asks for Screen Time access, then opens the app picker. */
  | { kind: 'needs_permission' }
  /** The user said no (or revoked it). Explain, offer to retry or open Settings. */
  | { kind: 'denied' }
  /** Allowed, but nothing chosen to block. */
  | { kind: 'needs_apps' }
  /** Ready. `on` is the user's toggle for this lock-in. */
  | { kind: 'ready'; count: number; on: boolean };

export function selectionTotal(s: SelectionCounts): number {
  return s.applications + s.categories + s.webDomains;
}

export function blockingReadiness(a: AvailabilityLike, enabledPref: boolean): BlockingReadiness {
  switch (a.state) {
    case 'unsupported':
      return { kind: 'unavailable', detail: a.reason };
    case 'not_determined':
      return { kind: 'needs_permission' };
    case 'denied':
      return { kind: 'denied' };
    case 'approved': {
      const count = selectionTotal(a.selection);
      return count === 0 ? { kind: 'needs_apps' } : { kind: 'ready', count, on: enabledPref };
    }
  }
}

/** True only when a lock-in started now would actually try to block. */
export function willBlock(r: BlockingReadiness): boolean {
  return r.kind === 'ready' && r.on;
}

/** What the start button says, so the user never thinks blocking is on when it isn't. */
export function startLabel(minutes: number, r: BlockingReadiness): string {
  return willBlock(r) ? `Lock in · ${minutes} min` : `Start ${minutes} min without blocking`;
}

/** Human text for a native failure code. */
export function describeBlockingError(code: string | null | undefined): string {
  switch (code) {
    case null:
    case undefined:
    case '':
      return 'Blocking couldn’t be applied.';
    case 'not_authorized':
    case 'denied':
    case 'not_determined':
      return 'Screen Time access is off, so nothing is blocked.';
    case 'empty_selection':
      return 'No apps are chosen to block.';
    case 'unsupported':
      return 'App blocking isn’t available in this build.';
    default:
      return `Blocking couldn’t be applied (${code}).`;
  }
}

/**
 * The reason shown on the shield. The user's own words if given, else the
 * task they picked, else nothing (the shield then shows a neutral line).
 */
export function shieldReason(reason: string | null | undefined, taskTitle: string | null | undefined): string | null {
  const r = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (r) return r.slice(0, 140);
  const t = (taskTitle ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 140) : null;
}

/** The shield's subtitle. Kept short: it sits under "You're locked in". */
export function shieldSubtitle(reason: string | null, endsAtLabel: string | null): string {
  const until = endsAtLabel ? ` Until ${endsAtLabel}.` : '';
  return reason ? `You said you wanted to: ${reason}.${until}` : `You chose to block this app for now.${until}`;
}

export const GRACE_MINUTES = 5;

/** Completion-screen line about the shield. Neutral wording; no scolding. */
export function shieldSummary(backToFocus: number, exits: number): string | null {
  const parts: string[] = [];
  if (backToFocus > 0) parts.push(`Went back to focus ${backToFocus} ${backToFocus === 1 ? 'time' : 'times'}`);
  if (exits > 0) parts.push(`Took ${exits} ${exits === 1 ? 'deliberate break' : 'deliberate breaks'} from blocking`);
  return parts.length ? parts.join(' · ') : null;
}
