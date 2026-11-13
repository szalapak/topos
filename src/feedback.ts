/**
 * The wording after a wrong answer. Messages are picked by question type and by how the
 * answer went wrong, so a near miss (the country next door, a look-alike flag, the biggest
 * city instead of the capital) reads differently from a wild guess.
 */

import type { QuestionType } from "./deck";
import { capitalTrap, continentOf, lookalikeFlags, nameTwins } from "./mixups.ts";
import { esc, listing, oneOf, sentence, stop, the } from "./text.ts";

/** How a wrong answer went wrong. */
export type Miss =
  /** "I don't know". */
  | "skipped"
  /** A flag much like this one. */
  | "lookalike"
  /** A country with an easily swapped name (Slovakia for Slovenia). */
  | "twin"
  /** The country next door... */
  | "border"
  /** ...or just across the water. */
  | "sea"
  /** The country's capital, when the country itself was asked for. */
  | "ownCapital"
  /** A city often taken for the capital (Sydney for Canberra). */
  | "trap"
  /** A country on another continent, on a map question. */
  | "far"
  /** Some other country, or another country's capital. */
  | "other"
  /** Nothing the game recognises. */
  | "unknown";

/** A country as far as the wording needs it. Region and subregion decide its continent. */
interface Place {
  id?: string;
  name: string;
  region?: string;
  subregion?: string;
}

export interface WrongAnswer {
  type: QuestionType;
  /** The country asked about. */
  country: Place & { id: string; capitals: string[] };
  skipped?: boolean;
  /** What was typed, as typed. */
  typed?: string;
  /** The country tapped or named instead; for a capital question, the one whose capital was typed. */
  other?: Place;
  /** How close `other` is to the asked country, from `nearness` in `src/data.ts`. */
  near?: "border" | "sea";
  /** Whether what was typed is the asked country's capital, on a question asking for the country. */
  typedCapital?: boolean;
}

export function classify(a: WrongAnswer): Miss {
  if (a.skipped) return "skipped";
  const other = a.other?.id;
  if (other && a.type === "flag" && lookalikeFlags(a.country.id, other)) return "lookalike";
  if (other && nameTwins(a.country.id, other)) return "twin";
  if (other && a.near) return a.near;
  if (a.typedCapital && (a.type === "identify" || a.type === "flag")) return "ownCapital";
  if (a.type === "capital" && !a.other && a.typed && capitalTrap(a.country.id, a.typed)) return "trap";
  if (modeOf(a.type) === "tap" || a.type === "identify") {
    const mine = continent(a.country);
    const theirs = a.other && continent(a.other);
    if (mine && theirs && mine !== theirs) return "far";
  }
  return a.other ? "other" : "unknown";
}

const continent = (p: Place) =>
  p.id && p.region !== undefined ? continentOf({ id: p.id, region: p.region, subregion: p.subregion ?? "" }) : undefined;

/** The pieces a message is made of, already escaped for HTML. */
interface Parts {
  /** The other country in running text ("the Netherlands")... */
  other: string;
  /** ...and at the start of a sentence. */
  Other: string;
  /** The right answer in bold, with its full stop... */
  answer: string;
  /** ...and in bold alone, to start a sentence with. */
  Answer: string;
  /** Where the right answer is on the globe: "Slovenia is in orange." */
  where: string;
  /** What was typed, starting with a capital letter. */
  typed: string;
  /** For a capital trap: the city and what makes it a fair guess. */
  city: string;
  note: string;
}

type Mode = "tap" | "identify" | "flag" | "capital";
type Wording = (p: Parts) => string;

function modeOf(type: QuestionType): Mode {
  if (type === "locate" || type === "capitalLocate") return "tap";
  return type === "flag" ? "flag" : type === "capital" ? "capital" : "identify";
}

/** Plain "wrong", for when nothing better fits. "Not quite" is funniest when it's miles out. */
const WRONG = [
  "Nope", "Afraid not", "Alas", "No such luck", "Sadly not", "Not quite", "Bold choice", "Interesting theory",
  "Respectfully, no", "Points for confidence",
];
const NEAR = ["So close", "Nearly", "Not quite", "Just missed", "Ooh, warm"];

