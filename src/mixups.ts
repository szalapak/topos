/**
 * Well-known ways to be nearly right, used to word the feedback after a wrong answer: countries
 * whose names are easily swapped, flags that look alike, and cities often taken for the capital.
 * Neighbours by land or sea come from the map instead (`nearness` in `src/data.ts`).
 */

import { AnswerSet } from "./answers.ts";

/** Countries whose names are easily swapped. Keyed by alpha-3 id. */
const NAME_TWINS: [string, string][] = [
  ["SVK", "SVN"], ["AUT", "AUS"], ["NER", "NGA"], ["IRN", "IRQ"], ["CHE", "SWE"], ["MLI", "MWI"],
  ["GMB", "ZMB"], ["DMA", "DOM"], ["MRT", "MUS"], ["GIN", "GNB"], ["GIN", "GNQ"], ["GNB", "GNQ"],
  ["COG", "COD"], ["LVA", "LTU"], ["ISL", "IRL"], ["URY", "PRY"], ["TGO", "TON"], ["LBR", "LBY"],
  ["ARM", "ALB"],
];

/** Flags that are easily confused, at least at a glance. */
const FLAG_LOOKALIKES: [string, string][] = [
  // Blue, yellow and red stripes.
  ["TCD", "ROU"], ["AND", "MDA"], ["AND", "ROU"], ["AND", "TCD"], ["MDA", "ROU"], ["MDA", "TCD"],
  // Red over white, and white over red.
  ["IDN", "MCO"], ["IDN", "POL"], ["MCO", "POL"],
  // Green, white and orange or red.
  ["IRL", "CIV"], ["IRL", "ITA"], ["ITA", "MEX"], ["NER", "IND"],
  // White, blue and red.
  ["NLD", "LUX"], ["RUS", "SVK"], ["RUS", "SVN"], ["SVK", "SVN"],
  ["AUS", "NZL"], ["NOR", "ISL"], ["AUT", "LVA"], ["THA", "CRI"], ["CZE", "PHL"],
  ["USA", "LBR"], ["USA", "MYS"], ["LBR", "MYS"],
  // Green, yellow and red.
  ["MLI", "SEN"], ["MLI", "GIN"], ["CMR", "SEN"], ["BOL", "GHA"], ["BOL", "LTU"],
  // Yellow, blue and red.
  ["COL", "ECU"], ["COL", "VEN"], ["ECU", "VEN"],
  // Blue, white and blue.
  ["HND", "NIC"], ["HND", "SLV"], ["NIC", "SLV"],
  // Red, white and black.
  ["EGY", "YEM"], ["EGY", "SYR"], ["EGY", "IRQ"], ["IRQ", "SYR"], ["IRQ", "YEM"], ["SYR", "YEM"],
  ["JOR", "PSE"], ["KWT", "ARE"],
  ["QAT", "BHR"], ["HTI", "LIE"], ["BEL", "DEU"], ["TUR", "TUN"],
];

/**
 * Flags so alike that naming one for the other counts as close: Chad and Romania differ only in
 * the shade of blue, Indonesia and Monaco only in shape (and not at all at this size), and the
 * Netherlands and Luxembourg mostly in the blue. Each pair is also in `FLAG_LOOKALIKES`.
 */
const IDENTICAL_FLAGS: [string, string][] = [["TCD", "ROU"], ["IDN", "MCO"], ["NLD", "LUX"]];

/** Countries in more than one continent, which are never said to be on the wrong one. */
const TRANSCONTINENTAL = new Set(["RUS", "TUR", "KAZ", "EGY", "AZE", "GEO", "ARM", "CYP", "IDN", "PAN"]);

/**
 * Cities often given as a country's capital, with what makes them a fair guess. The note
 * follows the city's name: "Sydney is the biggest city, but not the capital."
 */
