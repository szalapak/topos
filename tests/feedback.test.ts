import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize } from "../src/answers.ts";
import { buildWorld, nearness } from "../src/data.ts";
import {
  amountHeadline,
  classify,
  identicalFlagFeedback,
  rightHeadline,
  WORDINGS,
  wrongFeedback,
  type RightAnswer,
  type WrongAnswer,
} from "../src/feedback.ts";
import { capitalTrap, continentOf, identicalFlags, LISTS, lookalikeFlags, nameTwins } from "../src/mixups.ts";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), "utf8"));
const world = buildWorld(read("world.json"), read("countries.json"));
const country = (id: string) => world.byId.get(id)!;

test("the mix-up lists only name countries in the game, and each pair once", () => {
  const lists = [["NAME_TWINS", LISTS.NAME_TWINS], ["FLAG_LOOKALIKES", LISTS.FLAG_LOOKALIKES], ["IDENTICAL_FLAGS", LISTS.IDENTICAL_FLAGS]] as const;
  for (const [name, pairs] of lists) {
    const seen = new Set<string>();
    for (const [a, b] of pairs) {
      assert.ok(world.byId.has(a) && world.byId.has(b), `${name}: ${a} or ${b} is not a country`);
      assert.notEqual(a, b);
      const key = [a, b].sort().join("|");
      assert.ok(!seen.has(key), `${name}: ${key} twice`);
      seen.add(key);
    }
  }
  for (const t of LISTS.CAPITAL_TRAPS) assert.ok(world.byId.has(t.country), `${t.country} is not a country`);
  for (const id of [...LISTS.TRANSCONTINENTAL, ...LISTS.TRICKY_CAPITALS, ...LISTS.TRICKY_NAMES])
    assert.ok(world.byId.has(id), `${id} is not a country`);
  // Near-identical flags are look-alikes too, so a miss between them still shows both.
  for (const [a, b] of LISTS.IDENTICAL_FLAGS) assert.ok(lookalikeFlags(a, b), `${a} ${b}`);
});

test("a capital trap is never an accepted capital, or it could never come up", () => {
  const accepted = new Set(world.countries.flatMap((c) => [...c.capitals, ...c.capitalAliases].map(normalize)));
  for (const t of LISTS.CAPITAL_TRAPS) for (const name of t.names) assert.ok(!accepted.has(normalize(name)), name);
});

test("capital traps are found for their own country, typos and all", () => {
  assert.equal(capitalTrap("AUS", "Sydney")?.city, "Sydney");
  assert.equal(capitalTrap("AUS", "sidney")?.city, "Sydney");
  assert.equal(capitalTrap("BRA", "sao paulo")?.city, "São Paulo");
  assert.equal(capitalTrap("RUS", "St Petersburg")?.city, "Saint Petersburg");
  assert.equal(capitalTrap("TUR", "istambul")?.city, "Istanbul");
  assert.equal(capitalTrap("NZL", "Sydney"), undefined);
  assert.equal(capitalTrap("AUS", "Perth"), undefined);
});

test("pairs can be looked up either way round", () => {
  assert.ok(nameTwins("SVN", "SVK") && nameTwins("SVK", "SVN"));
  assert.ok(lookalikeFlags("ROU", "TCD") && lookalikeFlags("TCD", "ROU"));
  assert.ok(identicalFlags("ROU", "TCD") && identicalFlags("MCO", "IDN"));
  assert.ok(!identicalFlags("IRL", "CIV"));
  assert.ok(!nameTwins("FRA", "DEU"));
});

test("neighbours by land and across the water", () => {
  const near = (a: string, b: string) => nearness(world, a, b);
  for (const [a, b] of [["FRA", "ESP"], ["SVN", "HRV"], ["USA", "CAN"], ["COD", "COG"]]) assert.equal(near(a, b), "border", `${a} ${b}`);
  for (const [a, b] of [["GBR", "FRA"], ["JPN", "KOR"], ["CUB", "HTI"], ["ESP", "MAR"], ["LKA", "IND"], ["EST", "FIN"]])
    assert.equal(near(a, b), "sea", `${a} ${b}`);
  // Too far apart, or with another country in between.
  for (const [a, b] of [["AUS", "NZL"], ["MDG", "MOZ"], ["SVN", "SVK"], ["CZE", "HUN"], ["NLD", "LUX"], ["FRA", "JPN"]])
    assert.equal(near(a, b), undefined, `${a} ${b}`);
  // Only overseas territories meet: French Guiana, Mayotte, Martinique.
  for (const [a, b] of [["FRA", "BRA"], ["FRA", "SUR"], ["FRA", "COM"], ["FRA", "LCA"]]) assert.equal(near(a, b), undefined, `${a} ${b}`);
  // Big countries are still next door to all their neighbours.
  for (const [a, b] of [["RUS", "POL"], ["RUS", "PRK"], ["RUS", "NOR"]]) assert.equal(near(a, b), "border", `${a} ${b}`);
});

