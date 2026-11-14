# Topos

A geography trainer built on spaced repetition. It asks about countries in several ways (find it
on a globe, name the highlighted country, name the flag, type the capital, find the country from
its capital, guess its population or GDP per capita), remembers what you find hard, and lets you
play for as long as you like. Each
question is picked at random, weighted towards cards you missed, cards that are due, and a
steady trickle of new ones.

A quiz ("How many countries do you know?") adapts to the player as they answer and ends with
an estimate and a likely range, which can be shared. It also starts the game from where the
player is: right answers go into long-term memory, and cards the player very likely knows are
filled in, to be checked sooner the less sure the estimate is.

Everything runs in the browser. Progress is stored in that browser's local storage, and can be
moved between devices with the export and import buttons in Settings. Visits and quiz scores
are counted anonymously with GoatCounter.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm test` runs the unit tests in `tests/` with Node's
built-in test runner (Node 24 or newer, which runs TypeScript directly).

## Project layout

- `scripts/build-data.mjs` builds `public/data/` and `public/flags/` from npm packages and the
  World Bank API. Run `npm run data` to refresh population and GDP figures.
- `src/data.ts` loads the map and country facts, and prepares lighter outlines for drawing.
  It also works out which countries are neighbours, by a shared border or across up to
  250 km of sea with no other country in between.
- `src/globe.ts` draws the globe on a canvas and handles dragging, zooming and tapping.
- `src/deck.ts` holds the cards, schedules them with FSRS (`ts-fsrs`) and saves progress.
- `src/knowledge.ts` models what a player knows: a logistic item response model (as in
  adaptive testing) with a level per skill (maps, flags, capitals, population, GDP per capita),
  a bonus per part of the world, and country difficulty from the "how well known" order.
  A wrong answer that names another country (tapping Slovakia for Slovenia) counts as half a
  miss for that country too.
- `src/home.ts` guesses which part of the world the player lives in from the browser's time
  zone (or language setting), so the model starts by assuming they know it a little better.
  Nothing is sent anywhere.
- `src/quiz.ts` is the adaptive quiz: it picks the questions that narrow the estimate most and
  reports how many countries the player knows, with an 80% range.
- `src/answers.ts` checks typed answers, forgiving small typos only when they can't be
  mistaken for another country or capital.
- `src/numbers.ts` reads typed numbers ("34m", "34 million", "45k"), grades them by how close
  they are, and formats figures for display.
- `src/feedback.ts` words the feedback after a wrong answer, by question type and by how it
  went wrong: the country next door, a look-alike flag (shown next to the right one), a twin
  name (Slovakia for Slovenia), the country's capital instead of the country, a city often
  taken for the capital (Sydney), the wrong continent, a capital that gives itself away
  (Mexico City: "That one is kinda obvious, no?"), or a plain miss. Number answers get
  headlines by how far off they were. Naming a flag that is all but identical to the right
  one (Chad for Romania) counts as close, with a "spot the difference". Right answers get
  headlines too: for a streak, a miss put right, a tap at the very edge, a hard spelling, a
  number within 3%, or an obscure, famous or new card.
- `src/mixups.ts` holds the hand-made lists behind that: twin names, look-alike and
  near-identical flags, countries in two continents, hard spellings, and cities often taken for
  the capital, each with a note on why. It also spots capitals named after their country.
- `src/counter.ts` sends finished quiz results to GoatCounter (topos.goatcounter.com, loaded in
  `index.html`, which also counts visits), rounded down to tens, for a histogram of how many
  countries people know. Players don't see it yet. No cookies, nothing that identifies anyone,
  and localhost is never counted. To leave out your own visits on the live site, open it once
  with `#toggle-goatcounter` at the end of the address in each browser.
- `src/text.ts` has small text helpers ("the Netherlands", picking a wording at random).
- `src/stats.ts` works out the stats screen's numbers from the answer log: answers per day for
  the calendar, streaks, the daily average, and how often cards are remembered when they come
  back. How many countries are known is recorded once a day in the saved progress (`days` in
  `src/deck.ts`), as it can't be worked out afterwards.
- `src/main.ts` is the screens: home, questions, feedback, stats and settings.

## Data sources

- Map shapes: Natural Earth via `world-atlas` (1:50m).
- Names, capitals, languages: `world-countries` (mledoze/countries).
- Population and GDP per capita: World Bank (most recent year available).
- Flags: `flag-icons`.
