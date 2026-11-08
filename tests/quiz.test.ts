import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KnowledgeModel, SKILLS, mulberry32, sigmoid, type Skill } from "../src/knowledge.ts";
import { Quiz } from "../src/quiz.ts";

interface RawCountry {
  id: string;
  region: string;
  subregion: string;
  capitals: string[];
  population: { value: number } | null;
  gdpPerCapita: { value: number } | null;
}

const raw: RawCountry[] = JSON.parse(readFileSync(new URL("../public/data/countries.json", import.meta.url), "utf8"));
const countries = raw.map((c, rank) => ({ ...c, rank }));
const byId = new Map(countries.map((c) => [c.id, c]));
const model = new KnowledgeModel(countries);
const MAP_SKILLS: Skill[] = ["map", "flag", "capital"];

/** Roughly which questions the game asks (see `buildCandidates` in src/deck.ts). */
function available(id: string, type: string) {
  const c = byId.get(id)!;
  if (type.startsWith("capital") && !c.capitals.length) return false;
  if (type === "population" && (c.population?.value ?? 0) < 2000) return false;
  if (type === "gdpPerCapita" && !c.gdpPerCapita) return false;
  return true;
}

const skillOfType = (type: string) => SKILLS.find((s) => s.types.some((t) => t === type))!.skill;

/** Plays a whole quiz, answering with `knows`. */
function play(quiz: Quiz, knows: (id: string, skill: Skill) => boolean) {
  for (let q = quiz.next(); q; q = quiz.next()) quiz.record(q.id, q.type, knows(q.id, skillOfType(q.type)));
  return quiz;
}

const rankOf = (id: string) => byId.get(id)!.rank;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("with no answers the estimate is the typical player", () => {
  const quiz = new Quiz(model, ["map"], "short", available);
  const [map] = quiz.results();
  assert.ok(Math.abs(map.known - 100) < 15, `known ${map.known}`);
  assert.ok(map.low < map.known && map.known < map.high);
  assert.equal(map.of, countries.length);
});

test("chances fall further down the list, and right answers raise them", () => {
  const before = model.fit([]);
  assert.ok(before.chance("FRA", "map") > before.chance("BTN", "map"));
  assert.ok(before.chance("BTN", "map") > before.chance("TUV", "map"));
  const after = model.fit([
    { id: "MNG", skill: "map", right: true },
    { id: "BTN", skill: "map", right: true },
    { id: "LSO", skill: "map", right: true },
  ]);
  assert.ok(after.chance("TUV", "map") > before.chance("TUV", "map"));
  // Every skill moves a little with it, since they are correlated.
  assert.ok(after.chance("BTN", "flag") > before.chance("BTN", "flag"));
});

test("answers in one part of the world say most about that part", () => {
  // Right about less famous European countries, wrong about African ones of similar fame.
  const europe = ["SVN", "LVA", "EST", "CYP", "MKD", "ALB", "MNE", "MLT"];
  const africa = ["BFA", "NER", "TCD", "BEN", "MWI", "RWA", "GIN", "TGO"];
  const estimate = model.fit([
    ...europe.map((id) => ({ id, skill: "map" as const, right: true })),
    ...africa.map((id) => ({ id, skill: "map" as const, right: false })),
  ]);
  // Moldova and Mauritania sit close together in the fame order.
  assert.ok(Math.abs(rankOf("MDA") - rankOf("MRT")) < 25);
  assert.ok(estimate.chance("MDA", "map") > estimate.chance("MRT", "map") + 0.3);
});

test("a mix-up counts as part of a miss", () => {
  const none = model.fit([]).chance("SVK", "map");
  const half = model.fit([{ id: "SVK", skill: "map", right: false, weight: 0.5 }]).chance("SVK", "map");
  const full = model.fit([{ id: "SVK", skill: "map", right: false }]).chance("SVK", "map");
  assert.ok(full < half && half < none, `${full} < ${half} < ${none}`);
});

test("a hint of where the player lives gives their part of the world a head start", () => {
  const europe = 0;
  const local = new KnowledgeModel(countries, europe).fit([]);
  const anywhere = model.fit([]);
  assert.ok(local.chance("SVN", "map") > anywhere.chance("SVN", "map") + 0.05);
  assert.ok(Math.abs(local.chance("BFA", "map") - anywhere.chance("BFA", "map")) < 0.02);
  // Answers still win: misses on small European countries pull it back down.
  const missed = new KnowledgeModel(countries, europe).fit(
    ["LVA", "EST", "MKD", "ALB", "MNE", "MLT"].map((id) => ({ id, skill: "map" as const, right: false })),
  );
  assert.ok(missed.chance("SVN", "map") < anywhere.chance("SVN", "map"));
});

test("tapping the wrong country counts against it too, and it isn't asked later", () => {
  const quiz = new Quiz(model, ["map"], "medium", available, mulberry32(8));
  const before = quiz.chance("SVK", "map");
  quiz.record("SVN", "locate", false, "SVK");
  assert.ok(quiz.chance("SVK", "map") < before);
  assert.deepEqual(quiz.observations()[1], { id: "SVK", skill: "map", right: false, weight: 0.5 });
  play(quiz, () => true);
  assert.ok(!quiz.answers.some((a) => a.id === "SVK"));
  // Asked for the other country itself, it counts in full, not twice.
  assert.equal(quiz.results()[0].of, countries.length);
});

test("a mix-up is dropped when the answer is overruled, and numbers have none", () => {
  const quiz = new Quiz(model, ["flag", "population"], "short", available, mulberry32(9));
  quiz.record("ROU", "flag", false, "TCD");
  assert.equal(quiz.observations().length, 2);
  quiz.overruleLast();
  assert.deepEqual(quiz.observations(), [{ id: "ROU", skill: "flag", right: true }]);
  quiz.record("POL", "population", false, "UKR");
  assert.equal(quiz.observations().length, 2);
});

