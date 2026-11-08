import type { QuestionType } from "./deck";

/**
 * A model of what a player knows, behind the quiz's "you know about 140 countries" and the
 * cards it fills in as very likely known.
 *
 * It is a logistic item response model, the kind adaptive tests use. The chance of knowing
 * country c in skill s (maps, flags, ...) is
 *
 *     σ(level[s] + area[a] − rank'[c, s] / width[s])
 *
 * where `rank'` is the country's place in the "how well known" order (shifted for a few known
 * traps, see `RANK_SHIFT`), `level[s]` is how far down that list the player's knowledge reaches,
 * and `area[a]` lets a player know their own part of the world (a) better than its countries'
 * fame suggests. A player whose level is 100 countries' worth knows about 100 countries, with a
 * soft edge `width` countries wide. Levels for different skills are correlated (someone good at
 * maps is usually fair at flags), so every answer says a little about every skill.
 *
 * The levels and area bonuses are estimated from answers with a Gaussian approximation to the
 * posterior (Laplace's method: Newton's method finds the most likely values, and the curvature
 * there gives the uncertainty). Counts and their ranges come from drawing plausible players
 * from that estimate.
 */

export type Skill = "map" | "flag" | "capital" | "population" | "gdp";

export interface SkillInfo {
  skill: Skill;
  label: string;
  /** Shown under the label when setting up the quiz. */
  hint: string;
  /** What a count of it is called: "143 countries", "87 flags". */
  noun: string;
  types: readonly QuestionType[];
  /** Ticked when setting up the quiz, until the player changes it. */
  byDefault: boolean;
  /** How many countries a typical player knows in this skill (the prior's middle)... */
  typical: number;
  /** ...and how much players differ, as a standard deviation in countries. */
  spread: number;
  /** How soft the edge of what someone knows is: this many places down the list per logit. */
  width: number;
}

// The priors are educated guesses for people who choose to take a geography quiz. With real
// answers from many players they could be set properly, along with `RANK_SHIFT`.
export const SKILLS: readonly SkillInfo[] = [
  {
    skill: "map",
    label: "Countries",
    hint: "find them on the globe and name them",
    noun: "countries",
    types: ["locate", "identify"],
    byDefault: true,
    typical: 100,
    spread: 50,
    width: 24,
  },
  {
    skill: "flag",
    label: "Flags",
    hint: "name the country from its flag",
    noun: "flags",
    types: ["flag"],
    byDefault: true,
    typical: 55,
    spread: 45,
    width: 24,
  },
  {
    skill: "capital",
    label: "Capitals",
    hint: "name the capital, or find its country",
    noun: "capitals",
    types: ["capital", "capitalLocate"],
    byDefault: true,
    typical: 50,
    spread: 45,
    width: 24,
  },
  {
    skill: "population",
    label: "Population",
    hint: "within about 30%",
    noun: "populations",
    types: ["population"],
    byDefault: false,
    typical: 12,
    spread: 25,
    width: 20,
  },
  {
    skill: "gdp",
    label: "GDP per capita",
    hint: "within about 30%",
    noun: "GDP figures",
    types: ["gdpPerCapita"],
    byDefault: false,
    typical: 8,
    spread: 20,
    width: 20,
  },
];

/** Correlation between a player's levels in any two skills. */
const SKILL_CORRELATION = 0.6;
/** Standard deviation of the area bonus, in logits: 1 is about 24 places down the list. */
const AREA_SD = 1.1;
/**
 * The bonus the player's own part of the world starts with, when the browser gives a hint of
 * where that is (see `src/home.ts`): people usually know their own region best. A nudge, which
 * a few answers can overturn, as they should for someone living abroad.
 */
const HOME_AREA_BONUS = 0.8;
/**
 * A wrong answer that names another country (tapping Slovakia for Slovenia, calling Romania's
 * flag Chad's) counts as this much of a miss for that other country too: someone who mixes the
 * two up probably doesn't know either, but it is weaker evidence than being asked directly.
 */
export const MIX_UP_WEIGHT = 0.5;

/**
 * Questions that are harder (positive) or easier (negative) than the country's fame suggests,
 * in places down the list. Rough guesses, kept few.
 */
const RANK_SHIFT: Partial<Record<Skill, Record<string, number>>> = {
  // A bigger, better-known city is often taken for the capital.
  capital: {
    AUS: 50, CAN: 40, BRA: 40, TUR: 40, CHE: 40, NGA: 45, PAK: 40, ARE: 30,
    VNM: 30, KAZ: 40, MAR: 30, NZL: 30, MMR: 40, CMR: 30,
  },
  // Flags much like a better-known one, and a few that are hard to mistake.
  flag: { TCD: 30, MCO: 30, CIV: 25, NZL: 25, LUX: 25, SVK: 25, SVN: 25, ECU: 25, MLI: 20, GIN: 20, NPL: -50, CYP: -30 },
};

