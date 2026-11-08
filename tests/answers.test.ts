import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerSet, normalize } from "../src/answers.ts";

const countries = new AnswerSet([
  ["NER", "Niger", ["Niger"]],
  ["NGA", "Nigeria", ["Nigeria"]],
  ["IND", "India", ["India"]],
  ["NLD", "Netherlands", ["Netherlands", "Holland"]],
  ["AUT", "Austria", ["Austria"]],
  ["AUS", "Australia", ["Australia"]],
  ["KNA", "Saint Kitts and Nevis", ["Saint Kitts and Nevis"]],
]);

test("exact answers, ignoring case, accents and 'the'", () => {
  assert.deepEqual(countries.check("NLD", "the netherlands"), { result: "exact" });
  assert.deepEqual(countries.check("NLD", "Holland"), { result: "exact" });
  assert.deepEqual(countries.check("KNA", "St Kitts & Nevis"), { result: "exact" });
});

test("Niger never passes for Nigeria, nor the other way round", () => {
  assert.deepEqual(countries.check("NGA", "Niger"), { result: "wrong", matched: "Niger", matchedKey: "NER" });
  assert.deepEqual(countries.check("NER", "Nigeria"), { result: "wrong", matched: "Nigeria", matchedKey: "NGA" });
});

test("small typos pass as close, unless nearer to another answer", () => {
  assert.deepEqual(countries.check("IND", "Indai"), { result: "close" });
  assert.deepEqual(countries.check("AUS", "Australa"), { result: "close" });
  assert.deepEqual(countries.check("AUT", "Austira"), { result: "close" });
  // "Austrlia" is one slip from Australia but also one from Austria, so it is not forgiven.
  assert.equal(countries.check("AUS", "Austrlia").result, "wrong");
});

test("short names allow no typos", () => {
  assert.equal(countries.check("NER", "Nigr").result, "wrong");
});

test("normalize", () => {
  assert.equal(normalize("Côte d'Ivoire"), "cote divoire");
  assert.equal(normalize("The Gambia"), "gambia");
  assert.equal(normalize("Saint Lucia"), "st lucia");
});
