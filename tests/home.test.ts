import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessHomeArea, type HomeCountry } from "../src/home.ts";
import { AREAS } from "../src/knowledge.ts";

const countries: HomeCountry[] = JSON.parse(readFileSync(new URL("../public/data/countries.json", import.meta.url), "utf8"));
const areaName = (zone: string, languages: string[] = []) => {
  const a = guessHomeArea(zone, languages, countries);
  return a === null ? null : AREAS[a].name;
};

test("time zones named after a capital or a country", () => {
  assert.equal(areaName("Europe/Warsaw"), "Europe");
  assert.equal(areaName("Asia/Riyadh"), "Middle East and North Africa");
  assert.equal(areaName("Africa/Cairo"), "Middle East and North Africa");
  assert.equal(areaName("Asia/Kabul"), "South and Central Asia");
  assert.equal(areaName("America/Bogota"), "South America");
  assert.equal(areaName("America/La_Paz"), "South America");
  assert.equal(areaName("Asia/Qatar"), "Middle East and North Africa");
  assert.equal(areaName("Indian/Maldives"), "South and Central Asia");
});

test("time zones named after other cities", () => {
  assert.equal(areaName("America/New_York"), "North and Central America");
  assert.equal(areaName("America/Sao_Paulo"), "South America");
  assert.equal(areaName("America/Argentina/Salta"), "South America");
  assert.equal(areaName("Asia/Kolkata"), "South and Central Asia");
  assert.equal(areaName("Asia/Dubai"), "Middle East and North Africa");
  assert.equal(areaName("Europe/Istanbul"), "Middle East and North Africa");
  assert.equal(areaName("Asia/Shanghai"), "East and Southeast Asia");
  assert.equal(areaName("Asia/Novosibirsk"), "Europe");
  assert.equal(areaName("Africa/Lagos"), "Sub-Saharan Africa");
  assert.equal(areaName("Australia/Sydney"), "Oceania");
  assert.equal(areaName("Pacific/Honolulu"), "North and Central America");
});

test("without a useful time zone, the region in the language setting", () => {
  assert.equal(areaName("Etc/UTC", ["pt-BR", "en"]), "South America");
  assert.equal(areaName("UTC", ["en", "pl-PL"]), "Europe");
  assert.equal(areaName("UTC", ["en"]), null);
  assert.equal(areaName("Antarctica/Troll"), null);
  // The time zone wins: plenty of people keep their browser in American English.
  assert.equal(areaName("Europe/Berlin", ["en-US"]), "Europe");
});

test("every time zone the browser knows gets a sensible answer", () => {
  for (const zone of Intl.supportedValuesOf("timeZone")) {
    const name = areaName(zone);
    if (zone.startsWith("Antarctica/") || zone.startsWith("Arctic/") || zone === "Indian/Kerguelen") continue;
    assert.notEqual(name, null, zone);
    if (zone.startsWith("Europe/") && zone !== "Europe/Istanbul") assert.equal(name, "Europe", zone);
  }
});
