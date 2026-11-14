import { geoDistance } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Shape } from "./data";

/** How many sparks fly from a border, and from the smaller ring round a tiny country's dot. */
const COUNT = 40;
const RING_COUNT = 24;
/** Sparks set off within this many milliseconds of each other. */
const SPREAD_MS = 200;
/** Ranges each spark's look is picked from: how long it lasts, how far it flies, how thick it is. */
const LIFE_MS: [number, number] = [700, 1000];
const REACH_PX: [number, number] = [35, 75];
const SIZE_PX: [number, number] = [2, 3];

interface Spark {
  /** Where it leaves the border, and a point just outside the border there, which gives its direction. */
  from?: [number, number];
  out?: [number, number];
  /** Its direction on screen when it leaves the ring around a small country's dot. */
  angle: number;
  /** Milliseconds after the start that it appears, and how long it lasts. */
  delay: number;
  life: number;
  /** How far it travels, in pixels. */
  reach: number;
  size: number;
  color: string;
  /** Random phase for twinkling and turning. */
  phase: number;
  /** How far the path curves to one side, in radians. */
  bend: number;
}

export interface Burst {
  shape: Shape;
  sparks: Spark[];
  /** Sparks leave the ring drawn around a small country's dot rather than its border. */
  ring: boolean;
  /** Milliseconds from the start until the last spark has faded. */
  length: number;
}

/** Where the sparks leave from. */
export interface Placement {
  /** From the ring around a small country's dot rather than its border. */
  ring: boolean;
  /** Only from parts of the border this many radians from the country's main part, so France's don't go to French Guiana. */
  view: number;
  /** Which of the shape's outlines to follow, the one the globe draws. */
  level: number;
}

/** Shooting stars in the given colours, flying out from a country's border. */
export function makeBurst(shape: Shape, colors: string[], { ring, view, level }: Placement, random: () => number = Math.random): Burst {
  const count = ring ? RING_COUNT : COUNT;
  const border = ring ? [] : borderPoints(shape, count, view, level, random);
  const sparks: Spark[] = [];
  for (let i = 0; i < count; i++) {
    sparks.push({
      from: border[i]?.at,
      out: border[i]?.out,
      angle: ((i + random() - 0.5) / count) * 2 * Math.PI,
      delay: random() * SPREAD_MS,
      life: between(LIFE_MS, random),
      reach: between(REACH_PX, random),
      size: between(SIZE_PX, random),
      // In turn round the border, so every colour gets an even share.
      color: colors[i % colors.length],
      phase: random() * 2 * Math.PI,
      bend: (random() - 0.5) * 0.7,
    });
  }
  return { shape, sparks, ring: border.length === 0, length: Math.max(0, ...sparks.map((s) => s.delay + s.life)) };
}

export interface View {
  projection: GeoProjection;
  /** The point facing the viewer, as [longitude, latitude]. */
  center: [number, number];
  /** Outline colour that keeps white and pale sparks visible. */
  edge: string;
  /** Radius of the ring drawn around a small country's dot. */
  ringRadius: number;
}

/** Draws a burst `elapsed` milliseconds after it started. */
export function drawBurst(ctx: CanvasRenderingContext2D, burst: Burst, elapsed: number, view: View) {
  const { projection, center } = view;
  let ringCenter: [number, number] | null = null;
  if (burst.ring) {
    if (!facing(burst.shape.centroid, center)) return;
    ringCenter = projection(burst.shape.centroid);
    if (!ringCenter) return;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const spark of burst.sparks) {
    const t = (elapsed - spark.delay) / spark.life;
    if (t < 0 || t >= 1) continue;
    let start: Start;
    if (ringCenter) {
      const [ux, uy] = [Math.cos(spark.angle), Math.sin(spark.angle)];
      start = { x: ringCenter[0] + ux * view.ringRadius, y: ringCenter[1] + uy * view.ringRadius, ux, uy };
    } else {
      if (!facing(spark.from!, center)) continue;
      const p = projection(spark.from!);
      const q = projection(spark.out!);
      if (!p || !q) continue;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!d) continue;
      start = { x: p[0], y: p[1], ux: (q[0] - p[0]) / d, uy: (q[1] - p[1]) / d };
    }
    drawSpark(ctx, spark, t, start, elapsed, view.edge);
  }
  ctx.globalAlpha = 1;
}

/** Where a spark leaves from on screen, and the way it heads (a unit vector). */
interface Start {
  x: number;
  y: number;
  ux: number;
  uy: number;
}

