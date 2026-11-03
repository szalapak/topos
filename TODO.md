# Topos to-do

Roughly in priority order. Live site: https://szalapak.github.io/topos/

## Next up

### 1. Flags and capitals on the knowledge globe
The globe now colours countries as known / learning / needs work between rounds, with an
All / Maps / Flags / Capitals switch (`knowledge()` in `src/deck.ts`). Still to do from the
same feedback:

- Flags mode could draw the flag clipped to the country's outline once it is known (likely
  only when the globe is still or zoomed in, to keep drawing fast).
- Capitals mode could put a dot on the capital once it is known. This needs capital
  coordinates, which `public/data/countries.json` does not have yet (only the country's
  `latlng`), so `scripts/build-data.mjs` would need a source for them.
- Think about what other modes could show as more question types arrive (population, GDP).
- Tune the thresholds once there is real progress to look at: "known" is currently an FSRS
  stability of 14 days or more, and cards from the placement round count as known until
  first asked.

### 2. Open-ended sessions instead of a daily allowance
Today a round runs until nothing is due and the day's new cards (10 by default) are used up,
then shows "All caught up" and "Learn 5 more". The wish: press start and keep going for as
long as you like, with no fixed allowance. (Player feedback, Nov 2026: a priority.)

- Pick the next card at random, weighted by need: overdue and often-missed cards much more
  likely, cards being learned fairly likely, well-known cards rarely, new cards mixed in at a
  steady rate. Not strictly "the most overdue card next", which feels mechanical and was
  behind the missed-card-repeats bug.
- Keep FSRS for the underlying memory model; only the choice of what to ask next changes.
  Reviewing a card well before it is due should count for less (FSRS handles this already,
  stability barely grows on early reviews).
- New cards still need some brake, so a long session does not introduce 80 countries that
  then all fall due together. Perhaps hold back new cards while many are still being learned.
- Gentle nudge if someone stops very early ("a few more?"), never a wall.
- Play several real sessions before shipping and check it feels natural: no near repeats,
  a sensible mix of old and new, missed cards return after a few questions.
- The "new per day" setting and the `days` part of the saved progress may become unused;
  keep reading old saves without errors.

### 3. Questions on population, GDP per capita and languages
The original goal included these, typed rather than multiple choice. The data is already loaded
(`population`, `gdpPerCapita`, `languages` in `public/data/countries.json`) but nothing asks about it.

- Numbers should be graded by closeness, not exactness. A starting idea: within about 15% is
  Good, within 2x is Hard, further off is Again. Accept "34m", "34 million", "34,000,000" and so on.
  Logarithmic error is probably the right measure.
- Languages: partial credit when the main one is named but a second is missed. Note that
  `world-countries` lists *official* languages, which is not always what is mainly spoken
  (e.g. English in many African countries). May need a better source or a curated "main
  languages" list.
- New question types go in `QUESTION_TYPES` in `src/deck.ts`, with a large `offset` so they
  arrive after the map, flag and capital cards. The placement round (`src/placement.ts`)
  would need a skill for them too, or they can start from scratch.

### 4. Placement can flood the review queue for strong players
A player who knows nearly everything gets about 160 countries x 5 question types, so roughly
750 cards marked known, spread over 2 to 28 days: around 25 to 30 checks a day for a month.
Options: spread over a longer period when there are many, cap checks per day, or only mark
one or two card types per country as known and let the rest be checked lazily.
See `markKnown` in `src/deck.ts` and `KNOWN_FIRST_CHECK_DAYS`.

### 5. Test properly on a real phone
Only tested in a desktop browser at phone size so far. Check:
- pinch to zoom and drag on the globe, and whether tiny-country taps feel fair;
- the on-screen keyboard: iPhone Safari ignores `interactive-widget=resizes-content`, so the
  answer box may be hidden behind the keyboard;
- drawing speed while spinning the globe;
- "Add to Home Screen" icon and offline use.

## Later

- **Focused play**: tap a country or pick a continent and be quizzed only on that area, with
  its countries then sorted into known / learning / needs work. Replaces the older "region
  focus" idea (filter cards by `region`). Fits naturally with open-ended sessions.
- **Explore the globe between sessions**: tap a country on the home screen to see its name,
  flag, capital and facts, and perhaps add it to what you are learning.
- **Subdivisions**: tap a country and add its states, provinces or regions to the learning
  list (US states, German Länder, and so on). Needs boundary data (Natural Earth admin-1),
  which is large, so load it per country on demand. Card keys would need a form that cannot
  clash with country ids, e.g. `US-CA|locate`. Depends on focused play to be usable.
- **Sync between devices**: progress only lives in one browser, with manual export and
  import in Settings. A sync code or QR code would need a little server storage.
- **"New version available" prompt**: after a deploy, people see the old version until they
  refresh, because the app is cached for offline use (vite-plugin-pwa).
- **Faster first load**: the coarser map outlines and bounding circles are computed in the
  browser on every load (`src/data.ts`). They could be precomputed in `scripts/build-data.mjs`.
- **Home screen**: mention cards still being learned and when they come back, as the
  caught-up screen already does.
- **Automated tests**: none yet. Good candidates: `src/answers.ts` (typo rules, "Niger" must
  not pass for "Nigeria"), the card picking in `src/deck.ts` (a missed card must not repeat
  straight away), and the placement estimates (simulated players should land at roughly 80
  to 85% of what they know).
- **Accessibility**: globe questions need a pointer. A keyboard alternative would help.

## Data upkeep

- Refresh population and GDP once a year or so with `npm run data`, then commit `public/data`.
- World Bank gaps: North Korea has no GDP figure, Vatican City has neither (population is set
  by hand). Taiwan's figures are set by hand in `scripts/build-data.mjs`.

## Done

- Globe with drag, pinch and scroll zoom; forgiving taps near borders and island nations.
- Five question types: find on globe, name the highlighted country, flag, capital, capital
  to globe.
- FSRS spaced repetition, any session length, progress in the browser, export and import.
- Placement round for new players.
- New cards drawn at random from a window, ordered by how well known a country is.
- A missed card no longer repeats straight away (fixed after first real use).
- The placement round never asks about the same country twice, even across skills.
- The globe shows what you know between rounds: known, learning and needs work, per skill.
- Published to GitHub Pages on every push to `main`.
