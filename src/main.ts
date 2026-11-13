import "./style.css";
import { AnswerSet, type Verdict } from "./answers";
import { loadWorld, nearness, type Country, type World } from "./data";
import {
  AMOUNT_TYPES,
  Deck,
  KNOWLEDGE_GROUPS,
  QUESTION_TYPES,
  Rating,
  type Grade,
  type Knowledge,
  type Prompt,
  type QuestionType,
} from "./deck";
import { countQuiz } from "./counter";
import { amountHeadline, identicalFlagFeedback, wrongFeedback } from "./feedback";
import { Globe } from "./globe";
import { SKILLS, skillInfo, type Skill } from "./knowledge";
import { identicalFlags } from "./mixups";
import { describeMiss, formatDollars, formatPopulation, gradeAmount, readDollars, readPopulation } from "./numbers";
import { Quiz, QUIZ_LENGTHS, quizSize, type QuizLength, type SkillResult } from "./quiz";
import { calendar, change, dateKey, daysBetween, shade, summarize, typicalDay, type CalendarDay } from "./stats";
import { esc, oneOf, stop, the } from "./text";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const panel = $("#panel");
const counts = $<HTMLButtonElement>("#counts");
const doneButton = $<HTMLButtonElement>("#done");

let world: World;
let deck: Deck;
let globe: Globe;
let names: AnswerSet;
let capitals: AnswerSet;

interface Session {
  answered: number;
  correct: number;
  /** Countries asked about most recently, kept out of the next few questions. */
  recent: string[];
  /** Set during the quiz, whose answers go to the deck only when its results are shown. */
  quiz?: QuizRun;
  /** True once the player has been asked to do a few more before stopping. */
  nudged?: boolean;
}

interface QuizRun {
  quiz: Quiz;
  /** Every answer with its grade for the deck, and any other country it named... */
  graded: { prompt: Prompt; grade: Grade; mixedUpWith?: string }[];
  /** ...of which this many have gone into the deck. */
  applied: number;
  /** What the deck made of them so far, over every "narrow it down". */
  remembered: number;
  missed: number;
  length: QuizLength;
  /** Set once the results have been counted, so "narrow it down" doesn't count them again. */
  counted?: boolean;
}

let session: Session | null = null;
let lastSession: Session | null = null;
/** How many recent countries `Deck.next()` is told about. */
const RECENT_KEPT = 8;
/** Stopping before this many answers brings a gentle "a few more?" once per round. */
const NUDGE_BELOW = 8;
/** Ways to colour the globe between rounds, besides "All". */
const GLOBE_MODES = KNOWLEDGE_GROUPS;
/** What the quiz asks about and how long it is, kept for the rest of the visit. */
const quizChoice: { skills: Skill[]; length: QuizLength } = {
  skills: SKILLS.filter((s) => s.byDefault).map((s) => s.skill),
  length: "medium",
};
/** "Narrow it down" asks this many more questions. */
const NARROW_MORE = 10;
/** ...and is offered while a count's likely range is wider than this. */
const NARROW_ABOVE = 12;
/** Which mode the globe is coloured by between rounds; null for all question types together. */
let globeMode: string | null = null;

async function init() {
  world = await loadWorld();
  deck = await Deck.open(world);
  globe = new Globe($("#globe"), world);
  names = new AnswerSet(world.countries.map((c) => [c.id, c.name, c.names]));
  capitals = new AnswerSet(world.countries.map((c) => [c.id, c.name, [...c.capitals, ...c.capitalAliases]]));
  $("#loading").remove();
  $("#zoom-in").onclick = () => globe.zoomBy(1.6);
  $("#zoom-out").onclick = () => globe.zoomBy(1 / 1.6);
  doneButton.onclick = () => (session?.quiz ? showQuizResults() : stopRound());
  counts.onclick = showStats;
  trackVisibleArea();
  // Shared results link here with ?quiz, straight to the quiz.
  const params = new URLSearchParams(location.search);
  if (params.has("quiz")) {
    params.delete("quiz");
    const rest = params.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    showQuizSetup();
  } else showHome();
}

/**
 * Fits the layout to what the phone keyboard leaves visible. Android can resize the page
 * itself (see the viewport meta tag), but iOS lays the keyboard over the page instead.
 */
function trackVisibleArea() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    // Pinch-zooming shrinks the visual viewport too, and the layout should not follow that.
    const zoomed = vv.scale > 1.01;
    if (zoomed) {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    } else {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
    }
    root.classList.toggle("short", (zoomed ? window.innerHeight : vv.height) < 560);
  };
  vv.addEventListener("scroll", update);
  vv.addEventListener("resize", () => {
    update();
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && panel.contains(focused)) focused.scrollIntoView({ block: "nearest" });
  });
  update();
}

// ---------------------------------------------------------------- home

function showHome() {
  if (session) lastSession = session;
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  globe.setKnowledge(new Map());
  globe.spin(true);
  updateCounts();

  if (deck.isFresh) return showWelcome();
  // Answers since the last quiz may change what it filled in.
  deck.refreshEstimate();

  const c = deck.counts();
  const p = deck.progress();
  panel.innerHTML = `
    <h1>Where were we?</h1>
    ${lastSession && lastSession.answered ? `<p>Last round: <b>${lastSession.correct}</b> of <b>${lastSession.answered}</b> right.</p>` : ""}
    <div class="stats">
      <div class="stat"><b>${c.due}</b><span>due now</span></div>
      <div class="stat"><b>${c.learning}</b><span>learning</span></div>
      <div class="stat"><b>${c.started}</b><span>of ${c.total} started</span></div>
    </div>
    <button class="btn primary wide" id="start">Start</button>
    <p class="muted" style="margin-top:12px">${p.reviewing} cards in long-term memory · ${p.answers} answers so far</p>
    <div id="legend"></div>
    <div class="row">
      <button class="link" id="quiz">How many countries do you know? Take the quiz</button>
      <button class="link" id="stats">How it's going</button>
      <button class="link" id="settings">Settings and your data</button>
    </div>
  `;
  showKnowledge($("#legend"));
  $("#start").onclick = () => startRound();
  $("#quiz").onclick = showQuizSetup;
  $("#stats").onclick = showStats;
  $("#settings").onclick = showSettings;
}

