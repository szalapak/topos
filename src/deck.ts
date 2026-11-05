import { DefaultScheduler, Rating, State, type DefaultSchedulerCard } from "ts-fsrs";
import { normalize } from "./answers";
import type { Country, World } from "./data";
import { POPULATION_MIN } from "./numbers";

export type QuestionType = "locate" | "identify" | "flag" | "capital" | "capitalLocate" | "population" | "gdpPerCapita";

export const QUESTION_TYPES: { type: QuestionType; label: string; offset: number }[] = [
  { type: "locate", label: "Name → find it on the globe", offset: 0 },
  { type: "identify", label: "Highlighted on the globe → type the name", offset: 8 },
  { type: "flag", label: "Flag → type the country", offset: 15 },
  { type: "capital", label: "Country → type the capital", offset: 25 },
  { type: "capitalLocate", label: "Capital → find the country on the globe", offset: 40 },
  { type: "population", label: "Country → type its population (in millions)", offset: 50 },
  { type: "gdpPerCapita", label: "Country → type its GDP per capita (US$)", offset: 60 },
];
// `offset` staggers introduction: a country's map card comes first and its flag, capital and
// figures well after, so they are not asked while the country is still fresh in mind.

/** Question types answered with a number, graded by closeness (see `src/numbers.ts`). */
export const AMOUNT_TYPES = ["population", "gdpPerCapita"] as const satisfies readonly QuestionType[];

export type Grade = (typeof Rating)["Again" | "Hard" | "Good"];

/** How well a country is known, for colouring the globe. */
export type Knowledge = "weak" | "learning" | "known";
export { Rating };

export interface Settings {
  types: Record<QuestionType, boolean>;
  newPerDay: number;
}

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>;
type Card = DefaultSchedulerCard;
type LogEntry = [key: string, grade: Grade, time: number];

interface Saved {
  version: 1;
  cards: Record<string, Card>;
  log: LogEntry[];
  /**
   * New cards introduced per local date. `extra` is left over from the old daily allowance
   * ("Learn 5 more") and is no longer used.
   */
  days: Record<string, { introduced: number; extra?: number }>;
  settings: Settings;
  /** When the placement round was finished, if ever. */
  placedAt?: number;
}

export interface Prompt {
  key: string;
  country: Country;
  type: QuestionType;
  isNew: boolean;
}

const STORAGE_KEY = "topos:v1";
const MAX_LOG = 50_000;
/** New cards are drawn at random from this many next in line, so the order is not predictable. */
const NEW_CARD_WINDOW = 20;
/** Cards already started avoid only this many of the most recent countries. */
const REVIEW_AVOIDS_RECENT = 3;
/** Cards marked as already known get their first check spread over this many days. */
const KNOWN_FIRST_CHECK_DAYS = [2, 28];
const DAY_MS = 86_400_000;
/** A card counts as known once FSRS expects it to be remembered this many days or more. */
const KNOWN_STABILITY_DAYS = 14;
/** Below this estimated chance of recall, a known card that has gone unchecked counts as fading. */
const FADING_RECALL = 0.7;

// How the next question is picked: see `next()`. Weights are relative to a card that has just
// fallen due, which weighs 1.
/** A card missed last time it was asked. Higher than a due card so it comes back this round. */
const MISSED_WEIGHT = 4;
/** ...or this fraction of everything else together, when that is more. */
const MISSED_SHARE = 0.35;
/**
 * A missed card is held back for the first of these many other questions and is fully back
 * in the running after the second. Time counts too, for a card missed in an earlier visit.
 * Each further miss in a row doubles the wait, up to `MISSED_STRETCH_CAP` times, so a country
 * that will not stick is spaced out rather than drilled.
 */