const CAPITAL_TRAPS: { country: string; names: string[]; note: string }[] = [
  { country: "AUS", names: ["Sydney"], note: "is the biggest city, but not the capital" },
  { country: "AUS", names: ["Melbourne"], note: "was the seat of government until 1927" },
  { country: "TUR", names: ["Istanbul", "Constantinople"], note: "is the biggest city, and was the capital until 1923" },
  { country: "CAN", names: ["Toronto"], note: "is the biggest city, but not the capital" },
  { country: "BRA", names: ["Rio de Janeiro", "Rio"], note: "was the capital until 1960" },
  { country: "BRA", names: ["São Paulo"], note: "is the biggest city, but not the capital" },
  { country: "NZL", names: ["Auckland"], note: "is the biggest city, and was the capital until 1865" },
  { country: "NGA", names: ["Lagos"], note: "is the biggest city, and was the capital until 1991" },
  { country: "PAK", names: ["Karachi"], note: "is the biggest city, and was the capital until 1959" },
  { country: "MAR", names: ["Casablanca"], note: "is the biggest city, but not the capital" },
  { country: "VNM", names: ["Ho Chi Minh City", "Ho Chi Minh", "Saigon"], note: "is the biggest city, but not the capital" },
  { country: "MMR", names: ["Yangon", "Rangoon"], note: "is the biggest city, and was the capital until 2006" },
  { country: "KAZ", names: ["Almaty", "Alma-Ata"], note: "is the biggest city, and was the capital until 1997" },
  { country: "USA", names: ["New York", "New York City", "NYC"], note: "is the biggest city, but not the capital" },
  { country: "IND", names: ["Mumbai", "Bombay"], note: "is the financial capital, but not the political one" },
  { country: "IND", names: ["Kolkata", "Calcutta"], note: "was the capital until 1911" },
  { country: "CHN", names: ["Shanghai"], note: "is the biggest city, but not the capital" },
  { country: "ARE", names: ["Dubai"], note: "is the biggest city, but not the capital" },
  { country: "CHE", names: ["Zürich"], note: "is the biggest city, but not the capital" },
  { country: "CHE", names: ["Geneva", "Genève", "Genf"], note: "hosts the UN in Europe, but not the Swiss government" },
  { country: "ZAF", names: ["Johannesburg", "Joburg"], note: "is the biggest city, but none of the three capitals" },
  { country: "DEU", names: ["Bonn"], note: "was West Germany's capital until 1990" },
  { country: "RUS", names: ["Saint Petersburg", "Petersburg", "Leningrad"], note: "was the capital until 1918" },
  { country: "JPN", names: ["Kyoto"], note: "was the imperial capital for over a thousand years" },
  { country: "BLZ", names: ["Belize City"], note: "was the capital until 1970" },
  { country: "BDI", names: ["Bujumbura"], note: "is the biggest city, and was the capital until 2019" },
  { country: "POL", names: ["Kraków", "Cracow"], note: "was the capital until 1596" },
];

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const twins = new Set(NAME_TWINS.map(([a, b]) => key(a, b)));
const lookalikes = new Set(FLAG_LOOKALIKES.map(([a, b]) => key(a, b)));
const identical = new Set(IDENTICAL_FLAGS.map(([a, b]) => key(a, b)));

export function nameTwins(a: string, b: string): boolean {
  return twins.has(key(a, b));
}

export function lookalikeFlags(a: string, b: string): boolean {
  return lookalikes.has(key(a, b));
}

export function identicalFlags(a: string, b: string): boolean {
  return identical.has(key(a, b));
}

/**
 * The continent a country is in, with the Americas split into North (including Central America
 * and the Caribbean) and South. Undefined for countries in more than one.
 */
export function continentOf(c: { id: string; region: string; subregion: string }): string | undefined {
  if (TRANSCONTINENTAL.has(c.id) || !c.region) return undefined;
  if (c.region === "Americas") return c.subregion === "South America" ? "South America" : "North America";
  return c.region;
}

/** Typo-tolerant, like the capitals themselves: "Sidney" is still Sydney. */
const traps = new AnswerSet(CAPITAL_TRAPS.map((t, i) => [String(i), t.names[0], t.names]));

/** A city often taken for this country's capital, if that is what was typed. */
export function capitalTrap(country: string, typed: string): { city: string; note: string } | undefined {
  for (const [i, t] of CAPITAL_TRAPS.entries()) {
    if (t.country === country && traps.check(String(i), typed).result !== "wrong") return { city: t.names[0], note: t.note };
  }
  return undefined;
}

/** Everything listed here, for the tests. */
export const LISTS = { NAME_TWINS, FLAG_LOOKALIKES, IDENTICAL_FLAGS, TRANSCONTINENTAL, CAPITAL_TRAPS };