/** Parts of the world a player may know better or worse than fame alone suggests. */
export const AREAS = [
  { name: "Europe", inText: "Europe" },
  { name: "Middle East and North Africa", inText: "the Middle East and North Africa" },
  { name: "Sub-Saharan Africa", inText: "Sub-Saharan Africa" },
  { name: "South and Central Asia", inText: "South and Central Asia" },
  { name: "East and Southeast Asia", inText: "East and Southeast Asia" },
  { name: "North and Central America", inText: "North and Central America" },
  { name: "South America", inText: "South America" },
  { name: "Oceania", inText: "Oceania" },
] as const;

const AREA_OF_SUBREGION: Record<string, number> = {
  "Western Europe": 0, "Northern Europe": 0, "Southern Europe": 0, "Eastern Europe": 0,
  "Central Europe": 0, "Southeast Europe": 0,
  "Western Asia": 1, "Northern Africa": 1,
  "Western Africa": 2, "Eastern Africa": 2, "Middle Africa": 2, "Southern Africa": 2,
  "Southern Asia": 3, "Central Asia": 3,
  "Eastern Asia": 4, "South-Eastern Asia": 4,
  "North America": 5, "Central America": 5, Caribbean: 5,
  "South America": 6,
  "Australia and New Zealand": 7, Melanesia: 7, Polynesia: 7, Micronesia: 7,
};
const AREA_OF_REGION: Record<string, number> = { Europe: 0, Africa: 2, Asia: 4, Americas: 5, Oceania: 7 };

const K = SKILLS.length;
const DIM = K + AREAS.length;
/** Plausible players drawn when counting. Fixed seed, so the same answers give the same range. */
const DRAWS = 400;
const SEED = 20261108;
/** The reported range covers this much of the estimate: 1.2816 standard deviations is 80%. */
const RANGE_Z = 1.2816;

export interface ModelCountry {
  id: string;
  rank: number;
  region: string;
  subregion: string;
}

export interface Observation {
  id: string;
  skill: Skill;
  right: boolean;
  /** How much it counts, 1 for a direct answer (the default). */
  weight?: number;
}

/** An estimated count, e.g. of the countries a player can find on the map. */
export interface Count {
  /** Expected number known. */
  known: number;
  /** A range that very probably (80%) holds the true number. */
  low: number;
  high: number;
  /** How many there are to know. */
  of: number;
}

export function skillInfo(skill: Skill): SkillInfo {
  return SKILLS.find((s) => s.skill === skill)!;
}

export function skillOf(type: QuestionType): Skill | undefined {
  return SKILLS.find((s) => s.types.includes(type))?.skill;
}

/**
 * Which of the other country's skills a wrong answer naming it speaks to. Tapping Slovakia for
 * Slovenia, or naming the highlighted Slovenia "Slovakia", says the player can't place Slovakia;
 * tapping Kenya as the country whose capital is Kampala says they don't know Kenya's capital.
 */
export function mixUpSkill(type: QuestionType): Skill | undefined {
  return type === "capitalLocate" ? "capital" : type === "population" || type === "gdpPerCapita" ? undefined : skillOf(type);
}

/** The area index of a country, or -1 if it is in none. */
export function areaOf(c: { region: string; subregion: string }): number {
  return AREA_OF_SUBREGION[c.subregion] ?? AREA_OF_REGION[c.region] ?? -1;
}

const SKILL_INDEX = new Map(SKILLS.map((s, i) => [s.skill, i]));

export class KnowledgeModel {
  /** Every country's area index (or -1) and place in the fame order. */
  private countries = new Map<string, { area: number; rank: number }>();
  private priorMean: number[];
  private priorPrecision: number[][];

  /** `homeArea` is the area index the player probably lives in, if there is a hint. */
  constructor(countries: readonly ModelCountry[], homeArea: number | null = null) {
    for (const c of countries) this.countries.set(c.id, { area: areaOf(c), rank: c.rank });
    this.priorMean = [...SKILLS.map((s) => s.typical / s.width), ...AREAS.map((_, i) => (i === homeArea ? HOME_AREA_BONUS : 0))];
    const cov = zeros(DIM);
    SKILLS.forEach((a, i) =>
      SKILLS.forEach((b, j) => {
        cov[i][j] = (a.spread / a.width) * (b.spread / b.width) * (i === j ? 1 : SKILL_CORRELATION);
      }),
    );
    for (let i = K; i < DIM; i++) cov[i][i] = AREA_SD ** 2;
    this.priorPrecision = invert(cov);
  }

