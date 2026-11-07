import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeMiss,
  formatDollars,
  formatPopulation,
  gradeAmount,
  parseNumber,
  readDollars,
  readPopulation,
} from "../src/numbers.ts";

test("population: a bare number means millions", () => {
  assert.equal(readPopulation("34"), 34e6);
  assert.equal(readPopulation("0.5"), 500_000);
  assert.equal(readPopulation("1450"), 1.45e9);
});

test("population: the other ways of writing 34 million", () => {
  for (const typed of ["34m", "34M", "34 m", "34 million", "34 Million people", "34mln", "34,000,000", "34 000 000", "34.000.000", "34000000"])
    assert.equal(readPopulation(typed), 34e6, typed);
});

test("population: a bare number too big to be millions is a head count", () => {
  assert.equal(readPopulation("38000"), 38_000);
  assert.equal(readPopulation("38,000"), 38_000);
  assert.equal(readPopulation("38k"), 38_000);
  assert.equal(readPopulation("38 thousand"), 38_000);
});

test("population: billions", () => {
  assert.equal(readPopulation("1.4bn"), 1.4e9);
  assert.equal(readPopulation("1.4 billion"), 1.4e9);
  assert.equal(readPopulation("1,4 mld"), 1.4e9);
});

test("decimal commas and points", () => {
  assert.equal(parseNumber("34,5")?.value, 34.5);
  assert.equal(parseNumber("1,4")?.value, 1.4);
  assert.equal(parseNumber("0,500")?.value, 0.5);
  assert.equal(parseNumber(".5")?.value, 0.5);
  assert.equal(parseNumber("1,234.5")?.value, 1234.5);
  assert.equal(parseNumber("1.234,5")?.value, 1234.5);
  assert.equal(parseNumber("1'234'567")?.value, 1_234_567);
});

test("dollars", () => {
  for (const typed of ["45000", "45,000", "$45,000", "45k", "45K", "$45k", "45 000", "45.000", "45 thousand", "45000 dollars", "45,000 USD"])
    assert.equal(readDollars(typed), 45_000, typed);
  assert.equal(readDollars("1.5k"), 1500);
});

test("dollars: a bare number means thousands", () => {
  assert.equal(readDollars("45"), 45_000);
  assert.equal(readDollars("45.5"), 45_500);
  assert.equal(readDollars("45,5"), 45_500);
  assert.equal(readDollars("0.25"), 250);
  assert.equal(readDollars("288"), 288_000);
  // Too big to be thousands: plain dollars.
  assert.equal(readDollars("1500"), 1500);
  assert.equal(readDollars("1,500"), 1500);
});

test("things that are not numbers", () => {
  for (const typed of ["", "  ", "abc", "million", "-5", "0", "34 apples", "34 m m", "12.5.6", "1,23,4.5", "1e6"])
    assert.equal(parseNumber(typed), null, JSON.stringify(typed));
});

test("grading by closeness", () => {
  assert.equal(gradeAmount(68e6, 68.4e6, "population"), "exact");
  assert.equal(gradeAmount(60e6, 68.4e6, "population"), "exact"); // 12% under
  assert.equal(gradeAmount(80e6, 68.4e6, "population"), "close"); // 17% over
  assert.equal(gradeAmount(55e6, 68.4e6, "population"), "close"); // 1.24 times under
  assert.equal(gradeAmount(50e6, 68.4e6, "population"), "wrong"); // 1.37 times under
  assert.equal(gradeAmount(110e6, 68.4e6, "population"), "wrong");
  assert.equal(gradeAmount(72_000, 80_000, "gdpPerCapita"), "exact");
  assert.equal(gradeAmount(90_000, 80_000, "gdpPerCapita"), "exact");
  assert.equal(gradeAmount(65_000, 80_000, "gdpPerCapita"), "close");
  assert.equal(gradeAmount(100_000, 80_000, "gdpPerCapita"), "close");
  assert.equal(gradeAmount(60_000, 80_000, "gdpPerCapita"), "wrong");
  assert.equal(gradeAmount(110_000, 80_000, "gdpPerCapita"), "wrong");
});

test("grading is the same distance either way on a log scale", () => {
  for (const [a, b] of [[114, 100], [116, 100], [125, 100], [135, 100]])
    for (const kind of ["population", "gdpPerCapita"] as const)
      assert.equal(gradeAmount(a, b, kind), gradeAmount(b, a, kind), `${a} vs ${b}, ${kind}`);
});

test("showing figures", () => {
  assert.equal(formatPopulation(68_373_000), "68.4 million");
  assert.equal(formatPopulation(5_607_000), "5.61 million");
  assert.equal(formatPopulation(142_300_000), "142 million");
  assert.equal(formatPopulation(1_406_585_000), "1.41 billion");
  assert.equal(formatPopulation(38_341), "38,300");
  assert.equal(formatPopulation(500_000), "500,000");
  assert.equal(formatDollars(13_861.97), "$13,900");
  assert.equal(formatDollars(288_001.57), "$288,000");
  assert.equal(formatDollars(234.4), "$234");
});

test("describing a miss", () => {
  assert.equal(describeMiss(60, 68.4), "12% too low");
  assert.equal(describeMiss(80, 68.4), "17% too high");
  assert.equal(describeMiss(68.4, 68.4), "spot on");
  assert.equal(describeMiss(320, 100), "3.2 times too high");
  assert.equal(describeMiss(10, 100), "10 times too low");
});