test("a quiz asks its length, takes turns between skills and never repeats a country", () => {
  const quiz = play(new Quiz(model, MAP_SKILLS, "medium", available, mulberry32(1)), () => true);
  assert.equal(quiz.done, 30);
  assert.equal(new Set(quiz.answers.map((a) => a.id)).size, 30);
  assert.deepEqual(
    quiz.answers.slice(0, 6).map((a) => a.skill),
    ["map", "flag", "capital", "map", "flag", "capital"],
  );
  // Maps alternate between finding and naming.
  const mapTypes = quiz.answers.filter((a) => a.skill === "map").map((a) => a.type);
  assert.deepEqual(mapTypes.slice(0, 4), ["locate", "identify", "locate", "identify"]);
});

test("right answers lead to harder questions, misses to easier ones", () => {
  const strong = play(new Quiz(model, ["map"], "medium", available, mulberry32(2)), () => true);
  const weak = play(new Quiz(model, ["map"], "medium", available, mulberry32(3)), () => false);
  const ranks = (q: Quiz) => q.answers.map((a) => rankOf(a.id));
  assert.ok(mean(ranks(strong).slice(-5)) > mean(ranks(strong).slice(0, 5)) + 30);
  assert.ok(mean(ranks(weak).slice(-5)) < mean(ranks(weak).slice(0, 5)));
  assert.ok(strong.results()[0].known > 170, `strong ${strong.results()[0].known}`);
  assert.ok(weak.results()[0].known < 20, `weak ${weak.results()[0].known}`);
});

test("overruling the last answer counts it as right", () => {
  const quiz = new Quiz(model, ["map"], "short", available, mulberry32(4));
  const q = quiz.next()!;
  quiz.record(q.id, q.type, false);
  const before = quiz.results()[0].known;
  quiz.overruleLast();
  assert.equal(quiz.answers[0].right, true);
  assert.equal(quiz.chance(q.id, "map"), 1);
  assert.ok(quiz.results()[0].known > before);
});

test("narrowing it down asks more questions and narrows the range", () => {
  const knows = (id: string) => rankOf(id) < 90;
  const quiz = play(new Quiz(model, ["map", "flag"], "short", available, mulberry32(5)), knows);
  const width = (q: Quiz) => mean(q.results().map((r) => r.high - r.low));
  const before = width(quiz);
  quiz.extend(10);
  assert.equal(quiz.total, 20);
  play(quiz, knows);
  assert.equal(quiz.done, 20);
  assert.ok(width(quiz) < before, `${width(quiz)} vs ${before}`);
});

test("the edge: countries probably known, and ones just out of reach", () => {
  const knows = (id: string) => rankOf(id) < 90;
  const quiz = play(new Quiz(model, ["map"], "medium", available, mulberry32(10)), knows);
  const { inside, outside } = quiz.edge("map");
  assert.equal(inside.length, 3);
  assert.equal(outside.length, 3);
  const asked = new Set(quiz.answers.map((a) => a.id));
  for (const id of [...inside, ...outside]) assert.ok(!asked.has(id), `${id} was asked`);
  for (const id of inside) assert.ok(quiz.chance(id, "map") >= 0.7, id);
  for (const id of outside) assert.ok(quiz.chance(id, "map") <= 0.45, id);
  // Near the real edge (rank 90) rather than far from it.
  assert.ok(mean(inside.map(rankOf)) > 40 && mean(inside.map(rankOf)) < 110, `inside ${inside.map(rankOf)}`);
  assert.ok(mean(outside.map(rankOf)) > 70 && mean(outside.map(rankOf)) < 170, `outside ${outside.map(rankOf)}`);
  // From different parts of the world.
  const area = (id: string) => model.item(id, "map")!.a;
  assert.equal(new Set(inside.map(area)).size, 3);
  assert.equal(new Set(outside.map(area)).size, 3);
});

test("the edge for someone who knows everything has nothing out of reach nearby", () => {
  const quiz = play(new Quiz(model, ["flag"], "detailed", available, mulberry32(11)), () => true);
  const { outside } = quiz.edge("flag");
  assert.ok(outside.length < 2, `outside ${outside}`);
});

test("number questions only ask countries the game asks about", () => {
  const quiz = play(new Quiz(model, ["population", "gdp"], "short", available, mulberry32(6)), () => true);
  for (const a of quiz.answers) assert.ok(available(a.id, a.type), `${a.id} ${a.type}`);
  const results = quiz.results();
  assert.equal(results.find((r) => r.skill === "population")!.of, countries.filter((c) => available(c.id, "population")).length);
});

test("simulated players: the likely range usually holds the true count", () => {
  // Players whose knowledge is messier than the model assumes: each country's chance strays
  // from the fame order by a random amount.
  const random = mulberry32(7);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  let inside = 0;
  let total = 0;
  const errors: number[] = [];
  for (let n = 0; n < 30; n++) {
    const level = 40 + random() * 150;
    const knows = new Map(countries.map((c) => [c.id, random() < sigmoid((level - c.rank) / 18 + gaussian())]));
    const quiz = play(new Quiz(model, ["map"], "medium", available, random), (id) => knows.get(id)!);
    const [map] = quiz.results();
    const truth = [...knows.values()].filter(Boolean).length;
    errors.push(Math.abs(map.known - truth));
    if (truth >= Math.round(map.low) && truth <= Math.round(map.high)) inside++;
    total++;
  }
  assert.ok(inside / total >= 0.6, `range held the truth ${inside} of ${total} times`);
  assert.ok(mean(errors) < 20, `mean error ${mean(errors)}`);
});
