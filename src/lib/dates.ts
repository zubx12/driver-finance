/**
 * Calendar dates for a Saudi business, as 'YYYY-MM-DD' strings.
 *
 * Never build date ranges with toISOString(): it converts to UTC, so in
 * Riyadh (UTC+3) local midnight becomes the previous day and month ranges
 * shift by a day (e.g. "August" became 31 Jul - 30 Aug). All arithmetic here
 * is done on calendar dates, independent of the device's time zone. The
 * database uses the same day boundary (app_today() in Asia/Riyadh).
 */

export const APP_TIME_ZONE = 'Asia/Riyadh';

export interface DateRange {
  start: string; // inclusive
  end: string;   // inclusive
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateString = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parts(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Today's date in Riyadh. */
export function riyadhToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE });
}

/** Calendar arithmetic: date + days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toDateString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** First and last day of a month (month is 1-12). */
export function monthRange(year: number, month: number): DateRange {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: toDateString(year, month, 1), end: toDateString(year, month, lastDay) };
}

/** The calendar month containing a date. */
export function monthOf(date: string): DateRange {
  const [y, m] = parts(date);
  return monthRange(y, m);
}

/** The calendar month before the one containing a date. */
export function previousMonth(date: string): DateRange {
  const [y, m] = parts(date);
  return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** 'August 2026' -> that month's range; null if not a month label. */
export function parseMonthLabel(label: string): DateRange | null {
  const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(label);
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === m[1].toLowerCase()) + 1;
  return month ? monthRange(Number(m[2]), month) : null;
}

/** '2026-08-14' -> 'August 2026'. */
export function monthLabel(date: string): string {
  const [y, m] = parts(date);
  return `${MONTHS[m - 1]} ${y}`;
}