/**
 * After "I don't know", by question type: "Here it is" answers "Where is France?", but not
 * "Which country has this flag?".
 */
const SKIPPED: Record<QuestionType, string[]> = {
  locate: ["Here it is", "Right here", "Allow me"],
  capitalLocate: ["It's this one", "This one", "Allow me"],
  identify: ["Now you know", "Allow me", "Let me introduce you"],
  flag: ["Now you know", "Allow me", "It's this one"],
  capital: ["Now you know", "Allow me"],
  population: ["Now you know", "Allow me"],
  gdpPerCapita: ["Now you know", "Allow me"],
};

const HEADLINES: Record<Exclude<Miss, "skipped">, string[]> = {
  lookalike: ["So close", "Nearly", "Not quite", "Spot the difference"],
  twin: ["Easy mix-up", "Classic mix-up", "The other one", "Wrong twin"],
  border: NEAR,
  sea: NEAR,
  ownCapital: ["Half right", "Right answer, wrong question"],
  trap: ["Not quite", "Understandable", "A fair guess", "Classic"],
  // The details hand out the points for confidence here.
  far: WRONG.filter((h) => h !== "Points for confidence"),
  other: WRONG,
  unknown: WRONG,
};

/** Details by question type and by how the answer went wrong; `unknown` is the fallback. */
const DETAILS: Record<Mode, Partial<Record<Miss, Wording[]>> & { skipped: Wording[]; unknown: Wording[] }> = {
  // Find the country, or the country with this capital, on the globe.
  tap: {
    border: [
      (p) => `That's ${p.other}, right next door. ${p.where}`,
      (p) => `Off by one border: that's ${p.other}. ${p.where}`,
      (p) => `That's ${p.other}, on the wrong side of the border. ${p.where}`,
      (p) => `That's ${p.other}. Close enough to wave at. ${p.where}`,
    ],
    sea: [
      (p) => `That's ${p.other}, just across the water. ${p.where}`,
      (p) => `That's ${p.other}: right waters, wrong shore. ${p.where}`,
      (p) => `That's ${p.other}, a short hop over the sea. ${p.where}`,
      (p) => `That's ${p.other}. Swimmable, for some. ${p.where}`,
    ],
    twin: [
      (p) => `That's ${p.other}. Blame whoever named them. ${p.where}`,
      (p) => `Wrong one of the pair: that's ${p.other}. ${p.where}`,
      (p) => `That's ${p.other}, which only sounds like the answer. ${p.where}`,
    ],
    far: [
      (p) => `That's ${p.other}. Wrong continent, but full marks for confidence. ${p.where}`,
      (p) => `That's ${p.other}, which is on a different continent entirely. ${p.where}`,
    ],
    other: [
      (p) => `That's ${p.other}. ${p.where}`,
      (p) => `That's ${p.other}: right planet, wrong country. ${p.where}`,
      (p) => `${p.Other}, as it happens. ${p.where}`,
    ],
    skipped: [(p) => p.where],
    unknown: [(p) => p.where],
  },
  // Name the highlighted country.
  identify: {
    border: [
      (p) => `${p.Other} is next door. This is ${p.answer}`,
      (p) => `Right neighbourhood, wrong house: ${p.other} is next door. This is ${p.answer}`,
      (p) => `Off by one border. This is ${p.answer}`,
    ],
    sea: [
      (p) => `${p.Other} is just across the water. This is ${p.answer}`,
      (p) => `Right waters, wrong shore: ${p.other} is across the sea. This is ${p.answer}`,
    ],
    twin: [
      (p) => `Wrong one of the pair. This is ${p.answer}`,
      (p) => `Blame whoever named them. This is ${p.answer}`,
      (p) => `${p.Other} only sounds like it. This is ${p.answer}`,
    ],
    ownCapital: [
      (p) => `That's its capital. The country is ${p.answer}`,
      (p) => `Right place, but that's the capital. The country is ${p.answer}`,
    ],
    far: [
      (p) => `${p.Other} is on another continent entirely. This is ${p.answer}`,
      (p) => `Wrong continent, but full marks for confidence. This is ${p.answer}`,
    ],
    other: [
      (p) => `A real country, just not this one. This is ${p.answer}`,
      (p) => `To be fair, ${p.other} does exist. This is ${p.answer}`,
      (p) => `${p.Other} is elsewhere. This is ${p.answer}`,
      (p) => `${p.Other} would be flattered. This is ${p.answer}`,
    ],
    skipped: [(p) => `This is ${p.answer}`],
    unknown: [(p) => `This is ${p.answer}`, (p) => `Not one we recognise. This is ${p.answer}`],
  },
  // Name the country from its flag.
  flag: {
    lookalike: [
      (p) => `Fair guess: ${p.other} has a similar flag. This one is ${p.answer}`,
      (p) => `The flag of ${p.other} is a close cousin. This one is ${p.answer}`,
      (p) => `Easily done: it looks a lot like the flag of ${p.other}. This one is ${p.answer}`,
    ],
    border: [
      (p) => `Right neighbourhood: ${p.other} is next door. This is the flag of ${p.answer}`,
      (p) => `${p.Other} is next door, so not far off. This is the flag of ${p.answer}`,
    ],
    sea: [
      (p) => `${p.Other} is just across the water. This is the flag of ${p.answer}`,
      (p) => `Right waters, wrong shore. This is the flag of ${p.answer}`,
    ],
    twin: [
      (p) => `Close, name-wise. This is the flag of ${p.answer}`,
      (p) => `Wrong one of the pair. This is the flag of ${p.answer}`,
    ],
    ownCapital: [(p) => `That's its capital. This is the flag of ${p.answer}`],
    other: [
      (p) => `A real country, just not this flag. This one is ${p.answer}`,
      (p) => `To be fair, ${p.other} does have a flag. This one is ${p.answer}`,
      (p) => `Not the flag of ${p.other}. This one is ${p.answer}`,
      (p) => `${p.Other} would be flattered. This one is ${p.answer}`,
    ],
    skipped: [(p) => `This is the flag of ${p.answer}`],
    unknown: [(p) => `This is the flag of ${p.answer}`, (p) => `Not one we recognise. This is the flag of ${p.answer}`],
  },
  // Type the capital.
  capital: {
    border: [
      (p) => `${p.typed} is just over the border, in ${p.other}. The answer is ${p.answer}`,
      (p) => `Right neighbourhood: ${p.typed} is the capital of ${p.other}, next door. The answer is ${p.answer}`,
    ],
    sea: [
      (p) => `${p.typed} is just across the water, in ${p.other}. The answer is ${p.answer}`,
      (p) => `Right waters, wrong shore: ${p.typed} is the capital of ${p.other}. The answer is ${p.answer}`,
    ],
    twin: [
      (p) => `Wrong one of the pair: ${p.typed} is the capital of ${p.other}. The answer is ${p.answer}`,
      (p) => `${p.typed} is in ${p.other}. Blame whoever named them. The answer is ${p.answer}`,
    ],
    trap: [
      (p) => `${p.city} ${p.note}. The answer is ${p.answer}`,
      (p) => `${p.city} ${p.note}. ${p.Answer} would like a word.`,
    ],
    other: [
      (p) => `${p.typed} is the capital of ${p.other}. The answer is ${p.answer}`,
      (p) => `Good capital, wrong country. ${p.typed} belongs to ${p.other}; the answer is ${p.answer}`,
      (p) => `${p.Other} would agree with you. The answer is ${p.answer}`,
      (p) => `Right job, wrong country: ${p.typed} is the capital of ${p.other}. The answer is ${p.answer}`,
    ],
    skipped: [(p) => `The answer is ${p.answer}`],
    unknown: [(p) => `The answer is ${p.answer}`],
  },
};

