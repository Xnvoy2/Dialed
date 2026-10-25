import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrations';
import {
  blockingReadiness,
  describeBlockingError,
  shieldReason,
  shieldSubtitle,
  shieldSummary,
  startLabel,
  willBlock,
} from '../src/domain/lockin';
import {
  endSession,
  getSession,
  recordShieldActivity,
  setBlockingApplied,
  startSession,
} from '../src/repos/sessions';
import { openNodeDb } from './nodeDb';

const sel = (applications: number, categories = 0, webDomains = 0) => ({ applications, categories, webDomains });

describe('blocking readiness', () => {
  it('maps every availability state', () => {
    expect(blockingReadiness({ state: 'unsupported', reason: 'x' }, true)).toEqual({ kind: 'unavailable', detail: 'x' });
    expect(blockingReadiness({ state: 'not_determined' }, true).kind).toBe('needs_permission');
    expect(blockingReadiness({ state: 'denied' }, true).kind).toBe('denied');
    expect(blockingReadiness({ state: 'approved', selection: sel(0) }, true).kind).toBe('needs_apps');
    expect(blockingReadiness({ state: 'approved', selection: sel(2, 1) }, false)).toEqual({ kind: 'ready', count: 3, on: false });
  });

  it('only promises blocking when it is ready and switched on', () => {
    expect(willBlock(blockingReadiness({ state: 'approved', selection: sel(2) }, true))).toBe(true);
    expect(willBlock(blockingReadiness({ state: 'approved', selection: sel(2) }, false))).toBe(false);
    expect(willBlock(blockingReadiness({ state: 'denied' }, true))).toBe(false);
    expect(willBlock(blockingReadiness({ state: 'approved', selection: sel(0) }, true))).toBe(false);
  });

  it('the start button never implies blocking that will not happen', () => {
    expect(startLabel(25, { kind: 'ready', count: 3, on: true })).toBe('Lock in · 25 min');
    expect(startLabel(25, { kind: 'needs_permission' })).toBe('Start 25 min without blocking');
    expect(startLabel(25, { kind: 'ready', count: 3, on: false })).toBe('Start 25 min without blocking');
  });

  it('explains failures in plain words', () => {
    expect(describeBlockingError('not_authorized')).toMatch(/Screen Time access is off/);
    expect(describeBlockingError('empty_selection')).toMatch(/No apps/);
    expect(describeBlockingError(null)).toMatch(/couldn’t be applied/);
  });
});

describe('shield text', () => {
  it('prefers the user’s reason, falls back to the task, then to nothing', () => {
    expect(shieldReason('  finish my   portfolio ', 'Task')).toBe('finish my portfolio');
    expect(shieldReason('', 'Write report')).toBe('Write report');
    expect(shieldReason(null, null)).toBeNull();
  });

  it('builds a calm subtitle', () => {
    expect(shieldSubtitle('finish my portfolio', '14:30')).toBe('You said you wanted to: finish my portfolio. Until 14:30.');
    expect(shieldSubtitle(null, null)).toBe('You chose to block this app for now.');
  });

  it('summarises shield activity without shaming', () => {
    expect(shieldSummary(0, 0)).toBeNull();
    expect(shieldSummary(3, 1)).toBe('Went back to focus 3 times · Took 1 deliberate break from blocking');
  });
});

describe('lock-in sessions (SQLite)', () => {
  it('stores the reason, the blocking error and shield counts, which never go down', () => {
    const db = openNodeDb();
    migrate(db);
    const T = Date.UTC(2026, 9, 25, 10);
    const s = startSession(db, { kind: 'focus', plannedSeconds: 1500, blockingRequested: true, reason: '  ship the portfolio ' }, T);
    expect(getSession(db, s.id)!.reason).toBe('ship the portfolio');
    setBlockingApplied(db, s.id, false, 'not_authorized');
    expect(getSession(db, s.id)!.blockingError).toBe('not_authorized');
    setBlockingApplied(db, s.id, true, 'ignored');
    expect(getSession(db, s.id)!.blockingError).toBeNull();
    recordShieldActivity(db, s.id, { backToFocus: 2, deliberateExits: 1 });
    recordShieldActivity(db, s.id, { backToFocus: 1, deliberateExits: 0 }); // stale read
    endSession(db, s.id, T + 600_000);
    const done = getSession(db, s.id)!;
    expect(done.backToFocusCount).toBe(2);
    expect(done.deliberateExitCount).toBe(1);
  });

  it('migrates a version-1 database without losing sessions', () => {
    const db = openNodeDb();
    migrate(db);
    const s = startSession(db, { kind: 'focus', plannedSeconds: 600 }, 0);
    expect(getSession(db, s.id)!.backToFocusCount).toBe(0);
    expect(getSession(db, s.id)!.reason).toBeNull();
  });
});
