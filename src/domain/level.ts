/**
 * Levels come only from time actually locked in (active focus seconds). They
 * are a progress marker, not a currency: nothing is spent, bought or traded.
 *
 * Going from level L to L+1 takes 30·L more minutes, so early levels come
 * quickly and later ones take real work. Level 8 is 14 hours in total.
 */
export const STEP_MINUTES = 30;
export const MAX_LEVEL = 50;

const NAMES = [
  'Getting started',
  'Warming up',
  'Showing up',
  'Finding rhythm',
  'Locked in',
  'Iron will',
  'Deep worker',
  'Dialed',
  'Unshakeable',
  'Relentless',
];

/** Total active seconds needed to reach a level (level 1 needs nothing). */
export function secondsForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return (STEP_MINUTES * 60 * (l - 1) * l) / 2;
}

export function levelName(level: number): string {
  return NAMES[Math.min(level, NAMES.length) - 1] ?? NAMES[NAMES.length - 1];
}

export interface LevelInfo {
  level: number;
  name: string;
  /** 0..1 through the current level. 1 at the cap. */
  progress: number;
  /** Seconds still needed for the next level; 0 at the cap. */
  remainingSeconds: number;
  nextLevel: number | null;
}

export function levelFor(activeSeconds: number): LevelInfo {
  const s = Math.max(0, activeSeconds);
  let level = 1;
  while (level < MAX_LEVEL && s >= secondsForLevel(level + 1)) level++;
  if (level === MAX_LEVEL) return { level, name: levelName(level), progress: 1, remainingSeconds: 0, nextLevel: null };
  const floor = secondsForLevel(level);
  const next = secondsForLevel(level + 1);
  return {
    level,
    name: levelName(level),
    progress: (s - floor) / (next - floor),
    remainingSeconds: next - s,
    nextLevel: level + 1,
  };
}

/** The new level if this session moved the total past a level line, else null. */
export function levelUp(beforeSeconds: number, afterSeconds: number): number | null {
  const a = levelFor(beforeSeconds).level;
  const b = levelFor(afterSeconds).level;
  return b > a ? b : null;
}