/** "the <b>Netherlands</b>", or the capital in bold, without a full stop. */
function boldAnswer(type: QuestionType, country: WrongAnswer["country"]) {
  const expected = type === "capital" ? country.capitals.join(" / ") : country.name;
  const article = type !== "capital" && the(country.name) !== country.name ? "the " : "";
  return { expected, bold: `${article}<b>${esc(expected)}</b>` };
}

/** The headline (plain text) and detail (HTML) after a wrong map, flag or capital answer. */
export function wrongFeedback(a: WrongAnswer): { miss: Miss; headline: string; detail: string } {
  const miss = classify(a);
  const mode = modeOf(a.type);
  const { name, capitals } = a.country;
  const { expected, bold } = boldAnswer(a.type, a.country);
  const trap = miss === "trap" ? capitalTrap(a.country.id, a.typed!) : undefined;
  const parts: Parts = {
    other: esc(the(a.other?.name ?? "")),
    Other: esc(sentence(the(a.other?.name ?? ""))),
    answer: `${bold}${stop(expected)}`,
    Answer: sentence(bold),
    where:
      a.type === "capitalLocate"
        ? `${esc(listing(capitals))} ${capitals.length > 1 ? "are" : "is"} in ${esc(the(name))}, shown in orange.`
        : `${esc(sentence(the(name)))} is in orange.`,
    typed: esc(sentence(a.typed?.trim() ?? "")),
    city: esc(trap?.city ?? ""),
    note: esc(trap?.note ?? ""),
  };
  const details = DETAILS[mode][miss] ?? DETAILS[mode].unknown;
  return {
    miss,
    headline: miss === "skipped" ? skippedHeadline(a.type) : oneOf(`headline:${miss}`, HEADLINES[miss]),
    detail: oneOf(`detail:${mode}:${miss}`, details)(parts),
  };
}

