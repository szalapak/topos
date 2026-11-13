/** Small helpers for writing text about countries. */

const TAKES_THE = new Set([
  "United States", "United Kingdom", "United Arab Emirates", "Netherlands", "Philippines", "Bahamas",
  "Gambia", "Maldives", "Comoros", "Solomon Islands", "Marshall Islands", "Dominican Republic",
  "Central African Republic", "Republic of the Congo", "DR Congo",
]);

/** "the Netherlands" in running text; the name alone stays bare in headings and answers. */
export function the(name: string) {
  return TAKES_THE.has(name) ? `the ${name}` : name;
}

export function sentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The full stop for a sentence ending in `s`, unless `s` already has one ("Washington, D.C."). */
export function stop(s: string) {
  return s.endsWith(".") ? "" : ".";
}

/** "Pretoria, Bloemfontein and Cape Town". */
export function listing(items: string[]) {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The version last picked from each set by `oneOf`. */
const lastPicked = new Map<string, number>();

/** One of `versions` at random, never the same one twice in a row from the same `set`. */
export function oneOf<T>(set: string, versions: T[]): T {
  const last = lastPicked.get(set);
  const skip = versions.length > 1 && last !== undefined && last < versions.length ? last : undefined;
  let i = Math.floor(Math.random() * (versions.length - (skip === undefined ? 0 : 1)));
  if (skip !== undefined && i >= skip) i++;
  lastPicked.set(set, i);
  return versions[i];
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
