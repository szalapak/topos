import "./style.css";
import { AnswerSet, type Verdict } from "./answers";
import { loadWorld, type Country, type World } from "./data";
import { Deck, QUESTION_TYPES, Rating, type Grade, type Prompt } from "./deck";
import { Globe } from "./globe";
import { Placement } from "./placement";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const panel = $("#panel");
const counts = $("#counts");
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
  /** Set during the placement round, where answers go to the level estimate instead of the deck. */
  placement?: Placement;
}
let session: Session | null = null;
let lastSession: Session | null = null;

async function init() {
  world = await loadWorld();
  deck = await Deck.open(world);
  globe = new Globe($("#globe"), world);
  names = new AnswerSet(world.countries.map((c) => [c.id, c.name, c.names]));
  capitals = new AnswerSet(world.countries.map((c) => [c.id, c.name, [...c.capitals, ...c.capitalAliases]]));
  $("#loading").remove();
  $("#zoom-in").onclick = () => globe.zoomBy(1.6);
  $("#zoom-out").onclick = () => globe.zoomBy(1 / 1.6);
  doneButton.onclick = () => (session?.placement ? showPlacementResults() : showHome());
  showHome();
}

// ---------------------------------------------------------------- home

function showHome() {
  if (session) lastSession = session;
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  globe.spin(true);
  updateCounts();

  if (deck.isFresh) return showWelcome();

  const c = deck.counts();
  const p = deck.progress();
  const anything = c.due + c.newLeft > 0;
  panel.innerHTML = `
    <h1>Learn the world, a few countries at a time</h1>
    <p class="muted">Play for as long as you like and stop whenever you want. Anything you
      find hard comes back sooner.</p>
    ${lastSession && lastSession.answered ? `<p>Last round: <b>${lastSession.correct}</b> of <b>${lastSession.answered}</b> right.</p>` : ""}
    <div class="stats">
      <div class="stat"><b>${c.due}</b><span>due now</span></div>
      <div class="stat"><b>${c.newLeft}</b><span>new today</span></div>
      <div class="stat"><b>${c.started}</b><span>of ${c.total} started</span></div>
    </div>
    <button class="btn primary wide" id="start">${anything ? "Start" : "Nothing due: learn something new"}</button>
    <p class="muted" style="margin-top:12px">${p.reviewing} cards in long-term memory · ${p.answers} answers so far</p>
    <div class="row"><button class="link" id="settings">Settings and your data</button></div>
  `;
  $("#start").onclick = () => {
    if (!anything) deck.allowMoreNew(5);
    startRound();
  };
  $("#settings").onclick = showSettings;
}

function showWelcome() {
  panel.innerHTML = `
    <h1>Learn the world, a few countries at a time</h1>
    <p class="muted">Play for as long as you like and stop whenever you want. Anything you
      find hard comes back sooner.</p>
    <p>New here? A quick placement round (${new Placement(world, deck).total} questions, a few minutes)
      finds out what you already know, so you don't start with the basics.</p>
    <div class="row">
      <button class="btn primary" id="placement">Take the placement round</button>
      <button class="btn" id="scratch">Start from scratch</button>
    </div>
    <div class="row" style="margin-top:12px"><button class="link" id="settings">Settings and your data</button></div>
  `;
  $("#placement").onclick = startPlacement;
  $("#scratch").onclick = () => startRound();
  $("#settings").onclick = showSettings;
}

function startRound() {
  session = { answered: 0, correct: 0, recent: [] };
  nextQuestion();
}

function startPlacement() {
  session = { answered: 0, correct: 0, recent: [], placement: new Placement(world, deck) };
  nextQuestion();
}

function updateCounts() {
  const c = deck.counts();
  const p = session?.placement;
  if (p) counts.textContent = `Placement ${p.done} of ${p.total}`;
  else if (session) counts.textContent = `${session.correct}/${session.answered} right · ${c.due} due · ${c.newLeft} new`;
  else counts.textContent = deck.isFresh ? "" : `${c.due} due · ${c.newLeft} new`;
}

// ---------------------------------------------------------------- questions

function nextQuestion() {
  const s = session!;
  const prompt = s.placement ? s.placement.next() : deck.next(s.recent);
  doneButton.hidden = false;
  globe.spin(false);
  globe.setHighlights([]);
  updateCounts();
  if (!prompt) return s.placement ? showPlacementResults() : showCaughtUp();

  const { country, type } = prompt;
  const intro = s.placement
    ? `<p class="muted">Placement question ${s.placement.done + 1} of ${s.placement.total}</p>`
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
        finish(prompt, set.check(country.id, input.value), { typed: input.value.trim() });
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
}

function finish(prompt: Prompt, verdict: Verdict, detail: AnswerDetail = {}) {
  const s = session!;
  const right = verdict.result !== "wrong";
  let overrule: () => void;
  if (s.placement) {
    s.placement.record(prompt, right);
    overrule = () => s.placement!.overruleLast();
  } else {
    const grade: Grade = verdict.result === "exact" ? Rating.Good : verdict.result === "close" ? Rating.Hard : Rating.Again;
    const undo = deck.answer(prompt, grade);
    overrule = () => {
      undo();
      deck.answer(prompt, Rating.Good);
    };
  }
  s.answered++;
  if (right) s.correct++;
  s.recent = [prompt.country.id, ...s.recent.filter((id) => id !== prompt.country.id)].slice(0, 3);
  showFeedback(prompt, verdict, detail, overrule);
}

