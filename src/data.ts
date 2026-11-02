import { feature, merge } from "topojson-client";
import { filter, filterWeight, presimplify, simplify, sphericalRingArea, sphericalTriangleArea } from "topojson-simplify";
import { geoArea, geoCentroid, geoDistance } from "d3-geo";
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
}

type Piece = GeometryCollection<{ name: string; piece: string }>["geometries"][number];

const propsOf = (g: Piece) => (g.properties ?? {}) as { name?: string; piece?: string };

export async function loadWorld(): Promise<World> {
  const base = import.meta.env.BASE_URL;
  const [topo, raw] = await Promise.all([
    fetch(`${base}data/world.json`).then((r) => r.json() as Promise<Topology>),
    fetch(`${base}data/countries.json`).then((r) => r.json() as Promise<Omit<Country, "rank">[]>),
  ]);

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
  return { countries, byId, shapes, shapeById };
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
