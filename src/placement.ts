import type { World } from "./data";
import type { Deck, Prompt, QuestionType } from "./deck";

export type Skill = "map" | "flag" | "capital";

export const SKILLS: { skill: Skill; label: string; types: QuestionType[] }[] = [
  { skill: "map", label: "Maps", types: ["locate", "identify"] },
  { skill: "flag", label: "Flags", types: ["flag"] },
  { skill: "capital", label: "Capitals", types: ["capital", "capitalLocate"] },
];

/**
 * How far the level moves after each answer for a skill. Big jumps first to find the
 * right area quickly, then smaller ones to settle. Its length is the questions per skill.
 */
const STEPS = [64, 48, 32, 16, 8, 4];
const START_LEVEL: Record<Skill, number> = { map: 30, flag: 20, capital: 20 };
/** Only countries comfortably inside the measured level are marked as known. */
const KNOWN_FRACTION = 0.85;
/**
 * The estimate never goes more than this far past the least famous country answered
 * correctly, so stopping after a lucky first few answers does not overshoot.
 */
const BEYOND_HARDEST_RIGHT = 10;

/**
 * A short adaptive quiz that estimates, for each skill, how far down the "how well known"
 * list of countries the player can go. A right answer moves the next question to less
 * famous countries, a wrong one to more famous ones.
 */
export class Placement {
  readonly total = STEPS.length * SKILLS.length;
  private levels = { ...START_LEVEL };
  private answered: Record<Skill, number> = { map: 0, flag: 0, capital: 0 };
  private asked = new Set<string>();
  private correct: string[] = [];
  /** Rank of the least famous country answered correctly, per skill; -1 for none yet. */
  private hardestRight: Record<Skill, number> = { map: -1, flag: -1, capital: -1 };
  private last: { skill: Skill; move: number; prompt: Prompt; right: boolean } | null = null;

  constructor(
    private world: World,
    private deck: Deck,
  ) {}

  get done(): number {
    return Object.values(this.answered).reduce((a, b) => a + b, 0);
  }

  next(): Prompt | null {
    if (this.done >= this.total) return null;
    const { skill, types } = SKILLS[this.done % SKILLS.length];
    const type = types[this.answered[skill] % types.length];
    const level = this.levels[skill];
    // A few countries closest to the current level, choosing one at random among them.
    const options = this.world.countries
      .filter((c) => !this.asked.has(`${skill}|${c.id}`) && this.deck.prompt(c.id, type))
      .sort((a, b) => Math.abs(a.rank - level) - Math.abs(b.rank - level))
      .slice(0, 5);
    const country = options[Math.floor(Math.random() * options.length)];
    if (!country) return null;
    this.asked.add(`${skill}|${country.id}`);
    return { ...this.deck.prompt(country.id, type)!, isNew: false };
  }

  record(prompt: Prompt, right: boolean) {
    const skill = skillOf(prompt.type);
    const step = STEPS[this.answered[skill]] ?? STEPS[STEPS.length - 1];
    const move = right ? step : -step;
    this.levels[skill] = clamp(this.levels[skill] + move, 0, this.world.countries.length);
    this.answered[skill]++;
    if (right) this.markRight(skill, prompt);
    this.last = { skill, move, prompt, right };
  }

  /** Flips the last answer to correct, for the "I was right" button. */
  overruleLast() {
    const last = this.last;
    if (!last || last.right) return;
    this.levels[last.skill] = clamp(this.levels[last.skill] - 2 * last.move, 0, this.world.countries.length);
    this.markRight(last.skill, last.prompt);
    last.right = true;
  }

  private markRight(skill: Skill, prompt: Prompt) {
    this.correct.push(prompt.key);
    this.hardestRight[skill] = Math.max(this.hardestRight[skill], prompt.country.rank);
  }

  /** How many of the best-known countries each skill covers. */
  results(): { skill: Skill; label: string; known: number }[] {
    return SKILLS.map(({ skill, label }) => ({
      skill,
      label,
      known:
        this.hardestRight[skill] < 0
          ? 0
          : Math.min(Math.floor(this.levels[skill] * KNOWN_FRACTION), this.hardestRight[skill] + BEYOND_HARDEST_RIGHT),
    }));
  }

  /** Cards to mark as known: the countries within each skill's level, plus every right answer. */
  knownKeys(): string[] {
    const known = Object.fromEntries(this.results().map((r) => [r.skill, r.known])) as Record<Skill, number>;
    const keys = new Set(this.correct);
    for (const { skill, types } of SKILLS) {
      for (const type of types) {
        // Finding a country from its capital needs both the capital and the map.
        const limit = type === "capitalLocate" ? Math.min(known.capital, known.map) : known[skill];
        for (const c of this.world.countries) {
          if (c.rank >= limit) continue;
          const p = this.deck.prompt(c.id, type);
          if (p) keys.add(p.key);
        }
      }
    }
    return [...keys];
  }
}

function skillOf(type: QuestionType): Skill {
  return SKILLS.find((s) => s.types.includes(type))!.skill;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
