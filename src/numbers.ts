/**
 * Typed number answers: reading what the player typed ("34m", "34 million", "34,000,000"),
 * grading it by how close it is, and showing figures in a readable way.
 */

export type AmountKind = "population" | "gdpPerCapita";

/**
 * How close counts, as a ratio either way (1.15 means within 15% over, or the same distance
 * under on a log scale). Inside `good` is Good, inside `hard` is Hard, further off is Again.
 * For 80,000: Good is about 70,000 to 92,000, Hard about 62,000 to 104,000.
 */
export const TOLERANCE: Record<AmountKind, { good: number; hard: number }> = {
  population: { good: 1.15, hard: 1.3 },
  gdpPerCapita: { good: 1.15, hard: 1.3 },
};

/**
 * Population answers are asked in millions. A bare number above this cannot be millions (no
 * country has that many), so it is read as a plain head count: "38000" is 38,000 people.
 */
const MAX_MILLIONS = 2000;

/** Countries with fewer people than this are not asked: "800" would read as 800 million. */
export const POPULATION_MIN = MAX_MILLIONS;

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  thousands: 1e3,
  tys: 1e3,
  m: 1e6,
  mn: 1e6,
  mln: 1e6,
  million: 1e6,
  millions: 1e6,
  b: 1e9,
  bn: 1e9,
  bln: 1e9,
  mld: 1e9,
  billion: 1e9,
  billions: 1e9,
};

/** Words that may follow a number without changing it. */
const FILLER = new Set(["people", "persons", "inhabitants", "dollars", "dollar", "usd", "us"]);

/**
 * Reads a typed number with an optional size word ("k", "m", "million", "bn"). Accepts
 * thousands separators (commas, dots, spaces or apostrophes) and either a dot or a comma as
 * the decimal point. Returns null for anything that is not a positive number.
 */
export function parseNumber(input: string): { value: number; multiplied: boolean } | null {
  const s = input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[$€£]/g, " ")
    .trim()
    .replace(/^([.,]\d)/, "0$1");
  const m = s.match(/^(\d(?:[\d.,'’   _]*\d)?)(.*)$/);
  if (!m) return null;
  const value = toNumber(m[1].replace(/['’   _]/g, ""));
  if (value === null || !(value > 0)) return null;

  let multiplier = 1;
  let multiplied = false;
  for (const word of m[2].replace(/\./g, " ").split(/\s+/).filter(Boolean)) {
    if (FILLER.has(word)) continue;
    if (multiplied || !(word in MULTIPLIERS)) return null;
    multiplier = MULTIPLIERS[word];
    multiplied = true;
  }
  return { value: value * multiplier, multiplied };
}

/**
 * Digits with dots and commas, either of which can be a decimal point or a thousands
 * separator. When both appear, the last one is the decimal point ("1,234.5", "1.234,5"). One
 * kind alone is a thousands separator when every group after it has three digits ("1,400",
 * "12.000.000"), and a decimal point otherwise ("1.4", "34,5", "0,500").
 */
function toNumber(raw: string): number | null {
  const kinds = new Set(raw.match(/[.,]/g) ?? []);
  if (kinds.size === 0) return Number(raw);
  if (kinds.size === 2) {
    const point = raw[Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","))];
    const separator = point === "." ? "," : ".";
    const [whole, fraction, ...rest] = raw.split(point);
    if (rest.length || fraction.includes(separator) || !threeDigitGroups(whole.split(separator))) return null;
    return Number(`${whole.replaceAll(separator, "")}.${fraction}`);
  }
  const groups = raw.split(/[.,]/);
  if (threeDigitGroups(groups) && groups[0] !== "0") return Number(groups.join(""));
  return groups.length === 2 ? Number(groups.join(".")) : null;
}

function threeDigitGroups(groups: string[]) {
  return groups[0].length >= 1 && groups[0].length <= 3 && groups.slice(1).every((g) => g.length === 3);
}

/** A typed population, where a bare number means millions. */
export function readPopulation(input: string): number | null {
  const n = parseNumber(input);
  if (!n) return null;
  return n.multiplied || n.value > MAX_MILLIONS ? n.value : n.value * 1e6;
}

/** A typed amount of US dollars. */
export function readDollars(input: string): number | null {
  return parseNumber(input)?.value ?? null;
}

export function gradeAmount(guess: number, actual: number, kind: AmountKind): "exact" | "close" | "wrong" {
  const ratio = Math.max(guess / actual, actual / guess);
  const { good, hard } = TOLERANCE[kind];
  return ratio <= good ? "exact" : ratio <= hard ? "close" : "wrong";
}

/** "68.4 million", "1.41 billion", "38,300". */
export function formatPopulation(n: number): string {
  if (n >= 1e9) return `${threeFigures(n / 1e9)} billion`;
  if (n >= 1e6) return `${threeFigures(n / 1e6)} million`;
  return threeFigures(n);
}

/** "$13,900", "$288,000", "$234". */
export function formatDollars(n: number): string {
  return `$${threeFigures(n)}`;
}

/** Three significant figures, but never rounding away whole units: 142 not 142.0, 1234 as 1,230. */
function threeFigures(n: number): string {
  const rounded = n >= 100 && n < 1000 ? Math.round(n) : Number(n.toPrecision(3));
  return rounded.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

/** How far off a guess was, e.g. "12% too low", "3.2 times too high" or "10 times too low". */
export function describeMiss(guess: number, actual: number): string {
  const ratio = guess / actual;
  const times = (r: number) => threeFigures(Math.round(r * 10) / 10);
  if (ratio >= 2) return `${times(ratio)} times too high`;
  if (ratio <= 0.5) return `${times(1 / ratio)} times too low`;
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  if (percent === 0) return "spot on";
  return `${percent}% too ${ratio > 1 ? "high" : "low"}`;
}