const MISSED_GAP: [number, number] = [2, 7];
const MISSED_FULL_AFTER_MS = 5 * 60_000;
const MISSED_STRETCH_CAP = 2;
/** Overdue cards weigh more the longer they are overdue, up to this multiple of their interval. */
const OVERDUE_CAP = 3;
/** All cards not yet due together weigh at most this much, however many there are. */
const AHEAD_MAX_WEIGHT = 1;
/** New cards as a group. Lower when many cards are still being learned or past the day's pace. */
const NEW_WEIGHT = 2.5;
/** ...or, until the day's pace is reached, this fraction of the reviews' weight when that is more. */
const NEW_SHARE = 0.2;
/** No new cards while this many are still being learned. */
const LEARNING_LIMIT = 12;
/**
 * Each earlier miss makes a due or nearly due card this much more likely, up to `STRUGGLE_CAP`
 * misses, so countries that have been hard come round a little more often.
 */
const STRUGGLE_STEP = 0.25;
const STRUGGLE_CAP = 4;

const DEFAULT_SETTINGS: Settings = {
  types: {
    locate: true,
    identify: true,
    flag: true,
    capital: true,
    capitalLocate: true,
    population: true,
    gdpPerCapita: true,
  },
  newPerDay: 10,
};

/** Saved settings over the defaults, so question types added since they were saved start on. */
function withDefaults(saved: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...saved, types: { ...DEFAULT_SETTINGS.types, ...saved?.types } };
}

export class Deck {
  private candidates: Prompt[];
  /** Answers given so far, counting from the start of the log. */
  private answered = 0;
  /**
   * Per card: when it was last asked (as a count of answers), times missed in all, and misses
   * in a row up to now (absent when the last answer was right).
   */
  private lastAsked = new Map<string, number>();
  private misses = new Map<string, number>();
  private missedInARow = new Map<string, number>();

  private constructor(
    private scheduler: Scheduler,
    private world: World,
    private state: Saved,
  ) {
    this.candidates = buildCandidates(world);
    this.readHistory();
  }

  private readHistory() {
    this.answered = 0;
    this.lastAsked.clear();
    this.misses.clear();
    this.missedInARow.clear();
    for (const [key, grade] of this.state.log) this.remember(key, grade);
  }

  private remember(key: string, grade: Grade) {
    this.lastAsked.set(key, ++this.answered);
    if (grade === Rating.Again) {
      this.misses.set(key, (this.misses.get(key) ?? 0) + 1);
      this.missedInARow.set(key, (this.missedInARow.get(key) ?? 0) + 1);
    } else this.missedInARow.delete(key);
  }

  static async open(world: World): Promise<Deck> {
    const scheduler = await DefaultScheduler({ desiredRetention: 0.9, enableFuzz: true });
    return new Deck(scheduler, world, load() ?? emptyState());
  }

  get settings(): Settings {
    return this.state.settings;
  }

  updateSettings(s: Settings) {
    this.state.settings = s;
    this.save();
  }

  /** True for a new player, who is offered the placement round. */
  get isFresh(): boolean {
    return !this.state.placedAt && Object.keys(this.state.cards).length === 0;
  }

  /** The question for this country and type, if it is one the game asks. */
  prompt(countryId: string, type: QuestionType): Prompt | undefined {
    return this.candidates.find((c) => c.country.id === countryId && c.type === type);
  }