/** `overrule` turns the answer into a correct one, for the "I was right" button. */
function showFeedback(prompt: Prompt, verdict: Verdict, answer: AnswerDetail, overrule: () => void) {
  const { country, type } = prompt;
  const { skipped, typed, tappedId } = answer;
  const right = verdict.result !== "wrong";
  const onGlobe = type === "locate" || type === "capitalLocate";
  updateCounts();

  globe.setHighlights([
    [country.id, right ? "correct" : "target"],
    ...(tappedId && !right ? [[tappedId, "wrong"] as [string, "wrong"]] : []),
  ]);
  globe.flyTo(country.id);

  const expected = type === "capital" ? country.capitals.join(" / ") : country.name;
  let headline: string;
  let detail = "";
  if (verdict.result === "exact") headline = `<p class="verdict good">Correct</p>`;
  else if (verdict.result === "close") {
    headline = `<p class="verdict close">Nearly: it's spelt ${esc(expected)}</p>`;
  } else {
    headline = `<p class="verdict bad">${skipped ? "Here it is" : "Not quite"}</p>`;
    if (onGlobe && verdict.matched) detail = `You tapped ${esc(the(verdict.matched))}. ${esc(sentence(the(country.name)))} is in orange.`;
    else if (onGlobe) detail = `${esc(sentence(the(country.name)))} is in orange.`;
    else if (verdict.matched && type === "capital") detail = `${esc(typed ?? "")} is the capital of ${esc(the(verdict.matched))}. The answer is <b>${esc(expected)}</b>.`;
    else if (verdict.matched) detail = `That's a different country. The answer is <b>${esc(expected)}</b>.`;
    else detail = `The answer is <b>${esc(expected)}</b>.`;
  }

  // Overruling only makes sense for typed answers, e.g. a spelling the game does not know.
  const canOverrule = !right && !skipped && !onGlobe;
  panel.innerHTML = `${headline}${detail ? `<p>${detail}</p>` : ""}
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

function factsCard(c: Country) {
  return `<div class="facts">
    <img src="${flagUrl(c)}" alt="Flag of ${esc(c.name)}">
    <strong>${esc(c.name)}</strong>
    <span>Capital: ${esc(c.capitals.join(", ") || "none")}</span>
    <span class="muted">${esc(c.subregion || c.region)}</span>
  </div>`;
}

function showPlacementResults() {
  const placement = session!.placement!;
  const results = placement.results();
  const known = placement.knownKeys();
  deck.markKnown(known);
  session = null;
  doneButton.hidden = true;
  globe.onTap = undefined;
  globe.setHighlights([]);
  updateCounts();

  panel.innerHTML = `<h2>Here's where you're starting</h2>
    <p class="muted">Roughly how many of the best-known countries you already know:</p>
    <div class="stats">
      ${results.map((r) => `<div class="stat"><b>${r.known}</b><span>${r.label.toLowerCase()}</span></div>`).join("")}
    </div>
    <p>${
      known.length
        ? `${known.length} cards are marked as known. They'll come up for a quick check over the next four
           weeks, so anything you've forgotten gets caught. New cards start from where you are.`
        : "No problem: you'll start with the best-known countries and build up from there."
    }</p>
    <div class="row">
      <button class="btn primary" id="go">Start learning</button>
      <button class="btn" id="home">Home</button>
    </div>`;
  $("#go").onclick = () => startRound();
  $("#home").onclick = showHome;
}

function showCaughtUp() {
  const c = deck.counts();
  const more = c.started < c.total;
  panel.innerHTML = `<h2>All caught up</h2>
    <p>Nothing is due right now${session?.answered ? `, and you got ${session.correct} of ${session.answered} right this round` : ""}.</p>
    <div class="row">
      ${more ? `<button class="btn primary" id="more">Learn 5 more</button>` : ""}
      <button class="btn" id="finish">Finish</button>
    </div>`;
  if (more) {
    $("#more").onclick = () => {
      deck.allowMoreNew(5);
      nextQuestion();
    };
  }
  $("#finish").onclick = showHome;
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
      <p class="muted">You can always ask for more once you're caught up.</p>
    </fieldset>
    <fieldset><legend>Placement round</legend>
      <p class="muted">Already know more than the game thinks? Take the placement round again to skip ahead.
        It only adds to what you know, it never resets anything.</p>
      <button class="btn" id="replace">Take the placement round</button>
    </fieldset>
    <fieldset><legend>Your data</legend>
      <p class="muted">Progress is saved in this browser only. To move it to another device, export it
        here and import the file there.</p>
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
  $("#replace").onclick = startPlacement;
  $("#back").onclick = showHome;
}

// ---------------------------------------------------------------- helpers

function flagUrl(c: Country) {
  return `${import.meta.env.BASE_URL}flags/${c.cca2}.svg`;
}

const TAKES_THE = new Set([
  "United States", "United Kingdom", "United Arab Emirates", "Netherlands", "Philippines", "Bahamas",
  "Gambia", "Maldives", "Comoros", "Solomon Islands", "Marshall Islands", "Dominican Republic",
  "Central African Republic", "Republic of the Congo", "DR Congo",
]);

/** "the Netherlands" in running text; the name alone stays bare in headings and answers. */
function the(name: string) {
  return TAKES_THE.has(name) ? `the ${name}` : name;
}

function sentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

init().catch((err) => {
  console.error(err);
  $("#loading").textContent = "Couldn't load the map data. Check your connection and reload.";
});