function showWelcome() {
  panel.innerHTML = `
    <h1>Geography, in small doses</h1>
    <p class="muted">Learn the countries with spaced repetition. Anything you don't know, you'll
      keep seeing until you do.</p>
    <p>How many countries do you know? Find out with a quick quiz, and you'll start learning from
      there.</p>
    <div class="row">
      <button class="btn primary" id="quiz">Take the quiz</button>
      <button class="btn" id="scratch">Start from scratch</button>
    </div>
    <div class="row" style="margin-top:12px"><button class="link" id="settings">Settings and your data</button></div>
  `;
  $("#quiz").onclick = showQuizSetup;
  $("#scratch").onclick = () => startRound();
  $("#settings").onclick = showSettings;
}

const KNOWLEDGE_LABELS: [Knowledge, string][] = [
  ["known", "Known"],
  ["learning", "Learning"],
  ["weak", "Needs work"],
];

/** Colours the globe by what the player knows, with a key and a choice of skill in `legend`. */
function showKnowledge(legend: HTMLElement) {
  const knowledge = colourGlobe();
  if (!deck.counts().started) {
    legend.innerHTML = "";
    return;
  }

  const modes: [string | null, string][] = [[null, "All"], ...GLOBE_MODES.map((m): [string, string] => [m.id, m.label])];
  legend.innerHTML = `<div class="legend">
    <div class="modes" role="group" aria-label="Colour the globe by">
      ${modes.map(([id, label]) => `<button data-mode="${id ?? ""}" aria-pressed="${id === globeMode}">${label}</button>`).join("")}
    </div>
    ${knowledgeKey(knowledge)}
  </div>`;
  legend.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => {
    b.onclick = () => {
      globeMode = b.dataset.mode || null;
      showKnowledge(legend);
    };
  });
}

/** Colours the globe by what the player knows, in the current `globeMode`. */
function colourGlobe(): Map<string, Knowledge> {
  const types = GLOBE_MODES.find((m) => m.id === globeMode)?.types ?? QUESTION_TYPES.map((q) => q.type);
  const knowledge = deck.knowledge(types);
  globe.setKnowledge(knowledge);
  return knowledge;
}

/** "Known 12 · Learning 30 · Needs work 4", with swatches matching the globe. */
function knowledgeKey(knowledge: Map<string, Knowledge>) {
  const tally = (kind: Knowledge) => [...knowledge.values()].filter((k) => k === kind).length;
  return `<div class="key">
    ${KNOWLEDGE_LABELS.map(([kind, label]) => `<span><i class="swatch ${kind}"></i>${label} <b>${tally(kind)}</b></span>`).join("")}
  </div>`;
}

function startRound() {
  session = { answered: 0, correct: 0, recent: [] };
  nextQuestion();
}

function updateCounts() {
  const c = deck.counts();
  const q = session?.quiz?.quiz;
  if (q) counts.textContent = `Quiz ${q.done} of ${q.total}`;
  else if (session) counts.textContent = `${session.correct}/${session.answered} right · ${c.due} due`;
  else counts.textContent = deck.isFresh ? "" : `${c.due} due · ${c.learning} learning`;
  counts.hidden = !counts.textContent;
  // Opens the stats between rounds; during one it would lose the question.
  counts.disabled = !!session;
}

// ---------------------------------------------------------------- questions