  /**
   * Picks the next question at random, weighted by how much each card needs asking, or null
   * when there is nothing at all to ask. `recent` lists the countries just asked about, most
   * recent first: the last one is never asked again straight away, and the few before it are
   * avoided where possible, so one question does not give away the next. New cards avoid all
   * of `recent`, so a country's map and name questions do not arrive close together.
   *
   * Every started card gets a weight (see `need()`): a card missed last time weighs most once a
   * few other questions have passed (and keeps a fair share however much else is due), a due
   * card weighs 1 and more the longer it is overdue, and cards not yet due share a small weight
   * that favours the nearly due. New cards form one more option (see `newWeight()`).
   */
  next(recent: string[] = []): Prompt | null {
    const now = Date.now();
    const all = this.started();
    const learning = all.filter((c) => this.isLearning(c.key, c.card)).length;
    const avoid = recent.slice(0, REVIEW_AVOIDS_RECENT);
    const away = all.filter((c) => !avoid.includes(c.id));
    const started = away.length ? away : all.filter((c) => c.id !== recent[0]);

    const toPrompt = (c: { key: string; id: string; type: QuestionType }, isNew: boolean): Prompt => ({
      key: c.key,
      country: this.world.byId.get(c.id)!,
      type: c.type,
      isNew,
    });

    const options: { weight: number; take: () => Prompt; missed?: boolean }[] = [];
    const ahead: { weight: number; card: (typeof started)[number] }[] = [];
    for (const c of started) {
      const { kind, weight } = this.need(c.key, c.card, now);
      if (kind === "ahead") ahead.push({ weight, card: c });
      else options.push({ weight, take: () => toPrompt(c, false), missed: kind === "missed" });
    }
    const aheadTotal = ahead.reduce((sum, a) => sum + a.weight, 0);
    if (aheadTotal > 0) {
      const take = () => toPrompt(pickWeighted(ahead)!.card, false);
      options.push({ weight: Math.min(aheadTotal, AHEAD_MAX_WEIGHT), take });
    }

    const enabled = this.state.settings.types;
    const window = this.candidates
      .filter((c) => enabled[c.type] && !this.state.cards[c.key])
      .slice(0, NEW_CARD_WINDOW)
      .map((c) => ({ ...c, id: c.country.id }));
    const pool = window.filter((c) => !recent.includes(c.id));
    const newOnes = pool.length ? pool : window.filter((c) => c.id !== recent[0]);
    if (newOnes.length) {
      // Random, but leaning towards the front of the line.
      const take = () => toPrompt(newOnes[Math.floor(newOnes.length * Math.random() ** 1.5)], true);
      const reviews = options.reduce((sum, o) => sum + (o.missed ? 0 : o.weight), 0);
      options.push({ weight: this.newWeight(learning, reviews), take });
    }

    // With many cards due, missed cards keep their share, so they still come back this round.
    const others = options.reduce((sum, o) => sum + (o.missed ? 0 : o.weight), 0);
    const boost = Math.max(1, (MISSED_SHARE * others) / MISSED_WEIGHT);
    for (const o of options) if (o.missed) o.weight *= boost;

    const choice = pickWeighted(options);
    if (choice) return choice.take();
    // Nothing weighs anything, e.g. only a card missed a moment ago: ask any started card.
    const any = started[Math.floor(Math.random() * started.length)];
    if (any) return toPrompt(any, false);
    return newOnes.length ? toPrompt(newOnes[0], true) : null;
  }

  /** Why a card might be asked next and how strongly; see `next()`. */
  private need(key: string, card: Card, now: number): { kind: "missed" | "due" | "ahead"; weight: number } {
    const inARow = this.missedInARow.get(key);
    if (inARow) {
      // Waits longer after each miss in a row, and gets no extra weight for them: a card missed
      // again and again would otherwise nag.
      const stretch = 2 ** Math.min(inARow - 1, MISSED_STRETCH_CAP);
      const [from, full] = MISSED_GAP.map((n) => n * stretch);
      const gap = this.answered - (this.lastAsked.get(key) ?? -Infinity);
      const since = now - (card.lastReviewAt?.getTime() ?? 0);
      const ready = Math.max((gap - from) / (full - from), since / (MISSED_FULL_AFTER_MS * stretch));
      return { kind: "missed", weight: MISSED_WEIGHT * clamp(ready, 0, 1) };
    }
    const struggle = 1 + STRUGGLE_STEP * Math.min(this.misses.get(key) ?? 0, STRUGGLE_CAP);
    // How far through its interval the card is: 1 when due, 2 when overdue by a whole interval.
    const last = card.lastReviewAt?.getTime() ?? now;
    const progress = (now - last) / Math.max(card.dueAt.getTime() - last, 60_000);
    if (progress >= 1) return { kind: "due", weight: Math.min(progress, OVERDUE_CAP) * struggle };
    // Steep, so a card is only asked early when it is nearly due anyway.
    return { kind: "ahead", weight: progress ** 4 * struggle };
  }

  /** Missed last time, or not yet through FSRS's short learning steps. */
  private isLearning(key: string, card: Card) {
    return this.missedInARow.has(key) || card.state === State.Learning || card.state === State.Relearning;
  }

