import type { QuestionType } from "./deck";
import {
  AREAS,
  MIX_UP_WEIGHT,
  SKILLS,
  mixUpSkill,
  skillOf,
  type Count,
  type Estimate,
  type KnowledgeModel,
  type Observation,
  type Skill,
} from "./knowledge.ts";

export const QUIZ_LENGTHS = [
  { id: "short", label: "Short", perSkill: 5, min: 10 },
  { id: "medium", label: "Medium", perSkill: 10, min: 20 },
  { id: "detailed", label: "Detailed", perSkill: 20, min: 40 },
] as const;
export type QuizLength = (typeof QUIZ_LENGTHS)[number]["id"];

/** How many questions a quiz of this length asks about this many skills. */
export function quizSize(length: QuizLength, skills: number): number {
  const { perSkill, min } = QUIZ_LENGTHS.find((l) => l.id === length)!;
  return skills === 0 ? 0 : Math.max(min, perSkill * skills);
}

/** Questions picked at random from this many of the most useful, so no two quizzes are alike. */
const PICK_FROM = 4;
/**
 * Questions likely to be answered right are favoured a little over the most informative ones
 * (which are right only about half the time), so the quiz is not a string of misses.
 */
const COMFORT = 0.3;
/** Each skill opens with a question the player probably knows, if there is one. */
const WARM_UP_CHANCE = 0.75;
/** How many countries `edge()` names on each side, from those known with a chance in... */
const EDGE_COUNT = 3;
/** ...this range (probably known)... */
const EDGE_INSIDE = [0.7, 0.92] as const;
/** ...and this one (probably not, but close). */
const EDGE_OUTSIDE = [0.12, 0.45] as const;

export interface QuizQuestion {
  id: string;
  type: QuestionType;
}

export interface QuizAnswer extends QuizQuestion {
  skill: Skill;
  right: boolean;
  /** For a wrong answer that named another country: that country's id. */
  mixedUpWith?: string;
}

export interface SkillResult extends Count {
  skill: Skill;
}

/**
 * An adaptive quiz. Each question is chosen to narrow down how many countries the player
 * knows: right answers lead to less famous countries, misses to better-known ones, and the
 * model behind it (`src/knowledge.ts`) also notices which parts of the world the player knows
 * best. No country comes up twice in one quiz.
 */
export class Quiz {
  readonly skills: readonly Skill[];
  readonly answers: QuizAnswer[] = [];
  private model: KnowledgeModel;
  private available: (id: string, type: QuestionType) => boolean;
  private random: () => number;
  /** Questions planned per skill; `extend()` adds more. */
  private quota = new Map<Skill, number>();
  /** Countries that can be asked about in each skill. */
  private eligible = new Map<Skill, string[]>();
  private asked = new Set<string>();
  private estimate: Estimate;

  constructor(
    model: KnowledgeModel,
    skills: readonly Skill[],
    length: QuizLength,
    available: (id: string, type: QuestionType) => boolean,
    random: () => number = Math.random,
  ) {
    this.model = model;
    // Always in the usual order, so the questions take turns the same way.
    this.skills = SKILLS.map((s) => s.skill).filter((s) => skills.includes(s));
    this.available = available;
    this.random = random;
    const total = quizSize(length, this.skills.length);
    this.skills.forEach((skill, i) => {
      this.quota.set(skill, Math.floor(total / this.skills.length) + (i < total % this.skills.length ? 1 : 0));
      const types = SKILLS.find((s) => s.skill === skill)!.types;
      this.eligible.set(
        skill,
        model.ids.filter((id) => types.some((t) => available(id, t))),
      );
    });
    this.estimate = model.fit([]);
  }

  get total(): number {
    return [...this.quota.values()].reduce((a, b) => a + b, 0);
  }

  get done(): number {
    return this.answers.length;
  }

  /** The next question, or null when the quiz is over. */
  next(): QuizQuestion | null {
    // The skill furthest behind its share goes next, so skills take turns.
    const behind = this.skills
      .filter((s) => this.answeredIn(s) < this.quota.get(s)!)
      .sort((a, b) => this.answeredIn(a) / this.quota.get(a)! - this.answeredIn(b) / this.quota.get(b)!);
    for (const skill of behind) {
      const q = this.pick(skill);
      if (q) return q;
    }
    return null;
  }