  get ids(): string[] {
    return [...this.countries.keys()];
  }

  /** Where a question about this country sits: the parameters it depends on, and its offset. */
  item(id: string, skill: Skill): { s: number; a: number; offset: number } | undefined {
    const c = this.countries.get(id);
    if (!c) return undefined;
    const info = skillInfo(skill);
    const rank = c.rank + (RANK_SHIFT[skill]?.[id] ?? 0);
    return { s: SKILL_INDEX.get(skill)!, a: c.area < 0 ? -1 : K + c.area, offset: rank / info.width };
  }

  /** The estimate after these answers. */
  fit(observations: readonly Observation[]): Estimate {
    const data = observations.flatMap((o) => {
      const item = this.item(o.id, o.skill);
      return item ? [{ ...item, y: o.right ? 1 : 0, weight: o.weight ?? 1 }] : [];
    });
    const m = this.priorMean;
    const P = this.priorPrecision;

    const logPosterior = (x: number[]) => {
      let sum = 0;
      for (const d of data) {
        const eta = linear(x, d);
        // log σ(η) for a right answer, log σ(−η) for a wrong one, written to avoid overflow.
        sum -= d.weight * softplus(d.y ? -eta : eta);
      }
      const dx = x.map((v, i) => v - m[i]);
      return sum - 0.5 * quadratic(P, dx);
    };
    /** Gradient and the negated Hessian (positive definite) of the log posterior. */
    const curvature = (x: number[]) => {
      const dx = x.map((v, i) => v - m[i]);
      const grad = P.map((row) => -dot(row, dx));
      const H = P.map((row) => [...row]);
      for (const d of data) {
        const p = sigmoid(linear(x, d));
        const r = d.weight * (d.y - p);
        const w = d.weight * p * (1 - p);
        grad[d.s] += r;
        H[d.s][d.s] += w;
        if (d.a >= 0) {
          grad[d.a] += r;
          H[d.a][d.a] += w;
          H[d.s][d.a] += w;
          H[d.a][d.s] += w;
        }
      }
      return { grad, H };
    };

    // Newton's method, halving the step if it overshoots. The log posterior is concave, so
    // this finds its single peak.
    let x = [...m];
    let current = logPosterior(x);
    for (let iter = 0; iter < 50; iter++) {
      const { grad, H } = curvature(x);
      const step = solve(H, grad);
      let t = 1;
      let next = x.map((v, i) => v + step[i]);
      let value = logPosterior(next);
      while (value < current - 1e-9 && t > 1e-4) {
        t /= 2;
        next = x.map((v, i) => v + t * step[i]);
        value = logPosterior(next);
      }
      x = next;
      current = value;
      if (Math.max(...step.map((v) => Math.abs(v * t))) < 1e-7) break;
    }
    return new Estimate(this, x, invert(curvature(x).H));
  }
}

export class Estimate {
  readonly model: KnowledgeModel;
  readonly mean: number[];
  readonly cov: number[][];

  constructor(model: KnowledgeModel, mean: number[], cov: number[][]) {
    this.model = model;
    this.mean = mean;
    this.cov = cov;
  }

  /** The chance the player knows this, allowing for how unsure the estimate still is. */
  chance(id: string, skill: Skill): number {
    const item = this.model.item(id, skill);
    if (!item) return 0;
    const { eta, variance } = this.spread(item);
    // A close approximation to averaging σ over a normal distribution of η (MacKay's).
    return sigmoid(eta / Math.sqrt(1 + (Math.PI * variance) / 8));
  }

  /** The most likely value of η for a question, and how unsure it is. */
  private spread(item: { s: number; a: number; offset: number }) {
    const { s, a } = item;
    const eta = linear(this.mean, item);
    const C = this.cov;
    const variance = a < 0 ? C[s][s] : C[s][s] + C[a][a] + 2 * C[s][a];
    return { eta, variance };
  }

  /**
   * How much the expected count for `skill` over `ids` moves per unit change in each
   * parameter: the direction that matters for "how many does this player know".
   */
  countGradient(skill: Skill, ids: readonly string[]): number[] {
    const g = new Array<number>(DIM).fill(0);
    for (const id of ids) {
      const item = this.model.item(id, skill);
      if (!item) continue;
      const p = sigmoid(linear(this.mean, item));
      const slope = p * (1 - p);
      g[item.s] += slope;
      if (item.a >= 0) g[item.a] += slope;
    }
    return g;
  }

