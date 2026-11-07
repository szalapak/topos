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
- The Numbers mode colours by how well population and GDP per capita are known. It could
  also show the figures themselves, e.g. shading countries by population.
- Tune the thresholds once there is real progress to look at: "known" is currently an FSRS
  stability of 14 days or more, and cards from the placement round count as known until
  first asked.

### 2. Languages questions, and tuning the number questions
Population and GDP per capita questions are in (see Done). Still to do:

- Tune how close counts once there is real use to look at: `TOLERANCE` in `src/numbers.ts`
  (within 15% is Good, within 1.3x Hard, for both population and GDP per capita). GDP per
  capita in US dollars moves with exchange rates, so a figure you learned may drift out of
  range after a yearly data refresh.
- Total GDP could be its own question type later (`gdpTotal`), never a setting that changes
  what the `gdpPerCapita` cards mean. It needs `NY.GDP.MKTP.CD` added to `scripts/build-data.mjs`.
- Languages: partial credit when the main one is named but a second is missed. Note that
  `world-countries` lists *official* languages, which is not always what is mainly spoken
  (e.g. English in many African countries). May need a better source or a curated "main
  languages" list.
- New question types go in `QUESTION_TYPES` in `src/deck.ts`, with a large `offset` so they
  arrive after the map, flag and capital cards. The placement round (`src/placement.ts`)
  would need a skill for them too, or they can start from scratch (as the number ones do).

### 3. Placement can flood the review queue for strong players
A player who knows nearly everything gets about 160 countries x 5 question types, so roughly
750 cards marked known, spread over 2 to 28 days: around 25 to 30 checks a day for a month.
Options: spread over a longer period when there are many, cap checks per day, or only mark
one or two card types per country as known and let the rest be checked lazily.
See `markKnown` in `src/deck.ts` and `KNOWN_FIRST_CHECK_DAYS`.

With open-ended rounds this no longer blocks anything, but a big due pile crowds out new
cards (they get a share only until the day's pace, then shrink). In simulation, a player whose
placement overestimated them had 200 or so cards due after four weeks and was getting about
two new cards a day.

### 4. Test properly on a real phone
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
- **Tune question picking from real use**: the weights are constants near the top of
  `src/deck.ts` (`MISSED_WEIGHT`, `NEW_SHARE` and so on), tuned against a simulated player
  (Nov 2026). Worth checking against real logs after a few weeks: how soon missed cards
  return, how many new cards arrive per day, whether due piles keep growing.
- **More automated tests**: `npm test` covers `src/answers.ts` and `src/numbers.ts`. Still
  untested: the card picking in `src/deck.ts` (a missed card must not repeat straight away; a
  simulated player over a few weeks, as used for tuning, with fake time), and the placement
  estimates (simulated players should land at roughly 80 to 85% of what they know). Both
  need `localStorage` and the world data faked in Node.
- **Accessibility**: globe questions need a pointer. A keyboard alternative would help.

## Data upkeep

- Refresh population and GDP once a year or so with `npm run data`, then commit `public/data`.
- World Bank gaps: North Korea has no GDP figure, Vatican City has neither (population is set
  by hand). Taiwan's figures are set by hand in `scripts/build-data.mjs`.

## Done

- Globe with drag, pinch and scroll zoom; forgiving taps near borders and island nations.
- Five question types: find on globe, name the highlighted country, flag, capital, capital
  to globe.
- FSRS spaced repetition, progress in the browser, export and import.
- Placement round for new players.
- New cards drawn at random from a window, ordered by how well known a country is.
- A missed card no longer repeats straight away (fixed after first real use).
- The placement round never asks about the same country twice, even across skills.
- The globe shows what you know between rounds: known, learning and needs work, per skill.
- Open-ended rounds: questions picked at random, weighted by need (missed, due, nearly due,
  new), no daily allowance or "all caught up" wall, a gentle nudge when stopping very early.
- Published to GitHub Pages on every push to `main`.
- Population (typed in millions) and GDP per capita (typed in thousands of US dollars, market
  rates) questions, graded by closeness. Accepts "34", "34m", "34 million", "34,000,000",
  "45", "45k", "45000" and decimal commas. Countries under 2,000 people (Vatican City) are not asked their population.
  The feedback card shows both figures for every country.
- Unit tests with Node's built-in runner (`npm test`), run before every deploy.