function nextQuestion() {
  const s = session!;
  let prompt: Prompt | null | undefined;
  if (s.quiz) {
    const q = s.quiz.quiz.next();
    prompt = q && deck.prompt(q.id, q.type);
  } else prompt = deck.next(s.recent);
  doneButton.hidden = false;
  globe.spin(false);
  globe.setHighlights([]);
  // The colours would give answers away during a round.
  globe.setKnowledge(new Map());
  updateCounts();
  if (!prompt) return s.quiz ? showQuizResults() : showNothingToAsk();

  const { country, type } = prompt;
  const intro = s.quiz
    ? `<p class="muted">Question ${s.quiz.quiz.done + 1} of ${s.quiz.quiz.total}</p>`
    : prompt.isNew
      ? `<p class="muted">New card</p>`
      : "";

  switch (type) {
    case "locate":
    case "capitalLocate": {
      const question =
        type === "locate"
          ? `Where is <b>${esc(the(country.name))}</b>?`
          : `Which country has the capital <b>${esc(country.capitals.join(" / "))}</b>?`;
      panel.innerHTML = `${intro}<h2>${question}</h2>
        <p class="muted">Tap it on the globe. Drag to turn, pinch or scroll to zoom.</p>
        <button class="btn" id="skip">I don't know</button>`;
      globe.zoomOutTo(2.5);
      globe.onTap = (shape, x, y) => {
        // Near-misses count: a few pixels over a border, or a little further when the tap
        // lands in open sea next to an island country.
        const hitTarget = shape?.id === country.id || globe.isNear(country.id, x, y, shape ? 6 : 14);
        if (hitTarget) {
          globe.onTap = undefined;
          return finish(prompt, { result: "exact" });
        }
        // A tap on open ocean is usually a slip, so it does not count as an answer.
        if (!shape) return;
        globe.onTap = undefined;
        const tapped = (shape.id && world.byId.get(shape.id)?.name) || shape.name;
        finish(prompt, { result: "wrong", matched: tapped }, { tappedId: shape.id });
      };
      $("#skip").onclick = () => finish(prompt, { result: "wrong" }, { skipped: true });
      break;
    }
    case "identify":
    case "flag":
    case "capital": {
      const question = {
        identify: "Which country is highlighted?",
        flag: "Which country has this flag?",
        capital: `What is the capital of <b>${esc(the(country.name))}</b>?`,
      }[type];
      const flag = type === "flag" ? `<img class="flag" src="${flagUrl(country)}" alt="A flag">` : "";
      panel.innerHTML = `${intro}<h2>${question}</h2>${flag}
        <form class="answer" autocomplete="off">
          <input id="typed" type="text" enterkeyhint="done" autocapitalize="words" autocorrect="off"
            spellcheck="false" placeholder="${type === "capital" ? "Capital city" : "Country"}" aria-label="Your answer">
          <button class="btn primary">Check</button>
        </form>
        <button class="btn" id="skip">I don't know</button>`;
      if (type !== "flag") {
        globe.setHighlights([[country.id, "target"]]);
        globe.flyTo(country.id);
      }
      globe.onTap = undefined;
      const input = $<HTMLInputElement>("#typed");
      input.focus();
      panel.querySelector("form")!.onsubmit = (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        const set = type === "capital" ? capitals : names;
        const verdict = set.check(country.id, input.value);
        const typed = input.value.trim();
        // Chad for Romania is as good as anyone can do from the picture.
        const twin = type === "flag" && verdict.result === "wrong" ? verdict.matchedKey : undefined;
        if (twin && identicalFlags(country.id, twin)) finish(prompt, { result: "close" }, { typed, sameFlag: twin });
        else finish(prompt, verdict, { typed });
      };
      $("#skip").onclick = () => finish(prompt, { result: "wrong" }, { skipped: true });
      break;
    }
    case "population":
    case "gdpPerCapita": {
      const population = type === "population";
      const question = population
        ? `What is the population of <b>${esc(the(country.name))}</b>?`
        : `What is the GDP per capita of <b>${esc(the(country.name))}</b>?`;
      const hint = population
        ? "In millions: 68 for 68 million, 0.5 for half a million."
        : "In thousands of US dollars, at market rates: 45 for $45,000, 0.8 for $800.";
      // A number keypad on phones; typed letters ("34m", "45k") still work on a keyboard.
      panel.innerHTML = `${intro}<h2>${question}</h2>
        <form class="answer" autocomplete="off">
          ${population ? "" : `<span class="unit">$</span>`}
          <input id="typed" type="text" inputmode="decimal" enterkeyhint="done" autocorrect="off"
            spellcheck="false" placeholder="${population ? "Millions" : "Thousands"}" aria-label="Your answer"
            aria-describedby="hint">
          <span class="unit">${population ? "million" : "thousand"}</span>
          <button class="btn primary">Check</button>
        </form>
        <p class="muted hint" id="hint">${hint}</p>
        <button class="btn" id="skip">I don't know</button>`;
      globe.setHighlights([[country.id, "target"]]);
      globe.flyTo(country.id);
      globe.onTap = undefined;
      const input = $<HTMLInputElement>("#typed");
      input.focus();
      panel.querySelector("form")!.onsubmit = (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        const guess = population ? readPopulation(input.value) : readDollars(input.value);
        const actual = population ? country.population?.value : country.gdpPerCapita?.value;
        if (guess === null || actual === undefined) {
          const hintEl = $("#hint");
          hintEl.textContent = `That doesn't look like a number. ${hint}`;
          hintEl.classList.add("error");
          return;
        }
        finish(prompt, { result: gradeAmount(guess, actual, type) }, { typed: input.value.trim(), guess });
      };
      $("#skip").onclick = () => finish(prompt, { result: "wrong" }, { skipped: true });
      break;
    }
  }
}

interface AnswerDetail {
  skipped?: boolean;
  typed?: string;
  /** Map shape tapped by mistake on a globe question. */
  tappedId?: string;
  /** The number read from a typed population or GDP answer. */
  guess?: number;
  /** The country named for a flag all but identical to the right one, which counts as close. */
  sameFlag?: string;
}

function finish(prompt: Prompt, verdict: Verdict, detail: AnswerDetail = {}) {
  const s = session!;
  const right = verdict.result !== "wrong";
  const grade: Grade = verdict.result === "exact" ? Rating.Good : verdict.result === "close" ? Rating.Hard : Rating.Again;
  let overrule: () => void;
  if (s.quiz) {
    const run = s.quiz;
    // The country tapped instead, or whose name or capital was typed.
    const mixedUpWith = verdict.result === "wrong" ? (detail.tappedId ?? verdict.matchedKey) : undefined;
    run.quiz.record(prompt.country.id, prompt.type, right, mixedUpWith);
    run.graded.push({ prompt, grade, mixedUpWith });
    overrule = () => {
      run.quiz.overruleLast();
      run.graded[run.graded.length - 1] = { prompt, grade: Rating.Good };
    };
  } else {
    const undo = deck.answer(prompt, grade);
    overrule = () => {
      undo();
      deck.answer(prompt, Rating.Good);
    };
  }
  s.answered++;
  if (right) s.correct++;
  s.recent = [prompt.country.id, ...s.recent.filter((id) => id !== prompt.country.id)].slice(0, RECENT_KEPT);
  showFeedback(prompt, verdict, detail, overrule);
}

