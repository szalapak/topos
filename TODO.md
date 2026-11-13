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
  `latlng`), so `scripts/build-data.mjs` would need a source for them. The city list in item
  2 would give them.
- The Numbers mode colours by how well population and GDP per capita are known. It could
  also show the figures themselves, e.g. shading countries by population.
- Tune the thresholds once there is real progress to look at: "known" is currently an FSRS
  stability of 14 days or more, and cards filled in by the quiz count as known until first
  asked.

### 2. Cities typed as a capital
A city that isn't a capital gets a plain "The answer is Canberra", unless it is one of the 27
hand-picked capital traps in `src/mixups.ts` (Sydney, Istanbul, Rio and so on), which say why
the city is a fair guess. The idea is to recognise any sizeable city:

- A list of cities over about 100,000 people from GeoNames (free, CC BY 4.0, so it needs a
  credit line next to the other data sources), trimmed to name, other names, country and
  population, and built into `public/data/` by `scripts/build-data.mjs`. Keep it small, or
  load it only after a wrong capital answer.
- A city in the asked country: "Lyon certainly wishes it were", "Lyon is in France all
  right, just not the capital", "Lovely city, wrong job". A city in another country: "Lyon is
  lovely, but it's in France". The hand-picked traps keep priority.
- Names shared by several cities (Santiago, San José, Valencia): prefer the one in the asked
  country, otherwise the biggest.
- The same list gives capital coordinates for the capitals mode on the globe (item 1).

### 3. Languages questions, and tuning the number questions
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
  arrive after the map, flag and capital cards. To be in the quiz they also need a skill in
  `SKILLS` in `src/knowledge.ts` (with a prior: typical count, spread, width).

### 4. The quiz: things to learn from real use
The quiz (`src/quiz.ts`, model in `src/knowledge.ts`) replaced the placement round in Nov 2026.
Its priors, the "how well known" order as difficulty, and `RANK_SHIFT` (capital traps, look-alike
flags) are educated guesses. In simulation the 80% range holds the true count 70 to 90% of the
time, with typical errors of about 15 (short), 10 (medium) and 7 (detailed) countries, but
that assumes real knowledge roughly follows fame plus a regional bonus.

- **Results histogram** ("how many countries do people know?"): being collected since Nov 2026
  as GoatCounter events (`src/counter.ts`), one per skill per finished quiz, named like
  `quiz/map/medium/first/120-129`. Not shown to players yet. Once there are a few hundred first
  quizzes, show where a result falls ("you know more than 70% of players"). The app can't read
  GoatCounter without exposing the API key, so a script (run by hand, or in the deploy workflow
  with the key as a secret) would pull the counts into `public/data/`. Short quizzes are off by
  about 15 countries, so the histogram may be better from medium and detailed ones.
- **Calibrated difficulty** needs every answer, not just the final counts, which is too much
  for GoatCounter: a small endpoint of its own (e.g. a Cloudflare Worker with its free database),
  storing anonymous rows (skill, country, right or wrong, final counts). With that, each
  country's difficulty per skill could be fitted instead of read off the fame order, and the
  priors set from real players.
- **Watch the review load after a quiz.** Filled-in cards are now spread by confidence
  (about 5 days at an 80% chance, 3 weeks at 95%, 2.5 months at 99%; `firstCheckDays` in
  `src/deck.ts`), and first checks feed back into the estimate: filled-in cards that drop below
  60% are taken back, and less certain ones are checked sooner (`refreshEstimate`). This should
  stop the old placement round's pile-up (around 750 cards spread over 2 to 28 days for a
  strong player), but it has not been simulated over weeks.
- The feedback only takes cards back; it never fills in more when a player turns out to know
  more than estimated. Could do, with care not to flip cards back and forth.