  /**
   * New cards as one option: a fair share of picks until the day's pace (the "new cards per
   * day" setting) is reached, then less and less, and none while many cards are being learned.
   * `reviews` is the weight of the due and not-yet-due cards it competes with.
   */
  private newWeight(learning: number, reviews: number) {
    const pace = this.state.settings.newPerDay;
    if (pace <= 0) return 0;
    const room = Math.max(0, 1 - learning / LEARNING_LIMIT);
    const past = this.today().introduced - pace;
    if (past < 0) return room * Math.max(NEW_WEIGHT, NEW_SHARE * reviews);
    // Halves with every further day's worth, so new cards slow down but never stop.
    return room * NEW_WEIGHT * 0.5 ** (past / pace);
  }

  /** Cards the player has started, for the question types that are switched on. */
  private started() {
    const enabled = this.state.settings.types;
    return Object.entries(this.state.cards)
      .map(([key, card]) => ({ key, card, ...parseKey(key) }))
      .filter((c) => enabled[c.type] && this.world.byId.has(c.id));
  }

  /**
   * How well each started country is known, judged from its cards of the given types (only
   * those switched on). Countries with no such cards are left out.
   */
  knowledge(types: readonly QuestionType[]): Map<string, Knowledge> {
    const now = Date.now();
    const scores = new Map<string, number[]>();
    for (const c of this.started()) {
      if (!types.includes(c.type)) continue;
      // Cards marked known by the placement round have not been asked yet: trust the estimate.
      const score = this.lastAsked.has(c.key) ? cardScore(c.card, now) : 2;
      scores.set(c.id, [...(scores.get(c.id) ?? []), score]);
    }
    const result = new Map<string, Knowledge>();
    for (const [id, list] of scores) {
      // Averaged, so a well-known map with a shaky capital reads as "learning", not "weak".
      const mean = list.reduce((a, b) => a + b, 0) / list.length;
      result.set(id, mean < 0.5 ? "weak" : mean >= 1.75 ? "known" : "learning");
    }
    return result;
  }

  /** Records an answer. Returns an undo token so a wrong verdict can be overruled. */
  answer(prompt: Prompt, grade: Grade): () => void {
    const before = this.state.cards[prompt.key];
    const now = new Date();
    const card = before ?? this.scheduler.newCard({ now });
    // The library's review() type omits stabilityFast, which the returned card does carry.
    this.state.cards[prompt.key] = this.scheduler.review({ card, grade, now }).card as Card;
    this.state.log.push([prompt.key, grade, now.getTime()]);
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
    if (!before) this.today().introduced++;
    const { key } = prompt;
    const history = [this.answered, this.lastAsked.get(key), this.misses.get(key), this.missedInARow.get(key)] as const;
    this.remember(key, grade);
    this.save();

    return () => {
      if (before) this.state.cards[key] = before;
      else {
        delete this.state.cards[key];
        this.today().introduced--;
      }
      this.state.log.pop();
      const [answered, asked, misses, inARow] = history;
      this.answered = answered;
      restore(this.lastAsked, key, asked);
      restore(this.misses, key, misses);
      restore(this.missedInARow, key, inARow);
      this.save();
    };
  }

  /**
   * Adds cards the player very likely knows already (from the placement round), as if
   * answered correctly. Their first check is spread over the coming weeks so they do not
   * all fall due on the same day. These do not count towards the daily new-card limit.
   */
  markKnown(keys: string[]) {
    const now = new Date();
    const [min, max] = KNOWN_FIRST_CHECK_DAYS;
    for (const key of keys) {
      if (this.state.cards[key]) continue;
      const blank = this.scheduler.newCard({ now }) as Card;
      const reviewed = this.scheduler.review({ card: blank, grade: Rating.Good, now }).card as Card;
      const dueAt = new Date(now.getTime() + (min + Math.random() * (max - min)) * DAY_MS);
      this.state.cards[key] = { ...reviewed, dueAt };
    }
    this.state.placedAt = now.getTime();
    this.save();
  }

