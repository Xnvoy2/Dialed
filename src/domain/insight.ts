/**
 * The headline on Today: one sentence about the user's real day, in two
 * tones (bright for the facts, dim for the connecting words), like the
 * reference design. Only states what the data shows; never invents.
 */
export interface Segment {
  text: string;
  dim?: boolean;
}

export interface InsightInput {
  hour: number;
  arcDay: number | null;
  arcLength: number | null;
  focusedMinutes: number;
  focusMinutesDefault: number;
  habitsDone: number;
  habitsTotal: number;
  openTasks: number;
  streak: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function insight(i: InsightInput): Segment[] {
  const left = Math.max(0, i.habitsTotal - i.habitsDone);
  const allHabits = i.habitsTotal > 0 && left === 0;
  const arc = i.arcDay && i.arcLength ? `Day ${i.arcDay} of ${i.arcLength}.` : null;

  if (i.focusedMinutes === 0 && i.habitsDone === 0) {
    const out: Segment[] = [];
    if (arc) out.push({ text: arc });
    if (i.hour >= 18) {
      out.push({ text: 'Nothing locked in yet,', dim: true }, { text: 'but there’s still time', dim: false });
      out.push({ text: `for ${i.focusMinutesDefault} focused minutes.`, dim: true });
      return out;
    }
    out.push({ text: 'Start with', dim: true }, { text: `one ${i.focusMinutesDefault}-minute`, dim: false });
    out.push({ text: 'lock-in', dim: false }, { text: i.streak > 0 ? `to keep your ${i.streak}-day streak.` : 'to start your streak.', dim: true });
    return out;
  }

  if (allHabits && i.focusedMinutes > 0) {
    return [
      { text: 'Every habit done', dim: false },
      { text: 'and', dim: true },
      { text: plural(i.focusedMinutes, 'minute', 'minutes'), dim: false },
      { text: 'of focus.', dim: true },
      { text: 'That’s a dialed day.', dim: false },
    ];
  }

  const out: Segment[] = [];
  if (i.focusedMinutes > 0) {
    out.push({ text: plural(i.focusedMinutes, 'minute', 'minutes'), dim: false }, { text: 'focused', dim: true });
    if (i.habitsTotal > 0) out.push({ text: 'and', dim: true }, { text: `${i.habitsDone} of ${i.habitsTotal} habits`, dim: false }, { text: 'done.', dim: true });
    else out.push({ text: 'today.', dim: true });
  } else {
    out.push({ text: `${i.habitsDone} of ${i.habitsTotal} habits`, dim: false }, { text: 'done,', dim: true }, { text: 'no focus yet.', dim: true });
  }
  if (i.hour >= 18 && left > 0) out.push({ text: plural(left, 'habit', 'habits'), dim: false }, { text: 'left tonight.', dim: true });
  else if (i.openTasks > 0) out.push({ text: 'One more lock-in', dim: false }, { text: `clears the way for ${plural(i.openTasks, 'task', 'tasks')}.`, dim: true });
  else if (left > 0) out.push({ text: plural(left, 'habit', 'habits'), dim: false }, { text: 'to go.', dim: true });
  return out;
}
