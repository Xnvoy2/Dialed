import { DayKey, addDays, daysBetween } from './dates';
import { Frequency, WORKDAYS } from './habits';

/**
 * The arc questionnaire: what the user wants to quit and build, and how the
 * app sets itself up in response. Pure data and functions so the mapping
 * from answers to setup is tested.
 *
 * Goals come from what people commonly pick for a "winter arc" / "great
 * lock-in": fitness, sleep and routines, screen time, study and work,
 * nutrition, mindset, money, and quitting porn, nicotine, alcohol and
 * doomscrolling.
 */

export type GoalKind = 'quit' | 'build';

export type GoalId =
  // quit
  | 'porn'
  | 'nicotine'
  | 'doomscrolling'
  | 'gaming'
  | 'alcohol'
  | 'junk_food'
  // build
  | 'gym'
  | 'steps'
  | 'study'
  | 'project'
  | 'sleep'
  | 'reading'
  | 'mind'
  | 'money'
  | 'self_care';

export interface Goal {
  id: GoalId;
  kind: GoalKind;
  label: string;
  /** Ionicons name. */
  icon: string;
}

export const GOALS: Goal[] = [
  { id: 'porn', kind: 'quit', label: 'Porn', icon: 'eye-off-outline' },
  { id: 'nicotine', kind: 'quit', label: 'Vaping / nicotine', icon: 'cloud-outline' },
  { id: 'doomscrolling', kind: 'quit', label: 'Doomscrolling', icon: 'phone-portrait-outline' },
  { id: 'gaming', kind: 'quit', label: 'Too much gaming', icon: 'game-controller-outline' },
  { id: 'alcohol', kind: 'quit', label: 'Drinking', icon: 'wine-outline' },
  { id: 'junk_food', kind: 'quit', label: 'Junk food', icon: 'fast-food-outline' },
  { id: 'gym', kind: 'build', label: 'Get in the gym', icon: 'barbell-outline' },
  { id: 'steps', kind: 'build', label: 'Move every day', icon: 'walk-outline' },
  { id: 'study', kind: 'build', label: 'Study / grades', icon: 'school-outline' },
  { id: 'project', kind: 'build', label: 'Build a project or business', icon: 'construct-outline' },
  { id: 'sleep', kind: 'build', label: 'Fix my sleep', icon: 'moon-outline' },
  { id: 'reading', kind: 'build', label: 'Read more', icon: 'book-outline' },
  { id: 'mind', kind: 'build', label: 'Mental health', icon: 'leaf-outline' },
  { id: 'money', kind: 'build', label: 'Save money', icon: 'cash-outline' },
  { id: 'self_care', kind: 'build', label: 'Look after myself', icon: 'water-outline' },
];

export const goal = (id: GoalId): Goal => GOALS.find((g) => g.id === id)!;

export type Distraction = 'social' | 'short_video' | 'youtube' | 'games' | 'messaging' | 'browsing';

export const DISTRACTIONS: { id: Distraction; label: string }[] = [
  { id: 'social', label: 'Social media' },
  { id: 'short_video', label: 'TikTok / Reels / Shorts' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'games', label: 'Games' },
  { id: 'messaging', label: 'Group chats' },
  { id: 'browsing', label: 'Browsing' },
];

export const ARC_LENGTHS = [30, 60, 90] as const;
export type ArcLength = (typeof ARC_LENGTHS)[number];

export interface ArcAnswers {
  quit: GoalId[];
  build: GoalId[];
  gymDays: number;
  bedtime: string; // 'HH:MM'
  distractions: Distraction[];
  focusMinutes: number;
  lengthDays: ArcLength;
  why: string;
}

export const DEFAULT_ANSWERS: ArcAnswers = {
  quit: [],
  build: [],
  gymDays: 4,
  bedtime: '23:00',
  distractions: [],
  focusMinutes: 25,
  lengthDays: 90,
  why: '',
};

export interface PlannedHabit {
  key: string;
  goal: GoalId;
  name: string;
  frequency: Frequency;
  weekdaysMask?: number;
  weeklyTarget?: number;
}

export interface ArcPlan {
  habits: PlannedHabit[];
  /** Block apps the user picks whenever they lock in. */
  blockDuringLockIn: boolean;
  /** Always-on Screen Time adult-website filter (Safari and other WebKit browsers). */
  adultFilter: boolean;
  focusMinutes: number;
  lengthDays: ArcLength;
  /** Default lock-in reason, shown on the shield. */
  why: string | null;
  /** Short lines for the plan screen explaining what each choice does. */
  notes: string[];
}