  /** Cards due now, cards still being learned, and how many of all the cards are started. */
  counts() {
    const now = Date.now();
    let due = 0;
    let learning = 0;
    const started = this.started();
    for (const c of started) {
      if (this.isLearning(c.key, c.card)) learning++;
      else if (c.card.dueAt.getTime() <= now) due++;
    }
    const enabled = this.state.settings.types;
    const total = this.candidates.filter((c) => enabled[c.type]).length;
    return { due, learning, started: started.length, total };
  }

  /** Cards that have graduated to long-term review, and total answers given. */
  progress() {
    let reviewing = 0;
    for (const card of Object.values(this.state.cards)) if (card.state === State.Review) reviewing++;
    return { reviewing, answers: this.state.log.length };
  }

  exportJson(): string {
    return JSON.stringify(this.state);
  }

  importJson(text: string) {
    const parsed = revive(JSON.parse(text));
    if (parsed?.version !== 1 || typeof parsed.cards !== "object") throw new Error("Not a Topos progress file");
    this.state = { ...emptyState(), ...parsed, settings: withDefaults(parsed.settings) };
    this.readHistory();
    this.save();
  }

  reset() {
    this.state = { ...emptyState(), settings: this.state.settings };
    this.readHistory();
    this.save();
  }

  private today() {
    const key = localDate();
    return (this.state.days[key] ??= { introduced: 0 });
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Private browsing or full storage: keep playing, progress just will not persist.
    }
  }
}

function buildCandidates(world: World): Prompt[] {
  const list: (Prompt & { order: number })[] = [];
  for (const country of world.countries) {
    for (const { type, offset } of QUESTION_TYPES) {
      // "Which country has the capital Singapore?" gives itself away.
      if (type === "capitalLocate" && country.capitals.some((c) => normalize(c).includes(normalize(country.name))))
        continue;
      if (type.startsWith("capital") && country.capitals.length === 0) continue;
      if (type === "population" && (country.population?.value ?? 0) < POPULATION_MIN) continue;
      if (type === "gdpPerCapita" && !country.gdpPerCapita) continue;
      list.push({ key: `${country.id}|${type}`, country, type, isNew: true, order: country.rank + offset });
    }
  }
  return list.sort((a, b) => a.order - b.order);
}

/** 0 for a card that keeps being missed, 1 while being learned, 2 once known. */
function cardScore(card: Card, now: number): number {
  const missedAgain = card.state === State.Relearning || (card.state === State.Learning && card.reps >= 2);
  if (missedAgain || (card.lapses >= 2 && card.stability < 7)) return 0;
  if (card.stability < KNOWN_STABILITY_DAYS) return 1;
  // FSRS's forgetting curve, roughly: recall is 90% after `stability` days, then keeps falling.
  const days = card.lastReviewAt ? (now - card.lastReviewAt.getTime()) / DAY_MS : 0;
  const recall = 1 / (1 + days / (9 * card.stability));
  return recall < FADING_RECALL ? 1 : 2;
}

/** Picks one item at random, in proportion to its weight; null if none weighs anything. */
function pickWeighted<T extends { weight: number }>(items: T[]): T | null {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  let last: T | null = null;
  for (const item of items) {
    if (item.weight <= 0) continue;
    last = item;
    r -= item.weight;
    if (r < 0) return item;
  }
  // Only reached through rounding.
  return last;
}

function restore<K, V>(map: Map<K, V>, key: K, value: V | undefined) {
  if (value === undefined) map.delete(key);
  else map.set(key, value);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function parseKey(key: string) {
  const [id, type] = key.split("|");
  return { id, type: type as QuestionType };
}

function emptyState(): Saved {
  return { version: 1, cards: {}, log: [], days: {}, settings: structuredClone(DEFAULT_SETTINGS) };
}

function load(): Saved | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const s = revive(JSON.parse(text));
    return { ...emptyState(), ...s, settings: withDefaults(s.settings) };
  } catch {
    return null;
  }
}

/** JSON turns the card dates into strings; turn them back. */
function revive(s: Saved): Saved {
  for (const card of Object.values(s.cards ?? {})) {
    card.dueAt = new Date(card.dueAt);
    card.lastReviewAt = card.lastReviewAt ? new Date(card.lastReviewAt) : null;
  }
  return s;
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