/** `overrule` turns the answer into a correct one, for the "I was right" button. */
function showFeedback(prompt: Prompt, verdict: Verdict, answer: AnswerDetail, overrule: () => void) {
  const { country, type } = prompt;
  const { skipped, typed, tappedId, sameFlag } = answer;
  const right = verdict.result !== "wrong";
  const onGlobe = type === "locate" || type === "capitalLocate";
  // The country tapped instead, or whose name or capital was typed.
  const otherId = verdict.result === "wrong" ? (tappedId ?? verdict.matchedKey) : undefined;
  updateCounts();

  globe.setHighlights([[country.id, right ? "correct" : "target"], ...(otherId ? [[otherId, "wrong"] as [string, "wrong"]] : [])]);
  globe.flyTo(country.id);

  const expected = type === "capital" ? country.capitals.join(" / ") : country.name;
  const amount = (AMOUNT_TYPES as readonly QuestionType[]).includes(type);
  let headline: string;
  let detail = "";
  // A flag named instead that looks much like this one, to show the two side by side.
  let pairedFlag = sameFlag;
  if (amount) ({ headline, detail } = amountFeedback(prompt, verdict, answer));
  else if (verdict.result === "exact") headline = `<p class="verdict good">Correct</p>`;
  else if (sameFlag) {
    const same = identicalFlagFeedback(country);
    headline = `<p class="verdict close">${esc(same.headline)}</p>`;
    detail = same.detail;
  } else if (verdict.result === "close") {
    const spelt = `${esc(expected)}${stop(expected)}`;
    headline = `<p class="verdict close">${oneOf("misspelt", [
      `Correct, more or less. It's spelt ${spelt}`,
      `Close enough. Officially, it's spelt ${spelt}`,
      `We'll allow it. It's spelt ${spelt}`,
    ])}</p>`;
  } else {
    const matched = verdict.result === "wrong" ? verdict.matched : undefined;
    const otherCountry = otherId ? world.byId.get(otherId) : undefined;
    const wrong = wrongFeedback({
      type,
      country,
      skipped,
      typed,
      other: matched ? { ...otherCountry, id: otherId, name: matched } : undefined,
      near: otherId ? nearness(world, country.id, otherId) : undefined,
      typedCapital: !!typed && (type === "identify" || type === "flag") && capitals.check(country.id, typed).result !== "wrong",
    });
    headline = `<p class="verdict bad">${esc(wrong.headline)}</p>`;
    detail = wrong.detail;
    if (wrong.miss === "lookalike") pairedFlag = otherId;
  }
  const paired = pairedFlag ? world.byId.get(pairedFlag) : undefined;

  // Overruling only makes sense for typed names, e.g. a spelling the game does not know. A
  // number is shown back as it was read, so there is nothing to overrule.
  const canOverrule = !right && !skipped && !onGlobe && !amount;
  panel.innerHTML = `${headline}${detail ? `<p>${detail}</p>` : ""}
    ${paired ? flagPair(country, paired) : ""}
    ${factsCard(country)}
    <div class="row">
      <button class="btn primary" id="next">Next</button>
      ${canOverrule ? `<button class="link" id="overrule">I was right</button>` : ""}
    </div>`;
  const next = $<HTMLButtonElement>("#next");
  next.onclick = nextQuestion;
  // Focus without scrolling so a phone keyboard closing does not jump the layout.
  next.focus({ preventScroll: true });
  if (canOverrule) {
    $("#overrule").onclick = () => {
      overrule();
      session!.correct++;
      showFeedback(prompt, { result: "exact" }, { typed }, () => {});
    };
  }
}

/** Feedback for a population or GDP answer: the real figure and how far off the guess was. */
function amountFeedback({ country, type }: Prompt, verdict: Verdict, { skipped, guess }: AnswerDetail) {
  const population = type === "population";
  const figure = (population ? country.population : country.gdpPerCapita)!;
  const format = population ? formatPopulation : formatDollars;
  const headline =
    verdict.result === "exact"
      ? `<p class="verdict good">Correct</p>`
      : verdict.result === "close"
        ? `<p class="verdict close">Close</p>`
        : `<p class="verdict bad">${esc(amountHeadline(skipped ? undefined : guess, figure.value))}</p>`;
  const what = population ? `The population of ${the(country.name)}` : `GDP per capita in ${the(country.name)}`;
  let detail = `${esc(what)} is <b>${format(figure.value)}</b> (World Bank, ${esc(figure.year)}).`;
  if (guess !== undefined) detail += ` You said ${format(guess)}, ${describeMiss(guess, figure.value)}.`;
  return { headline, detail };
}

/** This flag next to the look-alike that was named instead, to learn the difference from. */
function flagPair(asked: Country, named: Country) {
  const figure = (c: Country, label: string) => `<figure>
      <img src="${flagUrl(c)}" alt="Flag of ${esc(c.name)}">
      <figcaption><strong>${esc(c.name)}</strong><span class="muted">${label}</span></figcaption>
    </figure>`;
  return `<div class="flag-pair">${figure(asked, "This flag")}${figure(named, "Your answer")}</div>`;
}

function factsCard(c: Country) {
  const figures = [
    c.population && `${formatPopulation(c.population.value)} people`,
    c.gdpPerCapita && `${formatDollars(c.gdpPerCapita.value)} per person`,
  ].filter(Boolean);
  return `<div class="facts">
    <img src="${flagUrl(c)}" alt="Flag of ${esc(c.name)}">
    <strong>${esc(c.name)}</strong>
    <span>Capital: ${esc(c.capitals.join(", ") || "none")}</span>
    <span class="muted">${esc(c.subregion || c.region)}</span>
    <span class="muted">${figures.join(" · ")}</span>
  </div>`;
}

// ---------------------------------------------------------------- quiz

function showQuizSetup() {
  if (session) lastSession = session;
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  globe.setKnowledge(new Map());
  globe.spin(true);
  updateCounts();

  panel.innerHTML = `<h2>How many countries do you know?</h2>
    <p class="muted">The quiz adapts to your answers, getting harder when you're right and easier when
      you're not. At the end you'll get an estimate of how much you know, and your practice starts from
      there.</p>
    <fieldset><legend>Quiz me on</legend>
      ${SKILLS.map(
        (s) => `<label class="check"><input type="checkbox" data-skill="${s.skill}" ${quizChoice.skills.includes(s.skill) ? "checked" : ""}>
          <span>${s.label} <span class="muted">· ${s.hint}</span></span></label>`,
      ).join("")}
    </fieldset>
    <fieldset><legend>Length</legend>
      <div class="modes" role="group" aria-label="Quiz length">
        ${QUIZ_LENGTHS.map((l) => `<button data-length="${l.id}">${l.label}</button>`).join("")}
      </div>
      <p class="muted" id="quiz-size"></p>
    </fieldset>
    <div class="row">
      <button class="btn primary" id="go">Start the quiz</button>
      <button class="btn" id="back">Back</button>
    </div>`;

  const update = () => {
    const n = quizSize(quizChoice.length, quizChoice.skills.length);
    // About ten seconds a question.
    $("#quiz-size").textContent = n ? `${n} questions, about ${Math.max(1, Math.round(n / 6))} minutes.` : "Pick at least one.";
    $<HTMLButtonElement>("#go").disabled = n === 0;
    panel.querySelectorAll<HTMLButtonElement>("[data-length]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.length === quizChoice.length));
    });
  };
  panel.querySelectorAll<HTMLInputElement>("[data-skill]").forEach((box) => {
    box.onchange = () => {
      quizChoice.skills = [...panel.querySelectorAll<HTMLInputElement>("[data-skill]:checked")].map((b) => b.dataset.skill as Skill);
      update();
    };
  });
  panel.querySelectorAll<HTMLButtonElement>("[data-length]").forEach((b) => {
    b.onclick = () => {
      quizChoice.length = b.dataset.length as QuizLength;
      update();
    };
  });
  $("#go").onclick = startQuiz;
  $("#back").onclick = showHome;
  update();
}

function startQuiz() {
  const quiz = new Quiz(deck.model, quizChoice.skills, quizChoice.length, (id, type) => !!deck.prompt(id, type));
  session = {
    answered: 0,
    correct: 0,
    recent: [],
    quiz: { quiz, graded: [], applied: 0, remembered: 0, missed: 0, length: quizChoice.length },
  };
  nextQuestion();
}

function showQuizResults() {
  const run = session!.quiz!;
  const { quiz } = run;
  if (!quiz.done) return showHome();
  const outcome = deck.applyQuiz(quiz.skills, run.graded.slice(run.applied), run.applied > 0);
  run.applied = run.graded.length;
  run.remembered += outcome.remembered;
  run.missed += outcome.missed;
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  // Held still and zoomed out, to show off the coloured map below.
  globe.spin(false);
  globe.zoomOutTo(1);
  updateCounts();

  const results = quiz.results();
  if (!run.counted) {
    run.counted = true;
    countQuiz(results, run.length);
  }
  const [main, ...others] = results;
  const areas = quiz.areas();
  const edge = edgeOf(quiz, main.skill);
  // The countries just out of reach become the first new cards, so the line below can say so.
  const firstType = skillInfo(main.skill).types[0];
  const learnFirst = deck
    .putFirst(edge.outside.flatMap((id) => deck.prompt(id, firstType)?.key ?? []))
    .map((key) => key.split("|")[0]);
  const offerMore = !!edge.text || results.some((r) => r.high - r.low > NARROW_ABOVE);
  const { remembered, missed } = run;
  const missedOnes = missed === 1 ? "the one you missed" : `the ${missed} you missed`;
  const firstNames = listed(learnFirst.map((id) => esc(the(world.byId.get(id)!.name))));
  const notes = [
    remembered &&
      `${remembered === 1 ? "The one you got right is" : `The ${remembered} you got right are`} now in long-term
       memory, so ${remembered === 1 ? "it'll" : "they'll"} only come back in a month or two.`,
    outcome.inferred &&
      `We've also marked ${outcome.inferred} ${outcome.inferred === 1 ? "card" : "cards"} you very likely know. We'll
       still quiz you on the ones we're less sure of over the next few weeks, just to double-check.`,
    learnFirst.length
      ? `When you start learning, ${missed ? `you'll get another go at ${missedOnes}, then move on` : "you'll go straight"} to new
         ones, starting with ${firstNames}.`
      : missed && `When you start learning, you'll get another go at ${missedOnes} first.`,
  ].filter(Boolean);

  panel.innerHTML = `<div class="result">
      <p class="result-lead">You know about</p>
      <p class="result-number">${Math.round(main.known)}</p>
      <p class="result-of">of ${main.of} ${skillInfo(main.skill).noun}</p>
      ${hasRange(main) ? `<p class="muted">Probably between ${Math.round(main.low)} and ${Math.round(main.high)}</p>` : ""}
      ${
        others.length
          ? `<div class="result-others">${others
              .map(
                (r) => `<div><b>${Math.round(r.known)}</b> ${skillInfo(r.skill).noun}
                  ${hasRange(r) ? `<span class="muted">${Math.round(r.low)} to ${Math.round(r.high)}</span>` : ""}</div>`,
              )
              .join("")}</div>`
          : ""
      }
    </div>
    ${areas ? `<p>You know ${esc(areas.strongest)} best, and ${esc(areas.weakest)} least.</p>` : ""}
    ${edge.text ? `<p>${edge.text} Sound about right? If not, a few more questions will help us get it right.</p>` : ""}
    <div class="row">
      ${offerMore ? `<button class="btn" id="narrow">Narrow it down: ${NARROW_MORE} more</button>` : ""}
      <button class="btn" id="share">Share your result</button>
    </div>
    <p class="muted" id="share-note" hidden></p>
    ${notes.map((n) => `<p>${n}</p>`).join("")}
    <div id="legend"></div>
    <div class="row">
      <button class="btn primary" id="go">Learn the rest</button>
      <button class="btn" id="home">Home</button>
    </div>`;

  showQuizMap($("#legend"), quiz, null);
  // A country named in the edge line, tapped: show it on the globe.
  panel.querySelectorAll<HTMLButtonElement>("[data-fly]").forEach((b) => {
    b.onclick = () => {
      globe.setHighlights([[b.dataset.fly!, "target"]]);
      globe.flyTo(b.dataset.fly!);
    };
  });
  $<HTMLButtonElement>("#share").onclick = (e) => shareResult(e.currentTarget as HTMLButtonElement, results);
  if (offerMore) {
    $("#narrow").onclick = () => {
      quiz.extend(NARROW_MORE);
      session = { answered: 0, correct: 0, recent: [], quiz: run };
      nextQuestion();
    };
  }
  $("#go").onclick = () => startRound();
  $("#home").onclick = showHome;
}

