# Topos

A geography trainer built on spaced repetition. It asks about countries in several ways (find it
on a globe, name the highlighted country, name the flag, type the capital, find the country from
its capital), remembers what you find hard, and lets you play for as long as you like. Each
question is picked at random, weighted towards cards you missed, cards that are due, and a
steady trickle of new ones.

New players can take a short placement round first, so they don't start with the basics.

Everything runs in the browser. Progress is stored in that browser's local storage, and can be
moved between devices with the export and import buttons in Settings.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Project layout

- `scripts/build-data.mjs` builds `public/data/` and `public/flags/` from npm packages and the
  World Bank API. Run `npm run data` to refresh population and GDP figures.
- `src/data.ts` loads the map and country facts, and prepares lighter outlines for drawing.
- `src/globe.ts` draws the globe on a canvas and handles dragging, zooming and tapping.
- `src/deck.ts` holds the cards, schedules them with FSRS (`ts-fsrs`) and saves progress.
- `src/placement.ts` is the optional first-visit quiz that estimates what a player already knows.
- `src/answers.ts` checks typed answers, forgiving small typos only when they can't be
  mistaken for another country or capital.
- `src/main.ts` is the screens: home, questions, feedback and settings.

## Data sources

- Map shapes: Natural Earth via `world-atlas` (1:50m).
- Names, capitals, languages: `world-countries` (mledoze/countries).
- Population and GDP per capita: World Bank (most recent year available).
- Flags: `flag-icons`.
