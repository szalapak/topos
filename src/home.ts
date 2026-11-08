import { normalize } from "./answers.ts";
import { areaOf, AREAS } from "./knowledge.ts";

/**
 * Guesses which part of the world the player lives in, so the quiz can start by assuming they
 * know it a little better (people usually know their own region best). It goes by the
 * browser's time zone, then its language setting; nothing is sent anywhere.
 */

export interface HomeCountry {
  cca2: string;
  name: string;
  names: string[];
  capitals: string[];
  capitalAliases: string[];
  region: string;
  subregion: string;
}

const area = (name: (typeof AREAS)[number]["name"]) => AREAS.findIndex((a) => a.name === name);
const EUROPE = area("Europe");
const MENA = area("Middle East and North Africa");
const AFRICA = area("Sub-Saharan Africa");
const SOUTH_ASIA = area("South and Central Asia");
const EAST_ASIA = area("East and Southeast Asia");
const NORTH_AMERICA = area("North and Central America");
const SOUTH_AMERICA = area("South America");
const OCEANIA = area("Oceania");

/** The part of the world for each continent in a time zone's name, when nothing better fits. */
const BY_CONTINENT: Record<string, number> = {
  Europe: EUROPE,
  Africa: AFRICA,
  Asia: EAST_ASIA,
  America: NORTH_AMERICA,
  Australia: OCEANIA,
  Pacific: OCEANIA,
  Atlantic: EUROPE,
  Indian: AFRICA,
};

/**
 * Time zones named after a city that is not a capital, and that lie outside their continent's
 * usual part of the world. Zones named after a capital or a country (Europe/Warsaw, Asia/Qatar)
 * are found from the country list instead.
 */
const EXCEPTIONS: Record<number, string[]> = {
  [EUROPE]: [
    // Russia, counted with Europe in the country data.
    "Asia/Anadyr", "Asia/Barnaul", "Asia/Chita", "Asia/Irkutsk", "Asia/Kamchatka", "Asia/Khandyga",
    "Asia/Krasnoyarsk", "Asia/Magadan", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Omsk",
    "Asia/Sakhalin", "Asia/Srednekolymsk", "Asia/Tomsk", "Asia/Ust-Nera", "Asia/Vladivostok",
    "Asia/Yakutsk", "Asia/Yekaterinburg", "Africa/Ceuta",
  ],
  [MENA]: [
    "Africa/Casablanca", "Africa/El_Aaiun", "Asia/Aden", "Asia/Dubai", "Asia/Famagusta", "Asia/Gaza",
    "Asia/Hebron", "Asia/Istanbul", "Asia/Tel_Aviv", "Europe/Istanbul",
  ],
  [SOUTH_ASIA]: [
    "Asia/Almaty", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Atyrau", "Asia/Calcutta", "Asia/Karachi",
    "Asia/Katmandu", "Asia/Kolkata", "Asia/Oral", "Asia/Qostanay", "Asia/Qyzylorda", "Asia/Samarkand",
    "Indian/Chagos",
  ],
  [NORTH_AMERICA]: ["Atlantic/Bermuda", "Pacific/Honolulu", "Pacific/Johnston", "Pacific/Midway"],
  [SOUTH_AMERICA]: [
    // Brazil, Argentina (also every "America/Argentina/..." zone), Chile, Ecuador, French Guiana.
    "America/Araguaina", "America/Bahia", "America/Belem", "America/Boa_Vista", "America/Campo_Grande",
    "America/Catamarca", "America/Cayenne", "America/Cordoba", "America/Coyhaique", "America/Cuiaba",
    "America/Eirunepe", "America/Fortaleza", "America/Guayaquil", "America/Jujuy", "America/Maceio",
    "America/Manaus", "America/Mendoza", "America/Noronha", "America/Porto_Velho", "America/Punta_Arenas",
    "America/Recife", "America/Rio_Branco", "America/Rosario", "America/Santarem", "America/Sao_Paulo",
    "Atlantic/South_Georgia", "Atlantic/Stanley", "Pacific/Easter", "Pacific/Galapagos",
  ],
  [AFRICA]: ["Atlantic/St_Helena"],
  [OCEANIA]: ["Indian/Christmas", "Indian/Cocos"],
};
const EXCEPTION_AREA = new Map(Object.entries(EXCEPTIONS).flatMap(([a, zones]) => zones.map((z) => [z, Number(a)])));

/** The area index (see `AREAS`) the player probably lives in, or null with nothing to go on. */
export function guessHomeArea(timeZone: string, languages: readonly string[], countries: readonly HomeCountry[]): number | null {
  const fromZone = zoneArea(timeZone, countries);
  if (fromZone !== null) return fromZone;
  // No useful time zone (UTC, say): the region in a language setting like "pt-BR".
  for (const language of languages) {
    const region = /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(language)?.[1]?.toLowerCase();
    const country = region && countries.find((c) => c.cca2.toLowerCase() === region);
    if (country) return areaOrNull(country);
  }
  return null;
}

function zoneArea(timeZone: string, countries: readonly HomeCountry[]): number | null {
  const parts = timeZone.split("/");
  const continent = parts[0];
  if (EXCEPTION_AREA.has(timeZone)) return EXCEPTION_AREA.get(timeZone)!;
  if (timeZone.startsWith("America/Argentina/")) return SOUTH_AMERICA;
  if (!(continent in BY_CONTINENT)) return null;
  const city = normalize(parts[parts.length - 1].replace(/_/g, " "));
  const country = countries.find((c) =>
    [c.name, ...c.names, ...c.capitals, ...c.capitalAliases].some((n) => normalize(n) === city),
  );
  return (country && areaOrNull(country)) ?? BY_CONTINENT[continent];
}

function areaOrNull(c: HomeCountry): number | null {
  const a = areaOf(c);
  return a < 0 ? null : a;
}

/** The guess for this browser, or null when it gives nothing away or can't be asked. */
export function browserHomeArea(countries: readonly HomeCountry[]): number | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return guessHomeArea(zone, navigator.languages ?? [navigator.language], countries);
  } catch {
    return null;
  }
}