- **Home area and mix-ups**, also guesses to tune: the home area starts with a bonus of 0.8
  logits (`HOME_AREA_BONUS`), and a wrong answer naming another country counts as half a miss
  for it (`MIX_UP_WEIGHT`), in `src/knowledge.ts`. In simulation the home hint cut per-country
  error in the home area by 7 to 11% when right, and cost under 3% overall when wrong. Mix-ups
  are only used in the quiz, not in ordinary rounds. A finer version of the home hint would
  go by distance from the home country (a Pole knows Lithuania better than Andorra), which
  needs the home country rather than just the area.
- A share image (the coloured globe with the count) would travel better than text.
- A proper preview picture for shared links. The link preview tags in `index.html` use the
  app icon for now (`og:image`, 512x512); chat apps and social sites show a wide picture best,
  about 1200x630.

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
  flag, capital and facts, and perhaps add it to what you are learning. Make it fun to play
  with too: a flick should send the globe spinning and slow down gradually (at the moment it
  stops the moment you let go, `bindPointer` in `src/globe.ts`), with an easter egg such as
  "Whoa, careful there" when someone spins it really fast. Keep the spin cheap to draw, since
  the globe redraws every frame while it moves.
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
- **More automated tests**: `npm test` covers `src/answers.ts`, `src/numbers.ts`, `src/stats.ts`,
  the wrong-answer wording and neighbours (`tests/feedback.test.ts`), and the quiz and its
  model (`tests/quiz.test.ts`, with simulated players). Still untested: the card
  picking in `src/deck.ts` (a missed card must not repeat straight away; a simulated player
  over a few weeks, as used for tuning, with fake time) and how the deck takes in a quiz
  (`applyQuiz`, `refreshEstimate`). Both need `localStorage` faked in Node, and `src/deck.ts`
  imports without `.ts` extensions, which Node needs.
- **Accessibility**: globe questions need a pointer. A keyboard alternative would help.
- **How to tell look-alike flags apart**: a one-line tell under the side-by-side flags for the
  most common pairs, e.g. Ireland has green at the flagpole and Côte d'Ivoire orange, Senegal
  is Mali plus a green star.

## Data upkeep

- Refresh population and GDP once a year or so with `npm run data`, then commit `public/data`.
- World Bank gaps: North Korea has no GDP figure, Vatican City has neither (population is set
  by hand). Taiwan's figures are set by hand in `scripts/build-data.mjs`.
- The hand-made lists in `src/mixups.ts` go stale if a capital moves or a city's story
  changes: the capital trap notes say things like "the biggest city" and "the capital until
  1960". The tests catch a trap city that has become an accepted capital, nothing more.

## Done

- Globe with drag, pinch and scroll zoom; forgiving taps near borders and island nations.
- Five question types: find on globe, name the highlighted country, flag, capital, capital
  to globe.
- FSRS spaced repetition, progress in the browser, export and import.
- Placement round for new players, replaced by the adaptive quiz (Nov 2026): choose skills
  and length, questions picked to narrow the estimate, "you know about X (probably between A
  and B)" with a share button and a `?quiz` link, "narrow it down" for 10 more, right answers
  straight to long-term memory, likely-known cards filled in and checked by confidence.
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
- A stats screen, "How it's going" (Nov 2026), opened from the top bar's counter or a home
  link: streak, answers a day, how often cards are remembered when they come back, a calendar
  of the last six months, and countries known per group with a line of how each has grown.
  Everything but the lines comes from the answer log, so it covers past play too; the lines
  come from a daily count saved in `days` and start from the day this shipped.
- Wrong answers worded by the kind of mistake (Nov 2026, `src/feedback.ts`): the country next
  door or just across the sea (worked out from the map), a look-alike flag (shown side by side
  with the right one), a twin name (Slovakia for Slovenia), the capital typed for the country,
  a city often taken for the capital (Sydney), or the wrong continent. Near-identical flags
  (Chad and Romania, Indonesia and Monaco, the Netherlands and Luxembourg) count as close, with
  a "spot the difference". Number answers get headlines by how far off they were.