/**
 * The countries at the edge of what the player knows in a skill (see `Quiz.edge()`), and a line
 * about them: "You probably know A, B and C, but X, Y and Z are likely just out of reach", each
 * name a button that shows it on the globe. `outside` is left empty when the line doesn't name
 * them, and `text` when there is nothing to say (or for population and GDP, where it would read
 * oddly).
 */
function edgeOf(quiz: Quiz, skill: Skill): { text: string; outside: string[] } {
  if (skill === "population" || skill === "gdp") return { text: "", outside: [] };
  const { inside, outside } = quiz.edge(skill);
  const names = (ids: string[]) =>
    listed(ids.map((id) => `<button class="link inline" data-fly="${id}">${esc(the(world.byId.get(id)!.name))}</button>`));
  // "the flags of ..." and "those of ..." for flags and capitals; just the countries for maps.
  const of = skill === "map" ? "" : `the ${skillInfo(skill).noun} of `;
  const those = skill === "map" ? "" : "those of ";
  const known = inside.length >= 2;
  const unknown = outside.length >= 2;
  if (known && unknown) {
    return { text: `You probably know ${of}${names(inside)}, but ${those}${names(outside)} are likely just out of reach.`, outside };
  }
  if (known) return { text: `You probably even know ${of}${names(inside)}.`, outside: [] };
  if (unknown) return { text: `Likely just out of reach: ${of}${names(outside)}.`, outside };
  return { text: "", outside: [] };
}

