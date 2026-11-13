import { feature, merge, neighbors } from "topojson-client";
import { filter, filterWeight, presimplify, simplify, sphericalRingArea, sphericalTriangleArea } from "topojson-simplify";
import { geoArea, geoCentroid, geoContains, geoDistance, geoInterpolate } from "d3-geo";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";

export interface Figure {
  value: number;
  year: string;
}

export interface Country {
  id: string;
  cca2: string;
  name: string;
  /** Every accepted spelling of the country's name. */
  names: string[];
  capitals: string[];
  /** Answers accepted for the capital but not shown, e.g. former names or seats of government. */
  capitalAliases: string[];
  region: string;
  subregion: string;
  languages: string[];
  latlng: [number, number];
  area: number;
  onMap: boolean;
  population: Figure | null;
  gdpPerCapita: Figure | null;
  /** Position in the "how well known" order from the data build, 0 is the best known. */
  rank: number;
}

/**
 * Coarser outlines for drawing when zoomed out or moving, from coarsest to full detail.
 * `weight` drops border points that bend the line by less than that area, and `islands`
 * drops islands smaller than that; both in steradians (1e-6 is about 40 km²).
 */
export const DETAIL_LEVELS = [
  { weight: 3e-5, islands: 3e-6 },
  { weight: 1e-5, islands: 1e-6 },
  { weight: 1e-6, islands: 0 },
  { weight: 0, islands: 0 },
];

export interface Shape {
  /** Alpha-3 code; missing for disputed areas that are not quiz countries. */
  id?: string;
  name: string;
  /** Full-detail outline, used for tapping. */
  feature: Feature<Polygon | MultiPolygon>;
  /** One outline per entry in DETAIL_LEVELS, used for drawing. */
  outlines: Feature[];
  /** Point used for the small-country marker. */
  centroid: [number, number];
  /** Area in steradians, used to decide when a shape is too small to tap. */
  area: number;
  /** A circle on the globe (centre, radius in radians) that contains the whole shape. */
  bound: { center: [number, number]; radius: number };
}

export interface World {
  countries: Country[];
  byId: Map<string, Country>;
  shapes: Shape[];
  shapeById: Map<string, Shape>;
  /** Map shapes that share a land border, by id. */
  borders: Map<string, Set<string>>;
}

type Piece = GeometryCollection<{ name: string; piece: string }>["geometries"][number];

const propsOf = (g: Piece) => (g.properties ?? {}) as { name?: string; piece?: string };

export async function loadWorld(): Promise<World> {
  const base = import.meta.env.BASE_URL;
  const [topo, raw] = await Promise.all([
    fetch(`${base}data/world.json`).then((r) => r.json() as Promise<Topology>),
    fetch(`${base}data/countries.json`).then((r) => r.json() as Promise<Omit<Country, "rank">[]>),
  ]);
  return buildWorld(topo, raw);
}

/** The world from the map and the country facts, as loaded by `loadWorld`. */
export function buildWorld(topo: Topology, raw: Omit<Country, "rank">[]): World {
  const countries: Country[] = raw.map((c, rank) => ({ ...c, rank }));
  const byId = new Map(countries.map((c) => [c.id, c]));

  const presimplified: Topology = presimplify(topo as never, sphericalTriangleArea);
  const levels = DETAIL_LEVELS.map(({ weight, islands }) => {
    if (!weight) return topo;
    const t = simplify(presimplified as never, weight) as Topology;
    return islands ? (filter(t as never, filterWeight(t as never, islands, sphericalRingArea as never)) as Topology) : t;
  });
  // Map pieces are matched across levels by their unique piece name, since the island filter
  // drops whole microstates from the coarse levels.
  const pieces = levels.map(
    (t) => new Map((t.objects.countries as GeometryCollection).geometries.map((g) => [propsOf(g as Piece).piece ?? "", g as Piece])),
  );

  // Several map pieces can belong to one country (e.g. Somaliland is part of Somalia here),
  // so group them and merge each group into a single outline.
  const groups = new Map<string, string[]>();
  const shapes: Shape[] = [];
  const full = pieces[pieces.length - 1];
  for (const [piece, g] of full) {
    if (g.id == null) shapes.push(makeShape(undefined, propsOf(g).name ?? piece, [piece]));
    else groups.set(String(g.id), [...(groups.get(String(g.id)) ?? []), piece]);
  }
  for (const [id, names] of groups) shapes.push(makeShape(id, byId.get(id)?.name ?? names[0], names));

  function makeShape(id: string | undefined, name: string, names: string[]): Shape {
    // Build from full detail down, so a level missing this shape can reuse the finer outline.
    const outlines: Feature[] = [];
    for (let level = levels.length - 1; level >= 0; level--) {
      const gs = names.map((n) => pieces[level].get(n)).filter((g) => g != null);
      if (gs.length === 0) outlines[level] = outlines[level + 1];
      else if (gs.length === 1) outlines[level] = feature(levels[level], gs[0]) as Feature;
      else outlines[level] = { type: "Feature", properties: {}, geometry: merge(levels[level], gs as never) };
    }
    const f = outlines[outlines.length - 1] as Feature<Polygon | MultiPolygon>;
    return { id, name, feature: f, outlines, centroid: largestPartCentroid(f), area: geoArea(f), bound: boundingCircle(f) };
  }

  // Countries too small for this map's detail (Tuvalu) still need something to tap.
  for (const c of countries) {
    if (c.onMap) continue;
    const [lat, lng] = c.latlng;
    const empty: Feature<Polygon> = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } };
    shapes.push({
      id: c.id,
      name: c.name,
      feature: empty,
      outlines: DETAIL_LEVELS.map(() => empty),
      centroid: [lng, lat],
      area: 0,
      bound: { center: [lng, lat], radius: 0 },
    });
  }

  const shapeById = new Map(shapes.filter((s) => s.id).map((s) => [s.id!, s]));
  return { countries, byId, shapes, shapeById, borders: landBorders(topo) };
}

