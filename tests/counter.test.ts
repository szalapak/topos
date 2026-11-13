import { test } from "node:test";
import assert from "node:assert/strict";
import { quizEvents } from "../src/counter.ts";

test("quiz results are counted in tens, by skill, length and first or retake", () => {
  const events = quizEvents(
    [
      { skill: "map", known: 124.6 },
      { skill: "flag", known: 9.4 },
      { skill: "capital", known: 119.6 },
    ],
    "medium",
    true,
  );
  assert.deepEqual(
    events.map((e) => e.path),
    ["quiz/map/medium/first/120-129", "quiz/flag/medium/first/0-9", "quiz/capital/medium/first/120-129"],
  );
  assert.equal(quizEvents([{ skill: "map", known: 197 }], "short", false)[0].path, "quiz/map/short/retake/190-199");
  for (const e of events) assert.doesNotMatch(e.title, /[–—]/);
});