/** Colours the globe by what the quiz thinks the player knows, for one skill or all of them. */
function showQuizMap(legend: HTMLElement, quiz: Quiz, mode: Skill | null) {
  const skills = mode ? [mode] : quiz.skills;
  const knowledge = new Map<string, Knowledge>();
  for (const c of world.countries) {
    const p = skills.reduce((sum, s) => sum + quiz.chance(c.id, s), 0) / skills.length;
    knowledge.set(c.id, p >= 0.75 ? "known" : p >= 0.35 ? "learning" : "weak");
  }
  globe.setKnowledge(knowledge);

  const modes: [Skill | null, string][] = [[null, "All"], ...quiz.skills.map((s): [Skill, string] => [s, skillInfo(s).label])];
  legend.innerHTML = `<div class="legend">
    ${
      quiz.skills.length > 1
        ? `<div class="modes" role="group" aria-label="Colour the globe by">
            ${modes.map(([id, label]) => `<button data-mode="${id ?? ""}" aria-pressed="${id === mode}">${label}</button>`).join("")}
          </div>`
        : ""
    }
    <div class="key">
      <span><i class="swatch known"></i>Likely known</span>
      <span><i class="swatch learning"></i>Not sure</span>
      <span><i class="swatch weak"></i>Not yet</span>
    </div>
  </div>`;
  legend.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => {
    b.onclick = () => showQuizMap(legend, quiz, (b.dataset.mode || null) as Skill | null);
  });
}

/**
 * Shares the result with a link that opens the quiz: the share sheet on phones, the clipboard
 * elsewhere, or the text to copy by hand when neither works.
 */
async function shareResult(button: HTMLButtonElement, results: SkillResult[]) {
  const [main, ...others] = results;
  const noun = (r: SkillResult) => skillInfo(r.skill).noun;
  // The likely range is an 80% one (RANGE_Z in knowledge.ts); only the first count gets it.
  const lead = hasRange(main)
    ? `I'm 80% sure I know between ${Math.round(main.low)} and ${Math.round(main.high)} of ${main.of} ${noun(main)}`
    : `I know ${Math.round(main.known)} of ${main.of} ${noun(main)}`;
  const rest = others.length ? `, plus about ${listed(others.map((r) => `${Math.round(r.known)} ${noun(r)}`))}` : "";
  const text = `${lead}${rest} 🌍 How many do you know?`;
  const url = `${location.origin}${import.meta.env.BASE_URL}?quiz`;
  const note = $("#share-note");
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text, url });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    button.textContent = "Copied";
    note.textContent = "Copied to the clipboard, ready to paste anywhere.";
  } catch {
    note.textContent = `${text} ${url}`;
  }
  note.hidden = false;
}

/** False once a count's likely range has narrowed to a single number. */
function hasRange(r: SkillResult) {
  return Math.round(r.low) !== Math.round(r.high);
}

