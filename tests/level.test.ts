import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, levelFor, levelName, levelUp, secondsForLevel } from '../src/domain/level';

const min = (m: number) => m * 60;

describe('levels', () => {
  it('starts at level 1 with nothing locked in', () => {
    const l = levelFor(0);
    expect(l.level).toBe(1);
    expect(l.progress).toBe(0);
    expect(l.remainingSeconds).toBe(min(30));
    expect(l.nextLevel).toBe(2);
  });

  it('each level takes 30 minutes more than the last', () => {
    expect(secondsForLevel(2)).toBe(min(30));
    expect(secondsForLevel(3)).toBe(min(90));
    expect(secondsForLevel(4)).toBe(min(180));
    expect(secondsForLevel(8)).toBe(min(14 * 60));
  });

  it('reaches a level exactly on the line', () => {
    expect(levelFor(min(30) - 1).level).toBe(1);
    expect(levelFor(min(30)).level).toBe(2);
  });

  it('reports progress through the current level', () => {
    const l = levelFor(min(30 + 30)); // level 2 spans 30..90 min
    expect(l.level).toBe(2);
    expect(l.progress).toBeCloseTo(0.5);
    expect(l.remainingSeconds).toBe(min(30));
  });

  it('caps at the top level', () => {
    const l = levelFor(secondsForLevel(MAX_LEVEL) + min(1000));
    expect(l.level).toBe(MAX_LEVEL);
    expect(l.progress).toBe(1);
    expect(l.nextLevel).toBeNull();
  });

  it('detects a level-up only when a line is crossed', () => {
    expect(levelUp(min(20), min(35))).toBe(2);
    expect(levelUp(min(35), min(80))).toBeNull();
    expect(levelUp(0, min(200))).toBe(4);
  });

  it('names every level, reusing the last name past the list', () => {
    expect(levelName(1)).toBe('Getting started');
    expect(levelName(40)).toBe(levelName(10));
  });
});
