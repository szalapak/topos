/**
 * Numbers for the "How it's going" screen, worked out from the answer log: answers per day,
 * streaks, the daily average, and how often cards are remembered when they come back. Dates are
 * local calendar dates ("2026-11-08"), so a day ends at the player's own midnight.
 *
 * Nothing here touches the deck or the page, so it can be tested in Node.
 */

export interface Answer {
  key: string;
  time: number;
  right: boolean;
}

export interface Day {
  answers: number;
  /** Answers to cards asked for the first time. */
  new: number;
}

export interface Summary {
  /** Days with at least one answer. */
  days: Map<string, Day>;
  /** Days in a row with answers, up to today, or up to yesterday while today has none yet. */
  streak: number;
  longestStreak: number;
  playedToday: boolean;
  /** Answers a day over the last `window` days, days off included... */
  perDay: number;
  /** ...over this many days: fewer for a player who started more recently. */
  averagedOver: number;
  /**
   * Answers to cards last answered right on an earlier day, in the last `window` days, and how
   * many of those were right: how often a card is remembered when it comes back.
   */
  reviews: number;
  remembered: number;
}

/** The local calendar date of a time, as "2026-11-08". */
export function dateKey(time: number | Date): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The date `n` days after the given one (before it, for a negative `n`). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** Whole days from one date to a later one. */
export function daysBetween(from: string, to: string): number {
  const utc = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Everything the stats screen shows from the log, as of `now`, over the last `window` days. */
export function summarize(answers: readonly Answer[], now: Date = new Date(), window = 30): Summary {
  const today = dateKey(now);
  const from = addDays(today, -(window - 1));
  const days = new Map<string, Day>();
  const last = new Map<string, { right: boolean; date: string }>();
  let reviews = 0;
  let remembered = 0;
  for (const a of answers) {
    const date = dateKey(a.time);
    const day = days.get(date) ?? { answers: 0, new: 0 };
    day.answers++;
    const before = last.get(a.key);
    if (!before) day.new++;
    else if (before.right && before.date < date && date >= from) {
      reviews++;
      if (a.right) remembered++;
    }
    days.set(date, day);
    last.set(a.key, { right: a.right, date });
  }

  const playedToday = days.has(today);
  // A day not played yet doesn't break the streak or drag the average down until it is over.
  const lastDay = playedToday ? today : addDays(today, -1);
  let streak = 0;
  for (let d = lastDay; days.has(d); d = addDays(d, -1)) streak++;

  const dates = [...days.keys()].sort();
  let longestStreak = 0;
  let run = 0;
  dates.forEach((d, i) => {
    run = i > 0 && addDays(dates[i - 1], 1) === d ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  });

  let total = 0;
  let averagedOver = 0;
  const first = dates[0];
  for (let i = 0; first && i < window; i++) {
    const d = addDays(lastDay, -i);
    if (d < first) break;
    total += days.get(d)?.answers ?? 0;
    averagedOver++;
  }

  return {
    days,
    streak,
    longestStreak,
    playedToday,
    perDay: averagedOver ? total / averagedOver : 0,
    averagedOver,
    reviews,
    remembered,
  };
}

export interface CalendarDay extends Day {
  date: string;
  /** Later this week. */
  future: boolean;
}

/** A calendar of `weeks` columns of seven days each, Monday first, the last column holding today. */
export function calendar(days: ReadonlyMap<string, Day>, today: string, weeks: number): CalendarDay[][] {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const start = addDays(today, -weekday - 7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, 7 * w + i);
      const day = days.get(date);
      return { date, answers: day?.answers ?? 0, new: day?.new ?? 0, future: date > today };
    }),
  );
}

/**
 * How strongly to shade a day in the calendar, from 0 (no answers) to 4, against the player's
 * own typical day (see `typicalDay`): a typical day is a 3, twice as many a 4.
 */
export function shade(answers: number, typical: number): 0 | 1 | 2 | 3 | 4 {
  if (answers <= 0) return 0;
  if (answers < typical / 2) return 1;
  if (answers < typical) return 2;
  if (answers < typical * 2) return 3;
  return 4;
}

/** The median number of answers on the days played. */
export function typicalDay(days: Iterable<Day>): number {
  const counts = [...days].map((d) => d.answers).filter((n) => n > 0).sort((a, b) => a - b);
  if (!counts.length) return 0;
  const mid = counts.length / 2;
  return counts.length % 2 ? counts[Math.floor(mid)] : (counts[mid - 1] + counts[mid]) / 2;
}

/**
 * How much a count recorded day by day has changed: from the last value recorded `days` or
 * more days before `today` (or the first one, if none is that old) to the latest. Null with
 * fewer than two values.
 */
export function change(
  series: readonly (readonly [date: string, value: number])[],
  today: string,
  days = 7,
): { by: number; since: string } | null {
  if (series.length < 2) return null;
  const cutoff = addDays(today, -days);
  let base = series[0];
  for (const p of series) if (p[0] <= cutoff) base = p;
  const latest = series[series.length - 1];
  return base === latest ? null : { by: latest[1] - base[1], since: base[0] };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