const ask = (type: WrongAnswer["type"], id: string, more: Partial<WrongAnswer> = {}): WrongAnswer => ({
  type,
  country: country(id),
  ...more,
});
const other = country;

test("wrong answers are sorted by how they went wrong", () => {
  assert.equal(classify(ask("locate", "SVN", { skipped: true })), "skipped");
  assert.equal(classify(ask("locate", "SVN", { other: other("HRV"), near: "border" })), "border");
  assert.equal(classify(ask("locate", "JPN", { other: other("KOR"), near: "sea" })), "sea");
  assert.equal(classify(ask("locate", "SVN", { other: other("SVK") })), "twin");
  assert.equal(classify(ask("locate", "SVN", { other: other("PRT") })), "other");
  // Another continent, on a map question...
  assert.equal(classify(ask("locate", "SVN", { other: other("BRA") })), "far");
  assert.equal(classify(ask("identify", "JPN", { other: other("CAN"), typed: "Canada" })), "far");
  // ...but not for countries in two continents, nor on flag and capital questions.
  assert.equal(classify(ask("locate", "JPN", { other: other("TUR") })), "other");
  assert.equal(classify(ask("flag", "JPN", { other: other("CAN"), typed: "Canada" })), "other");
  assert.equal(classify(ask("capital", "JPN", { other: other("CAN"), typed: "Ottawa" })), "other");
  // On a flag question a look-alike flag beats a look-alike name.
  assert.equal(classify(ask("flag", "SVN", { other: other("SVK"), typed: "Slovakia" })), "lookalike");
  assert.equal(classify(ask("identify", "SVN", { other: other("SVK"), typed: "Slovakia" })), "twin");
  // Congo is both next door and a twin; the name is the likelier cause.
  assert.equal(classify(ask("identify", "COD", { other: other("COG"), near: "border" })), "twin");
  assert.equal(classify(ask("identify", "FRA", { typed: "Paris", typedCapital: true })), "ownCapital");
  assert.equal(classify(ask("capital", "AUS", { typed: "Sydney" })), "trap");
  assert.equal(classify(ask("capital", "AUS", { typed: "Wombat" })), "unknown");
  // A tap with no country behind it (open ocean is never an answer, but disputed areas are).
  assert.equal(classify(ask("locate", "IND", { other: { name: "Siachen Glacier" } })), "other");
});

test("feedback names what went wrong and the right answer", () => {
  for (let i = 0; i < 10; i++) {
    const tap = wrongFeedback(ask("capitalLocate", "SVN", { other: other("HRV"), near: "border" }));
    assert.ok(tap.detail.includes("Croatia") && tap.detail.includes("Ljubljana is in Slovenia, shown in orange."), tap.detail);
    const typed = wrongFeedback(ask("capital", "SVN", { typed: "zagreb", other: other("HRV"), near: "border" }));
    assert.ok(typed.detail.includes("Zagreb") && typed.detail.endsWith("<b>Ljubljana</b>."), typed.detail);
    const trap = wrongFeedback(ask("capital", "AUS", { typed: "sydney" }));
    assert.ok(
      ["The answer is <b>Canberra</b>.", "<b>Canberra</b> would like a word."]
        .map((end) => `Sydney is the biggest city, but not the capital. ${end}`)
        .includes(trap.detail),
      trap.detail,
    );
    // Skipping never says the answer wasn't recognised.
    assert.equal(wrongFeedback(ask("identify", "FRA", { skipped: true })).detail, "This is <b>France</b>.");
    const same = identicalFlagFeedback(country("NLD"));
    assert.ok(same.detail.includes("the <b>Netherlands</b>, but") && /spot the difference/i.test(same.detail), same.detail);
    const several = wrongFeedback(ask("capitalLocate", "ZAF", { skipped: true }));
    assert.equal(several.detail, "Pretoria, Bloemfontein and Cape Town are in South Africa, shown in orange.");
    const flag = wrongFeedback(ask("flag", "NLD", { skipped: true }));
    assert.equal(flag.detail, "This is the flag of the <b>Netherlands</b>.");
  }
});

test("skipping is worded for the question: only finding a country says \"Here it is\"", () => {
  for (let i = 0; i < 10; i++) {
    assert.ok(WORDINGS.SKIPPED.locate.includes(wrongFeedback(ask("locate", "FRA", { skipped: true })).headline));
    for (const type of ["capitalLocate", "flag", "identify", "capital"] as const) {
      assert.notEqual(wrongFeedback(ask(type, "FRA", { skipped: true })).headline, "Here it is", type);
    }
  }
});