/** "a, b and c" */
function listed(parts: string[]) {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Ends a round, first suggesting a few more if it was very short. */
function stopRound() {
  const s = session;
  if (!s || s.nudged || s.answered === 0 || s.answered >= NUDGE_BELOW) return showHome();
  s.nudged = true;
  doneButton.hidden = true;
  globe.onTap = undefined;
  const left = NUDGE_BELOW - s.answered;
  panel.innerHTML = `<h2>Stopping already?</h2>
    <p>You've answered ${s.answered}. ${left === 1 ? "One more?" : `${left} more?`}</p>
    <div class="row">
      <button class="btn primary" id="more">Keep going</button>
      <button class="btn" id="stop">Stop here</button>
    </div>`;
  $("#more").onclick = nextQuestion;
  $("#stop").onclick = showHome;
  $<HTMLButtonElement>("#more").focus({ preventScroll: true });
}

/** Only reached when every question type is switched off. */
function showNothingToAsk() {
  panel.innerHTML = `<h2>Nothing to ask</h2>
    <p>Every question type is switched off. Turn one back on in Settings.</p>
    <div class="row">
      <button class="btn primary" id="settings">Settings</button>
      <button class="btn" id="home">Home</button>
    </div>`;
  $("#settings").onclick = showSettings;
  $("#home").onclick = showHome;
}

// ---------------------------------------------------------------- stats

/** Weeks in the calendar: about six months. */
const CALENDAR_WEEKS = 26;
/** The daily average and the share remembered cover this many days. */
const STATS_DAYS = 30;
/** Below this many cards come back, the share remembered is a count ("7 of 8"), not a percentage. */
const RECALL_MIN = 10;
/** The lines of countries known go back this many days at most. */
const KNOWN_DAYS_SHOWN = 90;

/** How it's going: streak, calendar, daily average, share remembered, and what's known over time. */
function showStats() {
  if (session) lastSession = session;
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  globe.spin(true);
  updateCounts();
  const knowledge = colourGlobe();

  const now = new Date();
  const today = dateKey(now);
  const s = summarize(deck.history(), now, STATS_DAYS);
  if (!s.days.size) {
    panel.innerHTML = `<h2>How it's going</h2>
      <p>Nothing to show yet. Answer a few questions and come back.</p>
      <button class="btn primary" id="back">Back</button>`;
    $("#back").onclick = showHome;
    return;
  }

  const streakNote =
    s.streak && !s.playedToday ? "play today to keep it" : s.longestStreak > s.streak ? `best ${s.longestStreak}` : s.streak > 1 ? "your best yet" : "";
  const perDay = s.perDay < 10 ? String(Math.round(s.perDay * 10) / 10) : String(Math.round(s.perDay));
  const recall =
    s.reviews >= RECALL_MIN
      ? `${Math.round((100 * s.remembered) / s.reviews)}%`
      : s.reviews
        ? `${s.remembered} of ${s.reviews}`
        : "Soon";

  panel.innerHTML = `<h2>How it's going</h2>
    <div class="stats">
      <div class="stat"><b>${s.streak}</b><span>${s.streak === 1 ? "day" : "days"} in a row</span>
        ${streakNote ? `<small>${streakNote}</small>` : ""}</div>
      <div class="stat"><b>${perDay}</b><span>answers a day</span>
        <small>${s.averagedOver >= STATS_DAYS ? `last ${STATS_DAYS} days` : "so far"}</small></div>
      <div class="stat"><b>${recall}</b><span>remembered</span>
        <small>${s.reviews ? "when cards came back" : "once cards come back"}</small></div>
    </div>
    ${calendarHtml(s.days, today)}
    <h3>What you know</h3>
    <p class="muted">Countries you'd very likely still get right in two weeks. Tap one to colour the globe.</p>
    ${knownHtml(today)}
    <div id="stats-key">${knowledgeKey(knowledge)}</div>
    <p class="muted"><b>Remembered</b> is how many cards you still knew when they came back, of those you'd
      got right before, over the last ${STATS_DAYS} days. The schedule aims for about 9 in 10, bringing each card
      back just before you'd forget it, so a few misses are part of the plan.</p>
    <button class="btn primary" id="back">Back</button>`;

  // A day in the calendar, pointed at or tapped: its count in the line below.
  const grid = $(".calendar");
  const note = $("#cal-note");
  const summary = note.textContent;
  grid.addEventListener("pointerover", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-date]");
    if (cell) note.textContent = dayNote(cell.dataset.date!, today, Number(cell.dataset.n), Number(cell.dataset.new));
  });
  grid.addEventListener("pointerleave", (e) => {
    // On a touch screen the finger lifting counts as leaving; keep the tapped day showing.
    if (e.pointerType === "mouse") note.textContent = summary;
  });

  panel.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((b) => {
    b.onclick = () => {
      globeMode = globeMode === b.dataset.group ? null : b.dataset.group!;
      panel.querySelectorAll("[data-group]").forEach((o) => o.setAttribute("aria-pressed", String(o === b && !!globeMode)));
      $("#stats-key").innerHTML = knowledgeKey(colourGlobe());
    };
  });
  panel.querySelectorAll<SVGSVGElement>("svg.spark").forEach(followSparkline);
  $("#back").onclick = showHome;
}

/** The calendar of answers per day, with a line under it that shows a day's count when pointed at. */
function calendarHtml(days: Map<string, { answers: number; new: number }>, today: string) {
  const weeks = calendar(days, today, CALENDAR_WEEKS);
  const shown = weeks.flat().filter((d) => !d.future);
  const typical = typicalDay(shown);
  const played = shown.filter((d) => d.answers).length;
  const total = shown.reduce((sum, d) => sum + d.answers, 0);

  // A column is labelled with its month when the month changes; the first only if there's room.
  const month = (w: number) => weeks[w][0].date.slice(0, 7);
  const labelled = weeks.map((_, w) => w > 0 && month(w) !== month(w - 1));
  const firstChange = labelled.indexOf(true);
  labelled[0] = firstChange === -1 || firstChange >= 3;

  const cell = (d: CalendarDay) =>
    d.future
      ? `<i class="day future"></i>`
      : `<i class="day s${shade(d.answers, typical)}${d.date === today ? " today" : ""}" data-date="${d.date}"
          data-n="${d.answers}" data-new="${d.new}"></i>`;
  const columns = weeks.map(
    (week, w) => `<span class="cal-month">${labelled[w] ? monthName(week[0].date) : ""}</span>${week.map(cell).join("")}`,
  );
  const summary = `${total} ${total === 1 ? "answer" : "answers"} on ${played} ${played === 1 ? "day" : "days"} in the last six months.`;
  return `<div class="calendar-wrap">
    <div class="calendar" style="--weeks:${CALENDAR_WEEKS}" aria-hidden="true">${columns.join("")}</div>
    <div class="cal-foot">
      <span id="cal-note">${summary}</span>
      <span class="cal-key" aria-hidden="true">Less ${[0, 1, 2, 3, 4].map((n) => `<i class="day s${n}"></i>`).join("")} More</span>
    </div>
  </div>`;
}

/** "Mon 3 Nov: 42 answers, 8 new" */
function dayNote(date: string, today: string, answers: number, fresh: number) {
  const day = date === today ? "Today" : shortDate(date, true);
  const count = answers === 0 ? "no answers" : answers === 1 ? "1 answer" : `${answers} answers`;
  return `${day}: ${count}${fresh ? `, ${fresh} new` : ""}`;
}

/**
 * A tile per group of question types (as on the globe): countries known, out of how many, and,
 * once there are a few days to go on, a line of how that has grown and the change in the last week.
 */