  private pick(skill: Skill): QuizQuestion | null {
    const n = this.answeredIn(skill);
    const types = SKILLS.find((s) => s.skill === skill)!.types;
    const unasked = this.eligible.get(skill)!.filter((id) => !this.asked.has(id));
    const gradient = this.estimate.countGradient(skill, unasked);
    // The skill's question types take turns, falling back to another when one runs out.
    for (let t = 0; t < types.length; t++) {
      const type = types[(n + t) % types.length];
      let options = unasked
        .filter((id) => this.available(id, type))
        .map((id) => ({ id, ...this.estimate.questionValue(id, skill, gradient) }));
      if (!options.length) continue;
      if (n === 0) {
        const easy = options.filter((o) => o.chance >= WARM_UP_CHANCE);
        if (easy.length) options = easy;
      }
      const best = options
        .map((o) => ({ id: o.id, score: o.gain * (COMFORT + o.chance) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, PICK_FROM);
      const choice = best[Math.floor(this.random() * best.length)];
      return { id: choice.id, type };
    }
    return null;
  }

  private answeredIn(skill: Skill) {
    return this.answers.filter((a) => a.skill === skill).length;
  }

  /**
   * Records an answer. `mixedUpWith` is the other country a wrong answer named, if any (tapped
   * on the globe, or typed): that counts as half a miss for it too (see `MIX_UP_WEIGHT`).
   */
  record(id: string, type: QuestionType, right: boolean, mixedUpWith?: string) {
    const skill = skillOf(type)!;
    const mixUp = !right && mixedUpWith && mixedUpWith !== id && mixUpSkill(type) ? mixedUpWith : undefined;
    this.answers.push({ id, type, skill, right, ...(mixUp && { mixedUpWith: mixUp }) });
    this.asked.add(id);
    // The feedback has just shown which country that was, so asking it later would test memory
    // of the feedback rather than what the player knew.
    if (mixUp) this.asked.add(mixUp);
    this.refit();
  }

  /** Flips the last answer to right, for the "I was right" button. */
  overruleLast() {
    const last = this.answers[this.answers.length - 1];
    if (!last || last.right) return;
    last.right = true;
    delete last.mixedUpWith;
    this.refit();
  }

  private refit() {
    this.estimate = this.model.fit(this.observations());
  }

  observations(): Observation[] {
    return this.answers.flatMap(({ id, type, skill, right, mixedUpWith }): Observation[] => [
      { id, skill, right },
      ...(mixedUpWith ? [{ id: mixedUpWith, skill: mixUpSkill(type)!, right: false, weight: MIX_UP_WEIGHT }] : []),
    ]);
  }

  /**
   * Adds `n` more questions, shared between the skills by how unsure their counts still are,
   * for "narrow it down".
   */
  extend(n: number) {
    const spreads = this.results().map((r) => ({ skill: r.skill, weight: (r.high - r.low) ** 2 + 1e-9 }));
    const total = spreads.reduce((sum, s) => sum + s.weight, 0);
    const shares = spreads.map((s) => ({ ...s, exact: (n * s.weight) / total }));
    const given = shares.map((s) => ({ skill: s.skill, add: Math.floor(s.exact), left: s.exact % 1 }));
    let rest = n - given.reduce((sum, g) => sum + g.add, 0);
    for (const g of [...given].sort((a, b) => b.left - a.left)) {
      if (rest-- <= 0) break;
      g.add++;
    }
    for (const g of given) this.quota.set(g.skill, Math.max(this.quota.get(g.skill)!, this.answeredIn(g.skill)) + g.add);
  }

  /** How many the player knows in each skill of the quiz. */
  results(): SkillResult[] {
    return this.skills.map((skill) => ({
      skill,
      ...this.estimate.count(skill, this.eligible.get(skill)!, this.observed(skill)),
    }));
  }

  /** Answers given in this skill, by country. */
  private observed(skill: Skill): Map<string, boolean> {
    return new Map(this.answers.filter((a) => a.skill === skill).map((a) => [a.id, a.right]));
  }

  /** The chance the player knows this: 1 or 0 when it was asked, else the model's estimate. */
  chance(id: string, skill: Skill): number {
    const seen = this.observed(skill).get(id);
    return seen === undefined ? this.estimate.chance(id, skill) : Number(seen);
  }

  /**
   * The parts of the world the player knows best and least well, when the answers show a
   * clear difference; otherwise null.
   */
  areas(): { strongest: string; weakest: string } | null {
    const bonuses = this.estimate.areaBonuses().map((b, i) => ({ ...b, name: AREAS[i].inText }));
    const sorted = [...bonuses].sort((a, b) => b.mean - a.mean);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const gap = top.mean - bottom.mean;
    if (this.answers.length < 10 || gap < 1 || gap < 1.5 * Math.hypot(top.sd, bottom.sd)) return null;
    return { strongest: top.name, weakest: bottom.name };
  }

  /**
   * Countries at the edge of what the player knows in a skill, for "you probably know these,
   * but those are just out of reach": `inside` are ones they probably know (about an 80%
   * chance), `outside` ones they probably don't (about 30%). Only countries not asked about, up
   * to `n` of each, from different parts of the world where possible. A side can come back
   * short or empty, for someone who knows nearly everything or nearly nothing.
   */
  edge(skill: Skill, n = EDGE_COUNT): { inside: string[]; outside: string[] } {
    const options = this.eligible
      .get(skill)!
      .filter((id) => !this.asked.has(id))
      .map((id) => ({ id, chance: this.estimate.chance(id, skill), area: this.model.item(id, skill)!.a }));
    const pick = ([low, high]: readonly number[], target: number) => {
      const near = options
        .filter((o) => o.chance >= low && o.chance <= high)
        .sort((a, b) => Math.abs(a.chance - target) - Math.abs(b.chance - target));
      // Closest to the target first, but one per part of the world until each has had a turn.
      const chosen: typeof near = [];
      for (const o of near) if (chosen.length < n && !chosen.some((c) => c.area === o.area)) chosen.push(o);
      for (const o of near) if (chosen.length < n && !chosen.includes(o)) chosen.push(o);
      return chosen.map((c) => c.id);
    };
    return { inside: pick(EDGE_INSIDE, 0.8), outside: pick(EDGE_OUTSIDE, 0.3) };
  }
}