test("every wording reads properly: no dashes, nothing missing, the answer included", () => {
  const parts = {
    other: "Croatia",
    Other: "Croatia",
    answer: "<b>ANSWER</b>.",
    Answer: "<b>ANSWER</b>",
    where: "ANSWER is in orange.",
    typed: "Zagreb",
    city: "Sydney",
    note: "is the biggest city",
  };
  const headlines = [
    ...Object.values(WORDINGS.HEADLINES),
    ...Object.values(WORDINGS.SKIPPED),
    ...Object.values(WORDINGS.AMOUNT_HEADLINES),
    WORDINGS.IDENTICAL_HEADLINES,
  ].flat();
  for (const h of headlines) assert.match(h, /^[A-Z][a-z ,'-]+$/, h);
  for (const [mode, byMiss] of Object.entries(WORDINGS.DETAILS)) {
    for (const [miss, wordings] of Object.entries(byMiss)) {
      for (const w of wordings!) {
        const text = w(parts);
        assert.ok(text.includes("ANSWER"), `${mode} ${miss}: ${text}`);
        assert.ok(text.endsWith("."), `${mode} ${miss}: ${text}`);
        assert.doesNotMatch(text, /[–—]|undefined|\s\s|\.\./, `${mode} ${miss}: ${text}`);
      }
    }
  }
  for (const w of WORDINGS.IDENTICAL_DETAILS) assert.doesNotMatch(w("<b>ANSWER</b>"), /[–—]|\s\s/);
  for (const t of LISTS.CAPITAL_TRAPS) assert.doesNotMatch(t.note, /[–—]/);
});

test("continents split the Americas, and leave out countries in two", () => {
  assert.equal(continentOf(country("BRA")), "South America");
  assert.equal(continentOf(country("CUB")), "North America");
  assert.equal(continentOf(country("FRA")), "Europe");
  assert.equal(continentOf(country("RUS")), undefined);
});

test("number headlines follow how far off the guess was", () => {
  const { near, high, low, wrong } = WORDINGS.AMOUNT_HEADLINES;
  assert.ok(WORDINGS.SKIPPED.population.includes(amountHeadline(undefined, 100, "population")));
  assert.ok(near.includes(amountHeadline(140, 100, "population")));
  assert.ok(near.includes(amountHeadline(70, 100, "population")));
  assert.ok(wrong.includes(amountHeadline(250, 100, "population")));
  assert.ok(high.includes(amountHeadline(1000, 100, "gdpPerCapita")));
  assert.ok(low.includes(amountHeadline(10, 100, "gdpPerCapita")));
});

test("right answers get a headline for what made them notable, rarest first", () => {
  const { RIGHT_HEADLINES: R } = WORDINGS;
  const right = (id: string, more: Partial<RightAnswer> = {}, random = () => 0.9) =>
    rightHeadline({ type: "locate", country: country(id), streak: 1, ...more }, random);
  // Mexico is neither famous nor obscure, so it gets a plain one.
  assert.ok(R.correct.includes(right("MEX")));
  assert.ok(R.overruled.includes(right("MEX", { overruled: true, streak: 3 })));
  assert.ok(R.three.includes(right("MEX", { streak: 3, redeemed: true })));
  assert.ok(R.five.includes(right("MEX", { streak: 5 })));
  assert.equal(right("MEX", { streak: 10 }), "Ten in a row. Who are you?");
  assert.ok([...R.more, "15 in a row"].includes(right("MEX", { streak: 15 })));
  assert.ok(R.correct.includes(right("MEX", { streak: 12 })));
  assert.ok(R.redeemed.includes(right("MEX", { redeemed: true, whisker: true })));
  assert.ok(R.whisker.includes(right("MEX", { whisker: true })));
  // Spelling counts only for the hard ones, typed in full.
  assert.ok(R.spelling.includes(right("BFA", { type: "capital", typedInFull: true })));
  assert.ok(R.spelling.includes(right("KGZ", { type: "identify", typedInFull: true })));
  assert.ok(!R.spelling.includes(right("MEX", { type: "capital", typedInFull: true })));
  assert.ok(!R.spelling.includes(right("BFA", { type: "capital" })));
  assert.ok(R.bangOn.includes(right("MEX", { type: "population", ratio: 1.02 })));
  assert.ok(R.correct.includes(right("MEX", { type: "population", ratio: 1.1 })));
  // Obscure, new and famous cards get theirs only some of the time.
  assert.ok(R.obscure.includes(right("TUV", {}, () => 0)));
  assert.ok(R.correct.includes(right("TUV", {}, () => 0.9)));
  assert.ok(R.isNew.includes(right("MEX", { isNew: true }, () => 0)));
  assert.ok(R.famous.includes(right("CHN", {}, () => 0)));
  assert.ok(!R.famous.includes("Well, yes"));
});

test("right-answer headlines read properly", () => {
  for (const h of [...Object.values(WORDINGS.RIGHT_HEADLINES).flat(), ...WORDINGS.BALLPARK]) {
    assert.match(h, /^[A-Z][A-Za-z ,'.?!-]+$/, h);
    assert.doesNotMatch(h, /[–—]|\s\s/, h);
  }
});