/** A spark `t` of the way through its life (0 to 1): a fading trail with a twinkling star at its head. */
function drawSpark(ctx: CanvasRenderingContext2D, s: Spark, t: number, start: Start, elapsed: number, edge: string) {
  const e = easeOut(t);
  const tailE = easeOut(Math.max(0, t - 0.22));
  const [hx, hy] = travel(start, s.bend * e, s.reach * e);
  const [tx, ty] = travel(start, s.bend * tailE, s.reach * tailE);
  ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  const trail = ctx.createLinearGradient(tx, ty, hx, hy);
  trail.addColorStop(0, `${s.color}00`);
  trail.addColorStop(1, s.color);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = trail;
  ctx.lineWidth = s.size;
  ctx.stroke();
  star(ctx, hx, hy, s.size * 2.2 * twinkle(s, elapsed), s.phase + t * 3);
  ctx.fillStyle = s.color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/** A four-pointed star. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = turn + (i * Math.PI) / 2;
    const b = a + Math.PI / 4;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(b) * r * 0.3, y + Math.sin(b) * r * 0.3);
  }
  ctx.closePath();
}

/** Where a spark is after travelling `dist` from its start, its heading turned by `turn` along the way. */
function travel({ x, y, ux, uy }: Start, turn: number, dist: number): [number, number] {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return [x + (ux * c - uy * s) * dist, y + (ux * s + uy * c) * dist];
}

function twinkle(s: Spark, elapsed: number) {
  return 0.8 + 0.2 * Math.sin(s.phase + elapsed * 0.03);
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function between([lo, hi]: [number, number], random: () => number) {
  return lo + (hi - lo) * random();
}

function facing(point: [number, number], center: [number, number]) {
  return geoDistance(point, center) < Math.PI / 2 - 0.02;
}

const DEG = 180 / Math.PI;

/** Longitude difference taken the short way round, in degrees. */
function wrap(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Twice the area inside a ring on a flat longitude and latitude map: above zero when it runs
 * clockwise, as every outline in the map data does, and zero for an island the simplifying
 * has squashed flat.
 */
function clockwiseArea(ring: [number, number][]) {
  let area = 0;
  for (let i = 1; i < ring.length; i++) area += wrap(ring[i][0] - ring[i - 1][0]) * (ring[i][1] + ring[i - 1][1]);
  return area;
}

/**
 * `n` points spread evenly along a country's border, each with a point just outside the
 * border there. Directions come from the border over a stretch either side, so a jagged
 * coast doesn't send sparks every which way.
 */
function borderPoints(shape: Shape, n: number, view: number, level: number, random: () => number) {
  const g = shape.outlines[level].geometry;
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const rings = polygons
    .map((p) => p[0] as [number, number][])
    .filter((r) => r && r.length > 3 && clockwiseArea(r) > 0 && r.some((pt) => geoDistance(pt, shape.centroid) < view));
  const sums = rings.map((r) => {
    const sum = [0];
    for (let i = 1; i < r.length; i++) sum.push(sum[i - 1] + geoDistance(r[i - 1], r[i]));
    return sum;
  });
  const ringLength = (k: number) => sums[k][sums[k].length - 1];
  const total = sums.reduce((a, _, k) => a + ringLength(k), 0);
  if (!total) return [];

  const pointAt = (k: number, dist: number): [number, number] => {
    const ring = rings[k];
    const sum = sums[k];
    const len = ringLength(k);
    const d = ((dist % len) + len) % len;
    let lo = 0;
    let hi = sum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const f = (d - sum[lo]) / (sum[hi] - sum[lo] || 1);
    const [a, b] = [ring[lo], ring[hi]];
    return [a[0] + wrap(b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };

  const points: { at: [number, number]; out: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    let dist = ((i + random()) / n) * total;
    let k = 0;
    while (k < rings.length - 1 && dist >= ringLength(k)) {
      dist -= ringLength(k);
      k++;
    }
    const len = ringLength(k);
    const at = pointAt(k, dist);
    const stretch = Math.min(len * 0.08, total * 0.02);
    const [a, b] = [pointAt(k, dist - stretch), pointAt(k, dist + stretch)];
    // Square to the border, in a flat map of the ground around this point. The border runs
    // clockwise, so the country is on its right and outside is on its left.
    const squash = Math.max(0.05, Math.cos(at[1] / DEG));
    let dx = wrap(b[0] - a[0]) * squash;
    let dy = b[1] - a[1];
    // Nowhere to go along (a squashed island): away from the middle of the country instead.
    if (!dx && !dy) [dx, dy] = [at[1] - shape.centroid[1], -wrap(at[0] - shape.centroid[0]) * squash];
    const norm = Math.hypot(dx, dy) || 1;
    const step = 0.01;
    points.push({ at, out: [at[0] + (-dy / norm) * (step / squash), at[1] + (dx / norm) * step] });
  }
  return points;
}