function knownHtml(today: string) {
  const history = deck.knownHistory().filter(([date]) => daysBetween(date, today) <= KNOWN_DAYS_SHOWN);
  const tiles = deck.knownNow().map(({ id, label, known, of }) => {
    const series = history.flatMap(([date, counts]): [string, number][] => (counts[id] === undefined ? [] : [[date, counts[id]]]));
    const moved = change(series, today);
    const line = moved
      ? `${moved.by > 0 ? "+" : moved.by < 0 ? "−" : ""}${moved.by ? Math.abs(moved.by) : "no change"} since ${shortDate(moved.since)}`
      : "";
    return `<button class="known" data-group="${id}" aria-pressed="${id === globeMode}">
      <span class="known-label">${label}</span>
      <span class="known-count"><b>${known}</b> of ${of}</span>
      ${series.length >= 2 ? sparkline(series) : ""}
      <span class="known-change">${line}</span>
    </button>`;
  });
  const tracked = history.length >= 2;
  return `<div class="known-grid">${tiles.join("")}</div>
    ${tracked ? "" : `<p class="muted">Counting from today. A line of how each one grows fills in as you play.</p>`}`;
}

/** A small line chart of `series`, scaled to fit, with the points kept for `followSparkline`. */
function sparkline(series: [string, number][]) {
  const [first] = series[0];
  const span = Math.max(1, daysBetween(first, series[series.length - 1][0]));
  const values = series.map(([, v]) => v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // A change of one or two shouldn't fill the whole height.
  if (hi - lo < 6) {
    const mid = (hi + lo) / 2;
    [lo, hi] = [mid - 3, mid + 3];
  }
  const points = series.map(([date, v]) => [(100 * daysBetween(first, date)) / span, 26 - (22 * (v - lo)) / (hi - lo)]);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"
      data-points='${JSON.stringify(series.map(([date, v], i) => [date, v, points[i][0]]))}'>
    <path d="${path}" />
    <line class="spark-at" y1="0" y2="30" visibility="hidden" />
  </svg>`;
}

/** Pointing along a sparkline shows the count on that day in place of the change under it. */
function followSparkline(svg: SVGSVGElement) {
  const points: [string, number, number][] = JSON.parse(svg.dataset.points!);
  const marker = svg.querySelector<SVGLineElement>(".spark-at")!;
  const label = svg.parentElement!.querySelector(".known-change")!;
  const usual = label.textContent;
  svg.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const x = (100 * (e.clientX - box.left)) / box.width;
    const [date, value, at] = points.reduce((best, p) => (Math.abs(p[2] - x) < Math.abs(best[2] - x) ? p : best));
    marker.setAttribute("x1", String(at));
    marker.setAttribute("x2", String(at));
    marker.setAttribute("visibility", "visible");
    label.textContent = `${shortDate(date)}: ${value}`;
  });
  svg.addEventListener("pointerleave", () => {
    marker.setAttribute("visibility", "hidden");
    label.textContent = usual;
  });
}

/** "3 Nov", or "Mon 3 Nov" with the weekday. Always in English, like the rest of the game. */
function shortDate(date: string, weekday = false) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(weekday && { weekday: "short" }) });
}

/** "Nov" for "2026-11-03". */
function monthName(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

// ---------------------------------------------------------------- settings

function showSettings() {
  const s = deck.settings;
  panel.innerHTML = `<h2>Settings</h2>
    <fieldset><legend>Question types</legend>
      ${QUESTION_TYPES.map(
        (q) => `<label class="check"><input type="checkbox" data-type="${q.type}" ${s.types[q.type] ? "checked" : ""}> ${q.label}</label>`,
      ).join("")}
    </fieldset>
    <fieldset><legend>New cards per day</legend>
      <input type="number" id="per-day" min="0" max="100" value="${s.newPerDay}">
      <p class="muted">New cards slow down after this many each day, to keep reviews manageable. 0 turns
        new cards off.</p>
    </fieldset>
    <fieldset><legend>Quiz</legend>
      <p class="muted">Retake the quiz to skip ahead on anything you already know. Cards you've already
        answered stay as they are.</p>
      <button class="btn" id="replace">Take the quiz</button>
    </fieldset>
    <fieldset><legend>Your data</legend>
      <p class="muted">Progress is saved in this browser only. To move it to another device, export it
        here and import the file there.</p>
      <p class="muted">Visits and quiz scores are counted anonymously with GoatCounter, without
        cookies, to see how many countries people know.</p>
      <div class="row">
        <button class="btn" id="export">Export progress</button>
        <button class="btn" id="import">Import progress</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <p><button class="link" id="reset" style="color:var(--bad)">Reset all progress</button></p>
    </fieldset>
    <button class="btn primary" id="back">Back</button>
    <p class="muted" style="margin-top:16px">Map: Natural Earth. Population and GDP: World Bank.
      Countries and capitals: mledoze/countries. Flags: flag-icons.</p>`;

  const save = () => {
    const types = { ...s.types };
    panel.querySelectorAll<HTMLInputElement>("[data-type]").forEach((el) => {
      types[el.dataset.type as keyof typeof types] = el.checked;
    });
    const perDay = Math.max(0, Math.min(100, Number($<HTMLInputElement>("#per-day").value) || 0));
    deck.updateSettings({ types, newPerDay: perDay });
  };
  panel.querySelectorAll("input:not([type=file])").forEach((el) => el.addEventListener("change", save));

  $("#export").onclick = () => {
    const blob = new Blob([deck.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `topos-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const file = $<HTMLInputElement>("#import-file");
  $("#import").onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      deck.importJson(await f.text());
      alert("Progress imported.");
      showHome();
    } catch (err) {
      alert(`Couldn't import that file: ${(err as Error).message}`);
    }
  };
  $("#reset").onclick = () => {
    if (confirm("Delete all your progress in this browser? This can't be undone.")) {
      deck.reset();
      showHome();
    }
  };
  $("#replace").onclick = showQuizSetup;
  $("#back").onclick = showHome;
}

// ---------------------------------------------------------------- helpers

function flagUrl(c: Country) {
  return `${import.meta.env.BASE_URL}flags/${c.cca2}.svg`;
}

init().catch((err) => {
  console.error(err);
  $("#loading").textContent = "Couldn't load the map data. Check your connection and reload.";
});