const IDENTICAL_HEADLINES = ["Close enough", "Fair enough", "Practically twins"];
const IDENTICAL_DETAILS: ((answer: string) => string)[] = [
  (answer) => `Actually, this one is ${answer}, but honestly: spot the difference.`,
  (answer) => `Technically this one is ${answer}, but we'll let it go. Spot the difference.`,
];

/**
 * For naming a flag that is all but identical to the right one (Chad for Romania), which
 * counts as close: the headline (plain text) and detail (HTML).
 */
export function identicalFlagFeedback(country: WrongAnswer["country"]): { headline: string; detail: string } {
  const { bold } = boldAnswer("flag", country);
  return {
    headline: oneOf("headline:identical", IDENTICAL_HEADLINES),
    detail: oneOf("detail:identical", IDENTICAL_DETAILS)(bold),
  };
}

/** A wrong number within this ratio either way is nearly right... */
const AMOUNT_NEAR = 1.6;
/** ...and one this far out is way off. */
const AMOUNT_FAR = 4;

const AMOUNT_HEADLINES = {
  near: ["Not quite", "Nearly"],
  high: ["Way too high", "Steady on", "Generous", "Ambitious"],
  low: ["Way too low", "Think bigger", "Rather more than that", "Modest"],
  wrong: WRONG,
};

/** The headline after "I don't know". */
export function skippedHeadline(type: QuestionType): string {
  return oneOf(`skipped:${type}`, SKIPPED[type]);
}

/** The headline after a wrong population or GDP answer, by how far off it was, or a skip. */
export function amountHeadline(guess: number | undefined, actual: number, type: QuestionType): string {
  if (guess === undefined) return skippedHeadline(type);
  const ratio = guess / actual;
  if (ratio <= AMOUNT_NEAR && ratio >= 1 / AMOUNT_NEAR) return oneOf("amount:near", AMOUNT_HEADLINES.near);
  if (ratio >= AMOUNT_FAR) return oneOf("amount:high", AMOUNT_HEADLINES.high);
  if (ratio <= 1 / AMOUNT_FAR) return oneOf("amount:low", AMOUNT_HEADLINES.low);
  return oneOf("amount:wrong", AMOUNT_HEADLINES.wrong);
}

/** Every wording, for the tests. */
export const WORDINGS = { HEADLINES, SKIPPED, DETAILS, AMOUNT_HEADLINES, IDENTICAL_HEADLINES, IDENTICAL_DETAILS };
