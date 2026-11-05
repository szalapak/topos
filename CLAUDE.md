# Topos

A spaced-repetition geography trainer that runs entirely in the browser. See `README.md` for
what each file does and `TODO.md` for what to work on next.

## Commands

- `npm run dev`: local dev server on http://localhost:5173 (also the `dev` entry in
  `.claude/launch.json` for the preview browser).
- `npm run build`: type-check and production build into `dist/`. Run before committing.
- `npm test`: unit tests in `tests/` (Node's built-in runner, no extra dependencies). Tests
  import source files with the `.ts` extension, and `tests/` sits outside `tsconfig.json`'s
  `include`, so `npm run build` does not type-check them. Deploys run the tests first.
- `npm run data`: rebuild `public/data/` and `public/flags/`. Needs network access (World Bank
  API). The output is committed, so builds and deploys never need it.

## Deploying

Pushing to `main` publishes to https://szalapak.github.io/topos/ through
`.github/workflows/deploy.yml` (GitHub Pages, source "GitHub Actions"). There is no staging
site, so everything on `main` goes live to real players within a couple of minutes.

This repository commits with the GitHub no-reply address set in its local git config, so the
owner's real email stays out of the public history. Keep it that way.

## Things to be careful with

- **Saved progress**: players' progress lives in their browser's localStorage under
  `topos:v1` (`src/deck.ts`). Changing the saved shape needs a migration, or people lose
  their progress.
- **Card keys** are `COUNTRY_ID|questionType` (e.g. `FRA|flag`). Renaming a question type or
  a country id orphans existing cards.
- **Testing in the preview browser**: modules can be imported in the page console, e.g.
  `await import('/src/deck.ts')`, which is handy for simulating many answers quickly. Clear
  `localStorage` afterwards so test progress does not linger.
- **Drawing speed**: the globe redraws on every frame while moving, so keep per-frame work in
  `src/globe.ts` small. It uses coarser outlines while moving and skips off-screen countries.