/** Pieces of the map that share an edge belong to countries with a land border. */
function landBorders(topo: Topology): Map<string, Set<string>> {
  const geometries = (topo.objects.countries as GeometryCollection).geometries;
  const borders = new Map<string, Set<string>>();
  neighbors(geometries).forEach((others, i) => {
    const a = geometries[i].id;
    for (const j of others) {
      const b = geometries[j].id;
      if (a == null || b == null || a === b) continue;
      if (!borders.has(String(a))) borders.set(String(a), new Set());
      borders.get(String(a))!.add(String(b));
    }
  });
  return borders;
}

/** Sea gaps up to this wide make neighbours: France and the UK, Japan and South Korea, Cuba and Haiti. */
const SEA_GAP_KM = 250;
const EARTH_RADIUS_KM = 6371;

/**
 * Countries whose main parts are further apart than this are never neighbours, even if an
 * overseas territory touches the other one: France borders Brazil through French Guiana, and
 * Mayotte is next to Comoros, but nobody tapping Brazil for France was nearly right. The
 * furthest real pair is Russia and Poland, about 4,300 km apart.
 */
const OVERSEAS_KM = 6000;

/** Whether two countries share a land border, or face each other across a short stretch of sea. */
export function nearness(world: World, a: string, b: string): "border" | "sea" | undefined {
  const sa = world.shapeById.get(a);
  const sb = world.shapeById.get(b);
  if (!sa || !sb || a === b) return undefined;
  if (geoDistance(sa.centroid, sb.centroid) * EARTH_RADIUS_KM > OVERSEAS_KM) return undefined;
  if (world.borders.get(a)?.has(b)) return "border";
  return acrossTheWater(world, sa, sb, SEA_GAP_KM / EARTH_RADIUS_KM) ? "sea" : undefined;
}

/**
 * Whether two shapes come within `limit` radians of each other with no third country in
 * between, so Slovenia and Slovakia (Austria and Hungary between them) are not neighbours. Uses
 * the coarsest outlines, which are a few kilometres out at most, and compares only the points
 * that could be near the other shape at all, so it takes a few milliseconds even for Russia.
 */
function acrossTheWater(world: World, a: Shape, b: Shape, limit: number): boolean {
  if (geoDistance(a.bound.center, b.bound.center) - a.bound.radius - b.bound.radius > limit) return false;
  const nearOther = (s: Shape, other: Shape) =>
    outlinePoints(s).filter((p) => geoDistance(p, other.bound.center) <= other.bound.radius + limit);
  const pb = nearOther(b, a);
  let best: { p: [number, number]; q: [number, number]; d: number } | undefined;
  for (const p of nearOther(a, b)) {
    for (const q of pb) {
      const d = geoDistance(p, q);
      if (d <= limit && d < (best?.d ?? Infinity)) best = { p, q, d };
    }
  }
  if (!best) return false;
  // Look along the shortest gap for land belonging to anyone else.
  const along = geoInterpolate(best.p, best.q);
  return [0.25, 0.5, 0.75].every((t) => {
    const point = along(t);
    return !world.shapes.some(
      (s) => s !== a && s !== b && geoDistance(point, s.bound.center) <= s.bound.radius && geoContains(s.feature, point),
    );
  });
}

/** Every point of a shape's coarsest outline, or its centre for a country too small for the map. */
function outlinePoints(s: Shape): [number, number][] {
  const g = s.outlines[0].geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const points = polys.flatMap((poly) => poly.flatMap((ring) => ring as [number, number][]));
  return points.length ? points : [s.centroid];
}

function boundingCircle(f: Feature<Polygon | MultiPolygon>): Shape["bound"] {
  const center = geoCentroid(f) as [number, number];
  let radius = 0;
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys)
    for (const ring of poly) for (const pt of ring) radius = Math.max(radius, geoDistance(center, pt as [number, number]));
  return { center, radius };
}

/** Centroid of the biggest polygon, so France's marker sits in France rather than mid-Atlantic. */
function largestPartCentroid(f: Feature<Polygon | MultiPolygon>): [number, number] {
  if (f.geometry.type === "Polygon") return geoCentroid(f) as [number, number];
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of f.geometry.coordinates) {
    const p: Polygon = { type: "Polygon", coordinates };
    const a = geoArea(p);
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  return geoCentroid(best!) as [number, number];
}
