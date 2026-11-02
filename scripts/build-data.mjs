// Builds the static data the app loads at runtime:
//   public/data/world.json      map shapes (TopoJSON, geometry ids are ISO alpha-3 codes)
//   public/data/countries.json  facts about every quiz country
//   public/flags/*.svg          flag images
// Run with `npm run data`. Needs network access for the World Bank figures.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const countries = require("world-countries");
const topology = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));

// Recognised by most of the world but not UN members; world-countries uses UNK for Kosovo.
const EXTRA = ["VAT", "PSE", "TWN", "UNK"];
const CODE_FIX = { UNK: "XKX" };
const code = (c) => CODE_FIX[c.cca3] ?? c.cca3;

// Map shapes with no id in world-atlas, assigned to the country they belong to in this game.
const NAMELESS = { Kosovo: "XKX", Somaliland: "SOM", "N. Cyprus": "CYP" };

// Extra accepted answers that are common in English but missing from world-countries.
const NAME_ALIASES = {
  USA: ["America", "US", "United States of America"],
  GBR: ["UK", "Britain", "Great Britain", "England"],
  CIV: ["Ivory Coast", "Cote d'Ivoire"],
  COD: ["DRC", "DR Congo", "Congo-Kinshasa", "Democratic Republic of Congo"],
  COG: ["Congo-Brazzaville", "Republic of Congo"],
  MMR: ["Burma"],
  SWZ: ["Swaziland"],
  CZE: ["Czech Republic"],
  TLS: ["East Timor"],
  MKD: ["Macedonia"],
  CPV: ["Cape Verde"],
  NLD: ["Holland"],
  PRK: ["North Korea"],
  KOR: ["South Korea"],
  TUR: ["Turkey", "Turkiye"],
  VAT: ["Vatican", "Holy See"],
  FSM: ["Micronesia"],
  ARE: ["UAE", "Emirates"],
  CAF: ["CAR"],
  BIH: ["Bosnia"],
  STP: ["Sao Tome"],
  VCT: ["St Vincent", "Saint Vincent"],
  KNA: ["St Kitts", "Saint Kitts"],
  LCA: ["St Lucia"],
  PSE: ["Palestinian Territories"],
};

const CAPITAL_ALIASES = {
  BOL: ["La Paz"],
  UKR: ["Kiev"],
  IND: ["Delhi"],
  NLD: ["The Hague"],
  CIV: ["Abidjan"],
  MMR: ["Naypyidaw", "Nay Pyi Taw"],
  KAZ: ["Astana", "Nur-Sultan"],
  LKA: ["Colombo", "Sri Jayawardenepura"],
  BEN: ["Cotonou"],
  TZA: ["Dar es Salaam"],
  ISR: ["Tel Aviv"],
  CHE: ["Berne"],
  PSE: ["East Jerusalem", "Jerusalem"],
};

async function worldBank(indicator) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=20000`;
  const res = await fetch(url);
  const [, rows] = await res.json();
  const out = {};
  for (const r of rows) {
    if (r.value == null || !r.countryiso3code) continue;
    const prev = out[r.countryiso3code];
    if (!prev || r.date > prev.year) out[r.countryiso3code] = { value: r.value, year: r.date };
  }
  return out;
}

// Gaps in the World Bank data: Taiwan from its statistics bureau, Vatican City from the Holy See.
const MANUAL = {
  VAT: { population: { value: 800, year: "2023" } },
  TWN: { population: { value: 23_400_000, year: "2024" }, gdpPerCapita: { value: 33_400, year: "2024" } },
};

const latinOnly = (s) => /^[\p{Script=Latin}\p{N}\s.,'’()-]+$/u.test(s);

async function main() {
  const [population, gdp] = await Promise.all([worldBank("SP.POP.TOTL"), worldBank("NY.GDP.PCAP.CD")]);

  const selected = countries.filter((c) => c.unMember || EXTRA.includes(c.cca3));
  const byNumeric = new Map(countries.map((c) => [c.ccn3, c]));
  const selectedCodes = new Set(selected.map(code));

  // Re-key map geometries from ISO numeric to alpha-3 and fill in the missing ids.
  const geoms = topology.objects.countries.geometries;
  const onMap = new Set();
  for (const g of geoms) {
    const name = g.properties.name;
    const c = byNumeric.get(g.id);
    g.id = NAMELESS[name] ?? (c ? code(c) : undefined);
    if (g.id) onMap.add(g.id);
    // `piece` is the original map name, unique per geometry, used to match pieces across detail levels.
    g.properties = { name: c ? c.name.common : name, piece: name };
  }

  const facts = selected.map((c) => {
    const id = code(c);
    // altSpellings start with the two-letter code, which is too easy to hit by accident.
    const alt = c.altSpellings.filter((n) => n.length > 2 && latinOnly(n));
    const names = [c.name.common, c.name.official, ...alt, ...(NAME_ALIASES[id] ?? [])];
    const m = MANUAL[id] ?? {};
    return {
      id,
      cca2: c.cca2.toLowerCase(),
      name: c.name.common,
      names: [...new Set(names)],
      capitals: c.capital,
      capitalAliases: CAPITAL_ALIASES[id] ?? [],
      region: c.region,
      subregion: c.subregion,
      languages: Object.values(c.languages),
      latlng: c.latlng,
      area: c.area,
      onMap: onMap.has(id),
      population: m.population ?? population[id] ?? null,
      gdpPerCapita: m.gdpPerCapita ?? gdp[id] ?? null,
    };
  });
  // Rough "how well known" order, which sets the order new countries are introduced in.
  // Mostly economy size, partly population: Switzerland comes before Ethiopia, which
  // population alone would get the wrong way round.
  const prominence = (f) => {
    const pop = f.population?.value ?? 1000;
    const perHead = f.gdpPerCapita?.value ?? 1500;
    return 0.3 * Math.log10(pop) + 0.7 * Math.log10(pop * perHead);
  };
  facts.sort((a, b) => prominence(b) - prominence(a));

  mkdirSync("public/data", { recursive: true });
  mkdirSync("public/flags", { recursive: true });
  writeFileSync("public/data/world.json", JSON.stringify(topology));
  writeFileSync("public/data/countries.json", JSON.stringify(facts));

  for (const f of facts) {
    const src = `node_modules/flag-icons/flags/4x3/${f.cca2}.svg`;
    if (existsSync(src)) copyFileSync(src, `public/flags/${f.cca2}.svg`);
    else console.warn("no flag for", f.name);
  }

  const missing = facts.filter((f) => !f.population || !f.gdpPerCapita).map((f) => f.name);
  console.log(`${facts.length} countries, ${facts.filter((f) => !f.onMap).length} without a map shape`);
  if (missing.length) console.log("missing World Bank figures:", missing.join(", "));
  console.log("unmatched selected codes:", [...selectedCodes].filter((c) => !facts.some((f) => f.id === c)));
}

main();
