/**
 * Calendar-day arithmetic on 'YYYY-MM-DD' keys.
 *
 * Day keys are calendar dates, not instants. All arithmetic on them happens in
 * UTC so daylight-saving transitions (23- and 25-hour days) can never skip or
 * repeat a day. The only place local time enters is dayKeyFor(), which reads
 * the device's current zone at the moment an event is recorded.
 */
export type DayKey = string;
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKeyFor(date: Date = new Date()): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

function toUtc(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DayKey, days: number): DayKey {
  const d = toUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(key: DayKey): number {
  return toUtc(key).getUTCDay();
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function startOfWeek(key: DayKey, weekStart: WeekStart): DayKey {
  const offset = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -offset);
}

export function weekDays(weekStartKey: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
}

export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function minDay(a: DayKey, b: DayKey): DayKey {
  return a < b ? a : b;
}
export function maxDay(a: DayKey, b: DayKey): DayKey {
  return a > b ? a : b;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Minutes east of UTC at the given instant (e.g. +60 for BST). */
export function utcOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}

// Formatting. Day keys are rendered through a UTC date with timeZone 'UTC' so
// the label always matches the key, whatever zone the device is in now.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = JSON.stringify(options);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
    fmtCache.set(k, f);
  }
  return f;
}

export function formatDayLong(key: DayKey): string {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(toUtc(key));
}
export function formatDayShort(key: DayKey): string {
  return fmt({ day: 'numeric', month: 'short' }).format(toUtc(key));
}
export function formatWeekdayShort(key: DayKey): string {
  return fmt({ weekday: 'short' }).format(toUtc(key));
}
export function weekdayInitial(key: DayKey): string {
  return fmt({ weekday: 'narrow' }).format(toUtc(key));
}
export function formatRange(from: DayKey, to: DayKey): string {
  return `${formatDayShort(from)} – ${formatDayShort(to)}`;
}

export function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

export function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
