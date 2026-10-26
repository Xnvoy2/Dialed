import { describe, expect, it } from 'vitest';
import { insight } from '../src/domain/insight';

const base = { hour: 10, arcDay: 2, arcLength: 90, focusedMinutes: 0, focusMinutesDefault: 25, habitsDone: 0, habitsTotal: 4, openTasks: 2, streak: 0 };
const text = (i: Parameters<typeof insight>[0]) => insight(i).map((s) => s.text).join(' ');

describe('Today insight', () => {
  it('nothing yet: points at one lock-in and the arc day', () => {
    expect(text(base)).toBe('Day 2 of 90. Start with one 25-minute lock-in to start your streak.');
    expect(text({ ...base, streak: 3 })).toMatch(/keep your 3-day streak/);
  });
  it('evening with nothing done', () => {
    expect(text({ ...base, hour: 20 })).toMatch(/still time for 25 focused minutes/);
  });
  it('reports real progress', () => {
    expect(text({ ...base, focusedMinutes: 30, habitsDone: 1 })).toBe(
      '30 minutes focused and 1 of 4 habits done. One more lock-in clears the way for 2 tasks.',
    );
  });
  it('singular minute', () => {
    expect(text({ ...base, focusedMinutes: 1 })).toMatch(/^1 minute focused/);
  });
  it('a full day', () => {
    expect(text({ ...base, focusedMinutes: 55, habitsDone: 4 })).toBe('Every habit done and 55 minutes of focus. That’s a dialed day.');
  });
  it('evening reminder of habits left', () => {
    expect(text({ ...base, hour: 21, focusedMinutes: 20, habitsDone: 2 })).toMatch(/2 habits left tonight/);
  });
  it('mixes bright facts and dim connecting words', () => {
    const segs = insight({ ...base, focusedMinutes: 30, habitsDone: 1 });
    expect(segs.some((s) => s.dim)).toBe(true);
    expect(segs.some((s) => !s.dim)).toBe(true);
  });
});