/** Turns answers into a setup. The plan screen lets the user untick anything. */
export function buildPlan(a: ArcAnswers): ArcPlan {
  const habits: PlannedHabit[] = [];
  const notes: string[] = [];
  const add = (h: PlannedHabit) => {
    if (!habits.some((x) => x.key === h.key)) habits.push(h);
  };
  const quit = new Set(a.quit);
  const build = new Set(a.build);

  if (quit.has('porn')) {
    add({ key: 'porn', goal: 'porn', name: 'Porn-free today', frequency: 'daily' });
    notes.push('Adult websites blocked all the time with Apple’s Screen Time filter.');
  }
  if (quit.has('nicotine')) add({ key: 'nicotine', goal: 'nicotine', name: 'Nicotine-free today', frequency: 'daily' });
  if (quit.has('doomscrolling')) {
    add({ key: 'doomscrolling', goal: 'doomscrolling', name: 'No phone in bed', frequency: 'daily' });
  }
  if (quit.has('gaming')) {
    add({ key: 'gaming', goal: 'gaming', name: 'No gaming on weekdays', frequency: 'weekdays', weekdaysMask: WORKDAYS });
  }
  if (quit.has('alcohol')) add({ key: 'alcohol', goal: 'alcohol', name: 'Alcohol-free today', frequency: 'daily' });
  if (quit.has('junk_food')) add({ key: 'junk_food', goal: 'junk_food', name: 'No junk food', frequency: 'daily' });

  if (build.has('gym')) {
    const n = Math.min(7, Math.max(1, Math.round(a.gymDays)));
    add({ key: 'gym', goal: 'gym', name: 'Workout', frequency: 'weekly', weeklyTarget: n });
  }
  if (build.has('steps')) add({ key: 'steps', goal: 'steps', name: '10k steps', frequency: 'daily' });
  if (build.has('study')) {
    add({ key: 'study', goal: 'study', name: 'Study session', frequency: 'weekdays', weekdaysMask: WORKDAYS });
  }
  if (build.has('project')) {
    add({ key: 'project', goal: 'project', name: 'Work on my project', frequency: 'weekdays', weekdaysMask: WORKDAYS });
  }
  if (build.has('sleep')) add({ key: 'sleep', goal: 'sleep', name: `In bed by ${a.bedtime}`, frequency: 'daily' });
  if (build.has('reading')) add({ key: 'reading', goal: 'reading', name: 'Read 10 pages', frequency: 'daily' });
  if (build.has('mind')) add({ key: 'mind', goal: 'mind', name: '10 minutes to journal or meditate', frequency: 'daily' });
  if (build.has('money')) add({ key: 'money', goal: 'money', name: 'Review my spending', frequency: 'weekly', weeklyTarget: 1 });
  if (build.has('self_care')) add({ key: 'self_care', goal: 'self_care', name: 'Drink 2L of water', frequency: 'daily' });

  const blockDuringLockIn =
    a.distractions.length > 0 || quit.has('doomscrolling') || quit.has('gaming') || quit.has('porn');
  if (blockDuringLockIn) notes.push('The apps you pick get blocked every time you lock in.');

  const focusMinutes = build.has('study') || build.has('project') ? Math.max(a.focusMinutes, 25) : a.focusMinutes;

  const why = a.why.replace(/\s+/g, ' ').trim().slice(0, 140) || null;
  if (why) notes.push('Your “why” shows up if you try to open a blocked app.');

  return {
    habits,
    blockDuringLockIn,
    adultFilter: quit.has('porn'),
    focusMinutes,
    lengthDays: a.lengthDays,
    why,
    notes,
  };
}

export interface ArcProgress {
  day: number;
  length: number;
  daysLeft: number;
  done: boolean;
  endDay: DayKey;
}

/** Day 1 is the start day. Past the end, the arc is done (it never goes negative). */
export function arcProgress(startDay: DayKey, lengthDays: number, today: DayKey): ArcProgress {
  const elapsed = daysBetween(startDay, today);
  const day = Math.min(lengthDays, Math.max(1, elapsed + 1));
  const endDay = addDays(startDay, lengthDays - 1);
  return {
    day,
    length: lengthDays,
    daysLeft: Math.max(0, daysBetween(today, endDay)),
    done: today > endDay,
    endDay,
  };
}
