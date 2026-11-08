# All the text in Topos

Every piece of text a player can see, grouped by screen, in the order it appears. Edit it
here, or leave notes next to anything you want changed, and I'll carry it over to the code.

How to read it:

- `{curly braces}` are filled in by the game, e.g. `{country}` is "France".
- Where the wording changes with a number, both forms are listed (one / more than one).
- Country names take "the" in running text where needed ("the Netherlands", "the United
  States"), but not in headings or answers.
- **Bold** marks text the game shows in bold.
- "One of" lists versions picked at random each time, never the same one twice in a row.

---

## Everywhere

**Top bar**

- Brand: `Topos`
- Counter, on the home screen: `{due} due · {learning} learning` (blank on a first visit)
- Counter, during a round: `{right}/{answered} right · {due} due`
- Counter, during the quiz: `Quiz {answered} of {total}`
- Button during a round or quiz: `Done`

**Loading**

- While the map loads: `Loading the world…`
- If it fails: `Couldn't load the map data. Check your connection and reload.`

**Globe** (for screen readers)

- `Globe. Drag to turn, pinch or scroll to zoom, tap to choose a country.`
- Zoom buttons: `Zoom in`, `Zoom out`

---

## Welcome (first visit)

> # Geography, in small doses
>
> Learn the countries with spaced repetition. Anything you don't know, you'll keep seeing
> until you do.
>
> How many countries do you know? Find out with a quick quiz, and you'll start learning from
> there.
>
> [Take the quiz] [Start from scratch]
>
> Settings and your data

---

## Home (returning players)

> # Where were we?
>
> Last round: **{right}** of **{answered}** right. *(only after a round)*
>
> | **{due}** due now | **{learning}** learning | **{started}** of {total} started |
>
> [Start]
>
> {n} cards in long-term memory · {n} answers so far
>
> *(globe key, see below)*
>
> How many countries do you know? Take the quiz · Settings and your data

**Globe key on the home screen**

- Buttons to colour the globe by: `All` · `Countries` · `Flags` · `Capitals` · `Numbers`
- Key: `Known {n}` · `Learning {n}` · `Needs work {n}`

---

## Quiz setup

> ## How many countries do you know?
>
> The quiz adapts to your answers, getting harder when you're right and easier when you're
> not. At the end you'll get an estimate of how much you know, and your practice starts from
> there.
>
> **Quiz me on**
>
> - [x] Countries · find them on the globe and name them
> - [x] Flags · name the country from its flag
> - [x] Capitals · name the capital, or find its country
> - [ ] Population · within about 30%
> - [ ] GDP per capita · within about 30%
>
> **Length**
>
> [Short] [Medium] [Detailed] *(Medium is selected to start with)*
>
> {n} questions, about {n} minutes.
>
> [Start the quiz] [Back]

- With nothing ticked, the length line reads: `Pick at least one.`
- Question counts: Short 15, Medium 30, Detailed 60 with the three default categories.
  (5, 10 or 20 per category, at least 10, 20 or 40 in all.) Minutes assume about ten seconds
  a question.

---

## Questions

**Line above the question**

- In the quiz: `Question {n} of {total}`
- In a round, for a card not seen before: `New card`
- Otherwise nothing.

**Find it on the globe**

> ## Where is **{country}**?
>
> Tap it on the globe. Drag to turn, pinch or scroll to zoom.
>
> [I don't know]

**Find the country from its capital**

> ## Which country has the capital **{capital}**?
>
> Tap it on the globe. Drag to turn, pinch or scroll to zoom.
>
> [I don't know]

(Countries with two capitals show both, e.g. `Pretoria / Bloemfontein / Cape Town`.)

**Name the highlighted country**

> ## Which country is highlighted?
>
> [Country] [Check]
>
> [I don't know]

**Name the flag**

> ## Which country has this flag?
>
> *(flag picture)*
>
> [Country] [Check]
>
> [I don't know]

**Type the capital**

> ## What is the capital of **{country}**?
>
> [Capital city] [Check]
>
> [I don't know]

**Population**

> ## What is the population of **{country}**?
>
> [Millions] million [Check]
>
> In millions: 68 for 68 million, 0.5 for half a million.
>
> [I don't know]

**GDP per capita**

> ## What is the GDP per capita of **{country}**?
>
> $ [Thousands] thousand [Check]
>
> In thousands of US dollars, at market rates: 45 for $45,000, 0.8 for $800.
>
> [I don't know]

- If what's typed isn't a number, the hint becomes:
  `That doesn't look like a number. {the hint above}`

(Words in square brackets are buttons, or the grey placeholder text in the answer box.)

---

## Feedback after an answer

**Headline**

- Right: `Correct`
- Right but misspelt, one of:
  - `Correct, more or less. It's spelt {answer}.`
  - `Close enough. Officially, it's spelt {answer}.`
  - `We'll allow it. It's spelt {answer}.`
- Population or GDP, close enough but not quite: `Close`
- Wrong, one of: `Nope` · `Not quite` · `Afraid not` · `Alas` · `No such luck`
- After "I don't know": `Here it is`

**Line under the headline, when wrong**

- Tapped the wrong country, one of:
  - `That's {other country}. {Country} is in orange.`
  - `That's {other country}: right planet, wrong country. {Country} is in orange.`
  - `{Other country}, as it happens. {Country} is the one in orange.`
- Globe question, after "I don't know": `{Country} is in orange.`
- Typed another country's capital, one of:
  - `{what you typed} is the capital of {other country}. The answer is **{capital}**.`
  - `Good capital, wrong country. {what you typed} belongs to {other country}; the answer is **{capital}**.`
  - `{Other country} would agree with you. The answer is **{capital}**.`
- Typed another country's name, one of:
  - `That's a different country. The answer is **{country}**.`
  - `A real country, just not this one. The answer is **{country}**.`
  - `To be fair, {other country} does exist. The answer is **{country}**.`
- Anything else: `The answer is **{answer}**.`

**Line under the headline, population and GDP**

- `The population of {country} is **{figure}** (World Bank, {year}).`
- `GDP per capita in {country} is **{figure}** (World Bank, {year}).`
- Then, if you typed a number: ` You said {your figure}, {how far off}.`
  - How far off: `spot on` · `12% too low` · `12% too high` · `3.2 times too high` ·
    `10 times too low`
  - Figures look like: `68.4 million`, `1.41 billion`, `38,300`, `$13,900`, `$234`

**Country card** (shown after every answer)

> *(flag)* **{country}**
>
> Capital: {capitals, or "none"}
>
> {subregion, e.g. "Western Europe"}
>
> {population} people · {GDP per capita} per person

**Buttons**

- `Next`
- `I was right` (only after a typed answer marked wrong, e.g. a spelling the game doesn't know)

---

## Quiz results

**Result card**

> You know about
>
> # {n}
>
> of {total} {countries / flags / capitals / populations / GDP figures}
>
> Probably between {low} and {high} *(hidden when both ends are the same number)*
>
> | **{n}** flags *{low} to {high}* | **{n}** capitals *{low} to {high}* | *(each range hidden when both ends are the same number)*

The big number is for whichever category comes first of Countries, Flags, Capitals,
Population, GDP per capita; the others go underneath.

**Under the card**

- Only when your answers show it clearly:
  `You know {area} best, and {area} least.`
  - Areas: `Europe` · `the Middle East and North Africa` · `Sub-Saharan Africa` ·
    `South and Central Asia` · `East and Southeast Asia` · `North and Central America` ·
    `South America` · `Oceania`
- The edge of what you know, for the big number's category (not for population or GDP).
  Names are tappable and show the country on the globe. Three on each side where possible,
  from different parts of the world:
  - Countries: `You probably know {A}, {B} and {C}, but {X}, {Y} and {Z} are likely just out of reach. Sound about right? If not, a few more questions will help us get it right.`
  - Flags and capitals: `You probably know the flags of {A}, {B} and {C}, but those of {X}, {Y} and {Z} are likely just out of reach. Sound about right? If not, a few more questions will help us get it right.`
  - When nothing is just out of reach (you know nearly everything):
    `You probably even know {A}, {B} and {C}. Sound about right? ...`
  - When nothing is probably known yet:
    `Likely just out of reach: {X}, {Y} and {Z}. Sound about right? ...`
- Buttons: `Narrow it down: 10 more` · `Share your result` (the first whenever the edge line is
  shown, or while a range is still wide)

**What happens next** (each line only when it applies)

- Right answers:
  - one: `The one you got right is now in long-term memory, so it'll only come back in a month or two.`
  - more: `The {n} you got right are now in long-term memory, so they'll only come back in a month or two.`
- Cards filled in:
  - `We've also marked {n} card(s) you very likely know. We'll still quiz you on the ones we're less sure of over the next few weeks, just to double-check.`
- Learning next. The countries just out of reach (from the edge line) become the first new
  cards:
  - with misses: `When you start learning, you'll get another go at the {n} you missed, then move on to new ones, starting with {X}, {Y} and {Z}.`
    (one miss: `the one you missed`)
  - without: `When you start learning, you'll go straight to new ones, starting with {X}, {Y} and {Z}.`
  - with misses but no edge line: `When you start learning, you'll get another go at the {n} you missed first.`
    (one miss: `the one you missed`)

**Globe key on the results**

- Buttons (only with more than one category): `All` · `Countries` · `Flags` · `Capitals` ·
  `Population` · `GDP per capita`
- Key: `Likely known` · `Not sure` · `Not yet`

**Buttons at the bottom**

- `Learn the rest` · `Home`

**Sharing**

- The text shared:
  `I'm 80% sure I know between {low} and {high} of {total} countries 🌍 How many do you know? {link}`
  - It lists whichever categories were in the quiz, with the range for the first one only, e.g.
    `I'm 80% sure I know between 80 and 94 of 197 countries, plus about 120 flags and 45 capitals 🌍 How many do you know? {link}`
  - When the range is down to a single number, it drops the hedge:
    `I know 197 of 197 countries 🌍 How many do you know? {link}`
  - The 80% is fixed (the range is an 80% range); only the range narrows with more answers.
  - The link opens the quiz setup directly.
- On a computer, after copying: the button says `Copied`, and underneath:
  `Copied to the clipboard, ready to paste anywhere.`
- If copying isn't allowed, the text and link are shown underneath to copy by hand.

---

## Stopping a round early

Shown once, when pressing Done after fewer than 8 answers in an ordinary round:

> ## Stopping already?
>
> You've answered {n}. {One more? / {n} more?}
>
> [Keep going] [Stop here]

---

## Nothing to ask

Only reached with every question type switched off:

> ## Nothing to ask
>
> Every question type is switched off. Turn one back on in Settings.
>
> [Settings] [Home]

---

## Settings

> ## Settings
>
> **Question types**
>
> - [x] Name → find it on the globe
> - [x] Highlighted on the globe → type the name
> - [x] Flag → type the country
> - [x] Country → type the capital
> - [x] Capital → find the country on the globe
> - [x] Country → type its population (in millions)
> - [x] Country → type its GDP per capita (US$, in thousands)
>
> **New cards per day**
>
> [10]
>
> New cards slow down after this many each day, to keep reviews manageable. 0 turns new cards
> off.
>
> **Quiz**
>
> Retake the quiz to skip ahead on anything you already know. Cards you've already answered
> stay as they are.
>
> [Take the quiz]
>
> **Your data**
>
> Progress is saved in this browser only. To move it to another device, export it here and
> import the file there.
>
> [Export progress] [Import progress]
>
> Reset all progress
>
> [Back]
>
> Map: Natural Earth. Population and GDP: World Bank. Countries and capitals:
> mledoze/countries. Flags: flag-icons.

**Pop-ups**

- After importing: `Progress imported.`
- Import failed: `Couldn't import that file: {reason}` (the usual reason is
  `Not a Topos progress file`)
- Before resetting: `Delete all your progress in this browser? This can't be undone.`
- Exported file name: `topos-progress-{date}.json`

---

## Outside the page

- Browser tab title: `Topos`
- Search engine description and app description when installed:
  `How many countries do you know? Take a quick quiz, then learn the rest with spaced repetition.`
- Name when added to a phone's home screen: `Topos`
- Preview card when the link is shared in a chat or on social media:
  - Title: `How many countries do you know?`
  - Text: `Take a quick quiz, then learn the rest with spaced repetition.`
  - Site name: `Topos`
  - Picture: the app icon, for now
