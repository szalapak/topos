import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, calendar, change, dateKey, daysBetween, shade, summarize, typicalDay, type Answer } from "../src/stats.ts";

/** Noon on a day in November 2026, local time, plus `minutes`. */
const at = (day: number, minutes = 0) => new Date(2026, 10, day, 12, minutes).getTime();
const answer = (key: string, day: number, right = true, minutes = 0): Answer => ({ key, time: at(day, minutes), right });
/** `n` answers on a day, each to a different card. */
const busy = (day: number, n: number) => Array.from({ length: n }, (_, i) => answer(`D${day}-${i}|flag`, day, true, i));
const NOV_20 = new Date(2026, 10, 20, 18);

test("dates step across months and years", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
  assert.equal(daysBetween("2026-10-25", "2026-11-03"), 9);
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("the streak counts days in a row up to today, and the longest run", () => {
  const log = [...busy(10, 3), ...busy(11, 1), ...busy(12, 2), ...busy(15, 1), ...busy(18, 1), ...busy(19, 1), ...busy(20, 4)];
  const s = summarize(log, NOV_20);
  assert.equal(s.streak, 3);
  assert.equal(s.longestStreak, 3);
  assert.equal(s.playedToday, true);
  assert.equal(s.days.get("2026-11-20")?.answers, 4);
});

test("a streak survives a day not played yet, but not a day missed", () => {
  const log = [...busy(17, 1), ...busy(18, 1), ...busy(19, 1)];
  const s = summarize(log, NOV_20);
  assert.equal(s.playedToday, false);
  assert.equal(s.streak, 3);
  assert.equal(summarize(log, new Date(2026, 10, 21, 9)).streak, 0);
  assert.equal(summarize(log, new Date(2026, 10, 21, 9)).longestStreak, 3);
});

test("the daily average counts days off, but not days before starting or today before playing", () => {
  // Started on the 16th: 30 + 0 + 10 + 20 answers over four days, nothing yet on the 20th.
  const log = [...busy(16, 30), ...busy(18, 10), ...busy(19, 20)];
  const s = summarize(log, NOV_20);
  assert.equal(s.averagedOver, 4);
  assert.equal(s.perDay, 15);
  // A long-time player: only the last 30 days count. On 5 December, not played yet, that's 5
  // November to 4 December.
  const long = [...busy(1, 300), ...Array.from({ length: 30 }, (_, i) => answer(`L${i}|flag`, 20, true, i))];
  const later = summarize(long, new Date(2026, 11, 5, 12), 30);
  assert.equal(later.averagedOver, 30);
  assert.equal(later.perDay, 1);
});

test("remembered counts cards answered right before, coming back on a later day", () => {
  const log = [
    answer("FRA|flag", 10), // first time: not a review
    answer("FRA|flag", 10, true, 5), // same day: not a review
    answer("FRA|flag", 12), // came back, remembered
    answer("PER|flag", 10, false), // missed first time...
    answer("PER|flag", 11), // ...so this one doesn't count either
    answer("PER|flag", 14, false), // came back after a right answer, forgotten
    answer("CHL|map", 13),
    answer("CHL|map", 15), // remembered
  ];
  const s = summarize(log, NOV_20);
  assert.equal(s.reviews, 3);
  assert.equal(s.remembered, 2);
  // New cards per day: FRA and PER on the 10th, CHL on the 13th.
  assert.equal(s.days.get("2026-11-10")?.new, 2);
  assert.equal(s.days.get("2026-11-12")?.new, 0);
  assert.equal(s.days.get("2026-11-13")?.new, 1);
  // Only the last few days: just CHL's.
  assert.equal(summarize(log, NOV_20, 6).reviews, 1);
});

test("an empty log gives zeros", () => {
  const s = summarize([], NOV_20);
  assert.deepEqual([s.days.size, s.streak, s.longestStreak, s.perDay, s.averagedOver, s.reviews], [0, 0, 0, 0, 0, 0]);
});

test("the calendar ends with this week, Monday first", () => {
  const s = summarize([...busy(16, 2), ...busy(20, 5)], NOV_20);
  const weeks = calendar(s.days, "2026-11-20", 4);
  assert.equal(weeks.length, 4);
  assert.ok(weeks.every((w) => w.length === 7));
  // 20 November 2026 is a Friday: the last column runs Monday 16th to Sunday 22nd.
  const last = weeks[3];
  assert.equal(last[0].date, "2026-11-16");
  assert.equal(last[0].answers, 2);
  assert.equal(last[4].date, "2026-11-20");
  assert.equal(last[4].answers, 5);
  assert.deepEqual(last.map((d) => d.future), [false, false, false, false, false, true, true]);
  assert.equal(weeks[0][0].date, "2026-10-26");
});

test("days are shaded against the player's typical day", () => {
  assert.equal(typicalDay([{ answers: 10, new: 0 }, { answers: 0, new: 0 }, { answers: 30, new: 0 }, { answers: 20, new: 0 }]), 20);
  assert.equal(typicalDay([]), 0);
  assert.deepEqual([0, 5, 15, 20, 39, 40].map((n) => shade(n, 20)), [0, 1, 2, 3, 3, 4]);
});

test("change over the last week starts from the last count a week or more ago", () => {
  const series: [string, number][] = [
    ["2026-11-02", 10],
    ["2026-11-09", 14],
    ["2026-11-12", 20],
    ["2026-11-16", 25],
  ];
  assert.deepEqual(change(series, "2026-11-16"), { by: 11, since: "2026-11-09" });
  // Nothing a week old yet: from the first count.
  assert.deepEqual(change(series.slice(2), "2026-11-16"), { by: 5, since: "2026-11-12" });
  assert.equal(change(series.slice(3), "2026-11-16"), null);
});