  /**
   * For a possible question: the chance of a right answer, and how much its answer is expected
   * to narrow the count whose gradient is `gradient` (reduction in its variance, to first
   * order). Questions the estimate is unsure about, near the edge of what the player knows,
   * narrow it most.
   */
  questionValue(id: string, skill: Skill, gradient: readonly number[]): { chance: number; gain: number } {
    const item = this.model.item(id, skill);
    if (!item) return { chance: 0, gain: 0 };
    const { eta, variance } = this.spread(item);
    const p = sigmoid(eta);
    const info = p * (1 - p);
    const C = this.cov;
    let shared = 0;
    for (let i = 0; i < DIM; i++) shared += gradient[i] * (C[i][item.s] + (item.a >= 0 ? C[i][item.a] : 0));
    return { chance: this.chance(id, skill), gain: (shared * shared * info) / (1 + variance * info) };
  }

  /**
   * How many of `ids` the player knows in this skill. Questions already answered count as
   * answered (`observed`); the rest are estimated, with the range covering both how unsure the
   * estimate is and which particular countries the player happens to know.
   */
  count(skill: Skill, ids: readonly string[], observed: ReadonlyMap<string, boolean>): Count {
    let sure = 0;
    const open: { s: number; a: number; offset: number }[] = [];
    for (const id of ids) {
      const seen = observed.get(id);
      if (seen === undefined) {
        const item = this.model.item(id, skill);
        if (item) open.push(item);
      } else if (seen) sure++;
    }
    const L = cholesky(this.cov);
    const random = mulberry32(SEED);
    let sum = 0;
    let sumSq = 0;
    let chance = 0;
    const z = new Array<number>(DIM);
    const x = new Array<number>(DIM);
    for (let d = 0; d < DRAWS; d++) {
      for (let i = 0; i < DIM; i++) z[i] = gaussian(random);
      for (let i = 0; i < DIM; i++) {
        let v = this.mean[i];
        for (let j = 0; j <= i; j++) v += L[i][j] * z[j];
        x[i] = v;
      }
      let expected = 0;
      let variance = 0;
      for (const item of open) {
        const p = sigmoid(linear(x, item));
        expected += p;
        variance += p * (1 - p);
      }
      sum += expected;
      sumSq += expected * expected;
      chance += variance;
    }
    const mean = sum / DRAWS;
    const sd = Math.sqrt(Math.max(0, sumSq / DRAWS - mean * mean + chance / DRAWS));
    return {
      known: sure + mean,
      low: sure + Math.max(0, mean - RANGE_Z * sd),
      high: sure + Math.min(open.length, mean + RANGE_Z * sd),
      of: ids.length,
    };
  }

  /** The area bonuses, most likely value and standard deviation, in `AREAS` order. */
  areaBonuses(): { mean: number; sd: number }[] {
    return AREAS.map((_, i) => ({ mean: this.mean[K + i], sd: Math.sqrt(this.cov[K + i][K + i]) }));
  }

  /** The estimated level for a skill, in countries (100 means about 100 known). */
  level(skill: Skill): { mean: number; sd: number } {
    const i = SKILL_INDEX.get(skill)!;
    const w = skillInfo(skill).width;
    return { mean: this.mean[i] * w, sd: Math.sqrt(this.cov[i][i]) * w };
  }
}

// ---------------------------------------------------------------- maths

function linear(x: readonly number[], item: { s: number; a: number; offset: number }) {
  return x[item.s] + (item.a >= 0 ? x[item.a] : 0) - item.offset;
}

export function sigmoid(v: number) {
  return 1 / (1 + Math.exp(-v));
}

/** log(1 + e^v), without overflow for large v. */
function softplus(v: number) {
  return v > 30 ? v : Math.log1p(Math.exp(v));
}

function dot(a: readonly number[], b: readonly number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function quadratic(A: number[][], v: number[]) {
  return dot(
    v,
    A.map((row) => dot(row, v)),
  );
}

function zeros(n: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

/** Lower-triangular L with L Lᵀ = A, for a symmetric positive definite A. */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      // A tiny floor keeps rounding from turning a nearly singular matrix into a NaN.
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  return L;
}

/** Solves A x = b for a symmetric positive definite A. */
function solve(A: number[][], b: readonly number[]): number[] {
  const L = cholesky(A);
  const n = b.length;
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

function invert(A: number[][]): number[][] {
  const n = A.length;
  const columns = Array.from({ length: n }, (_, j) => solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  // Symmetrise, so rounding does not leave it lopsided.
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (columns[j][i] + columns[i][j]) / 2));
}

/** A small, seedable random number generator. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
