import { DefaultScheduler, Rating, State, type DefaultSchedulerCard } from "ts-fsrs";
import { normalize } from "./answers";
import type { Country, World } from "./data";

export type QuestionType = "locate" | "identify" | "flag" | "capital" | "capitalLocate";

export const QUESTION_TYPES: { type: QuestionType; label: string; offset: number }[] = [
  { type: "locate", label: "Name → find it on the globe", offset: 0 },
  { type: "identify", label: "Highlighted on the globe → type the name", offset: 8 },
  { type: "flag", label: "Flag → type the country", offset: 15 },
  { type: "capital", label: "Country → type the capital", offset: 25 },
  { type: "capitalLocate", label: "Capital → find the country on the globe", offset: 40 },
];
// `offset` staggers introduction: a country's map card comes first and its flag and capital
// well after, so they are not asked while the country is still fresh in mind.

export type Grade = (typeof Rating)["Again" | "Hard" | "Good"];
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
  /** New cards introduced per local date, plus any extra the player asked for that day. */
  days: Record<string, { introduced: number; extra: number }>;
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
/** When nothing is due, cards still being learned may come back this much early. */
const LEARN_AHEAD_MS = 20 * 60_000;
const MAX_LOG = 50_000;
/** New cards are drawn at random from this many next in line, so the order is not predictable. */
const NEW_CARD_WINDOW = 20;
/** Cards marked as already known get their first check spread over this many days. */
const KNOWN_FIRST_CHECK_DAYS = [2, 28];
const DAY_MS = 86_400_000;

const DEFAULT_SETTINGS: Settings = {
  types: { locate: true, identify: true, flag: true, capital: true, capitalLocate: true },
  newPerDay: 10,
};

export class Deck {
  private candidates: Prompt[];

  private constructor(
    private scheduler: Scheduler,
    private world: World,
    private state: Saved,
  ) {
    this.candidates = buildCandidates(world);
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
   * Picks the next question, or null when there is nothing left for today. Countries in
   * `recent` are avoided where possible, so one question does not give away the next.
   */
  next(recent: string[] = []): Prompt | null {
    const now = Date.now();
    const enabled = this.state.settings.types;
    const started = Object.entries(this.state.cards)
      .map(([key, card]) => ({ key, card, ...parseKey(key) }))
      .filter((c) => enabled[c.type] && this.world.byId.has(c.id));

    const pick = <T extends { id: string }>(list: T[]) => list.find((c) => !recent.includes(c.id)) ?? list[0];
    const toPrompt = (c: { key: string; id: string; type: QuestionType }, isNew: boolean): Prompt => ({
      key: c.key,
      country: this.world.byId.get(c.id)!,
      type: c.type,
      isNew,
    });

    const due = started.filter((c) => c.card.dueAt.getTime() <= now).sort(byDue);
    if (due.length) return toPrompt(pick(due), false);

    if (this.newLeftToday() > 0) {
      const window = this.candidates
        .filter((c) => enabled[c.type] && !this.state.cards[c.key])
        .slice(0, NEW_CARD_WINDOW)
        .map((c) => ({ ...c, id: c.country.id }));
      const pool = window.filter((c) => !recent.includes(c.id));
      const from = pool.length ? pool : window;
      // Random, but leaning towards the front of the line.
      const choice = from[Math.floor(from.length * Math.random() ** 1.5)];
      if (choice) return toPrompt(choice, true);
    }

    const learning = started
      .filter((c) => c.card.state !== State.Review && c.card.dueAt.getTime() <= now + LEARN_AHEAD_MS)
      .sort(byDue);
    if (learning.length) return toPrompt(pick(learning), false);
    return null;
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
    this.save();

    return () => {
      if (before) this.state.cards[prompt.key] = before;
      else {
        delete this.state.cards[prompt.key];
        this.today().introduced--;
      }
      this.state.log.pop();
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

  allowMoreNew(n: number) {
    this.today().extra += n;
    this.save();
  }

  counts() {
    const now = Date.now();
    const enabled = this.state.settings.types;
    let due = 0;
    let started = 0;
    for (const [key, card] of Object.entries(this.state.cards)) {
      if (!enabled[parseKey(key).type]) continue;
      started++;
      if (card.dueAt.getTime() <= now) due++;
    }
    const total = this.candidates.filter((c) => enabled[c.type]).length;
    return { due, newLeft: Math.min(this.newLeftToday(), total - started), started, total };
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
    this.state = { ...emptyState(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
    this.save();
  }

  reset() {
    this.state = { ...emptyState(), settings: this.state.settings };
    this.save();
  }

  private newLeftToday() {
    const d = this.today();
    return Math.max(0, this.state.settings.newPerDay + d.extra - d.introduced);
  }

  private today() {
    const key = localDate();
    return (this.state.days[key] ??= { introduced: 0, extra: 0 });
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
      list.push({ key: `${country.id}|${type}`, country, type, isNew: true, order: country.rank + offset });
    }
  }
  return list.sort((a, b) => a.order - b.order);
}

function parseKey(key: string) {
  const [id, type] = key.split("|");
  return { id, type: type as QuestionType };
}

function byDue(a: { card: Card }, b: { card: Card }) {
  return a.card.dueAt.getTime() - b.card.dueAt.getTime();
}

function emptyState(): Saved {
  return { version: 1, cards: {}, log: [], days: {}, settings: structuredClone(DEFAULT_SETTINGS) };
}

function load(): Saved | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const s = revive(JSON.parse(text));
    return { ...emptyState(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
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
