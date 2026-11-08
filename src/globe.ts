import { geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { GeoPath, GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Position } from "geojson";
import { DETAIL_LEVELS, type Shape, type World } from "./data";
import type { Knowledge } from "./deck";

export type HighlightKind = "target" | "correct" | "wrong";

/** Shapes narrower than this on screen get a dot so they can still be seen and tapped. */
const MARKER_BELOW_PX = 4;
const MARKER_RADIUS = 4.5;
/** A tap in open sea this close to a dot counts as tapping it (island nations). */
const MARKER_SEA_HIT_PX = 16;
/** Highlighted shapes narrower than this get a ring drawn around them. */
const RING_BELOW_PX = 22;
const TAP_SLOP_PX = 7;
const KNOWLEDGE_LEVELS: Knowledge[] = ["weak", "learning", "known"];
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 40;

interface Gesture {
  startX: number;
  startY: number;
  moved: boolean;
  multi: boolean;
  startDist?: number;
  startZoom?: number;
}

export class Globe {
  onTap?: (shape: Shape | null, x: number, y: number) => void;

  private ctx: CanvasRenderingContext2D;
  private projection: GeoProjection;
  private path: GeoPath;
  private graticule = geoGraticule10();
  private width = 0;
  private height = 0;
  private dpr = 1;
  private baseScale = 1;
  private zoom = 1;
  private rotation: [number, number] = [-15, -25];
  private highlights = new Map<string, HighlightKind>();
  private knowledge = new Map<string, Knowledge>();
  private markers: { id: string; x: number; y: number }[] = [];
  private colors: Record<string, string> = {};
  private frame: number | null = null;
  private animation: number | null = null;
  /** Where the current or last animation ends. */
  private heading: { rotation: [number, number]; zoom: number } = { rotation: [0, 0], zoom: 1 };
  private spinning = false;
  /** While the globe moves it is drawn with coarser outlines, then redrawn sharp once it settles. */
  private moving = false;
  private settleTimer: number | undefined;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.projection = geoOrthographic().precision(0.6);
    this.path = geoPath(this.projection, this.ctx);
    this.readColors();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      this.readColors();
      this.requestRender();
    });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindPointer();
  }

  setHighlights(entries: [string, HighlightKind][]) {
    this.highlights = new Map(entries);
    this.requestRender();
  }

  /** Colours countries by how well they are known. An empty map shows plain land. */
  setKnowledge(knowledge: Map<string, Knowledge>) {
    this.knowledge = knowledge;
    this.requestRender();
  }

  /** Slow idle rotation for the home screen; any touch stops it. */
  spin(on: boolean) {
    this.spinning = on;
    if (on) this.cancelAnimation();
    this.requestRender();
  }

  /** Turns the globe to face a country, zoomed so it is comfortably visible with some neighbours. */
  flyTo(id: string, duration = 900) {
    const shape = this.world.shapeById.get(id);
    if (!shape) return;
    const [lng, lat] = shape.centroid;
    const size = Math.sqrt(shape.area);
    const zoom = size > 0 ? clamp(0.28 / size, 1, 12) : 12;
    this.animateTo([-lng, clamp(-lat, -70, 70)], zoom, duration);
  }

  /** Zooms out if closer than `max`, so a "find it" question does not start zoomed on a neighbour. */
  zoomOutTo(max: number) {
    // Where a move still under way is heading counts, not only where the globe is now.
    const { rotation, zoom } = this.animation != null ? this.heading : { rotation: this.rotation, zoom: this.zoom };
    if (zoom > max) this.animateTo(rotation, max, 500);
  }

  zoomBy(factor: number) {
    this.animateTo(this.rotation, clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM), 250);
  }

  /**
   * True when a tap at (x, y) lands within `tolerance` pixels of the given country's outline
   * or dot, which forgives a finger that slips over a border or just misses an island.
   */
  isNear(id: string, x: number, y: number, tolerance: number): boolean {
    const marker = this.markers.find((m) => m.id === id);
    if (marker && Math.hypot(marker.x - x, marker.y - y) <= MARKER_RADIUS + tolerance) return true;
    const shape = this.world.shapeById.get(id);
    if (!shape) return false;
    const center = this.center();
    let best = Infinity;
    const visit = (ring: Position[]) => {
      for (const pt of ring) {
        if (geoDistance(pt as [number, number], center) > Math.PI / 2 - 0.01) continue;
        const p = this.projection(pt as [number, number]);
        if (p) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
      }
    };
    const g = shape.feature.geometry;
    if (g.type === "Polygon") g.coordinates.forEach(visit);
    else g.coordinates.forEach((poly) => poly.forEach(visit));
    return best <= tolerance;
  }

  /**
   * The country under a tap. A dot wins only when tapped squarely, since on a zoomed-out phone
   * the dots sit on top of their neighbours; otherwise the outline underneath wins, and a tap
   * in open sea goes to the nearest dot within reach.
   */
  private hit(x: number, y: number): Shape | null {
    const dot = (reach: number) => {
      let nearest: { id: string; d: number } | null = null;
      for (const m of this.markers) {
        const d = Math.hypot(m.x - x, m.y - y);
        if (d <= reach && (!nearest || d < nearest.d)) nearest = { id: m.id, d };
      }
      return nearest ? (this.world.shapeById.get(nearest.id) ?? null) : null;
    };
    const onDot = dot(MARKER_RADIUS + 1);
    if (onDot) return onDot;

    const lonlat =
      Math.hypot(x - this.width / 2, y - this.height / 2) <= this.projection.scale() ? this.projection.invert!([x, y]) : null;
    let fallback: Shape | null = null;
    if (lonlat) {
      for (const s of this.world.shapes) {
        if (geoDistance(lonlat, s.bound.center) > s.bound.radius) continue;
        if (!geoContains(s.feature, lonlat)) continue;
        if (s.id && this.world.byId.has(s.id)) return s;
        fallback ??= s;
      }
    }
    return fallback ?? dot(MARKER_SEA_HIT_PX);
  }

  private center(): [number, number] {
    return [-this.rotation[0], -this.rotation[1]];
  }

  private readColors() {
    const css = getComputedStyle(document.documentElement);
    for (const key of ["ocean", "graticule", "land", "border", "rim", "target", "correct", "wrong", "marker", "known", "learning", "weak"]) {
      this.colors[key] = css.getPropertyValue(`--globe-${key}`).trim();
    }
  }

  private resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.baseScale = Math.max(40, Math.min(rect.width, rect.height) / 2 - 12);
    this.requestRender();
  }

  private requestRender() {
    if (this.frame != null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.spinning) {
        this.rotation = [this.rotation[0] + 0.08, this.rotation[1]];
        this.markMoving();
        this.requestRender();
      }
      this.render();
    });
  }

  private render() {
    const { ctx, path, colors } = this;
    const scale = this.baseScale * this.zoom;
    this.projection.scale(scale).translate([this.width / 2, this.height / 2]).rotate(this.rotation);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineJoin = "round";

    const sphere: GeoPermissibleObjects = { type: "Sphere" };
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = colors.ocean;
    ctx.fill();

    ctx.beginPath();
    path(this.graticule);
    ctx.strokeStyle = colors.graticule;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const visible = this.visibleShapes();
    const level = this.detailLevel(scale);
    // Land is filled once per colour (plain, then each knowledge level), so every outline is
    // projected only once per frame.
    const byFill = new Map<string, Shape[]>([["land", []], ...KNOWLEDGE_LEVELS.map((k): [string, Shape[]] => [k, []])]);
    for (const s of visible) byFill.get((s.id && this.knowledge.get(s.id)) || "land")!.push(s);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.6;
    for (const [fill, shapes] of byFill) {
      if (!shapes.length) continue;
      ctx.beginPath();
      for (const s of shapes) path(s.outlines[level]);
      ctx.fillStyle = colors[fill];
      ctx.fill();
      ctx.stroke();
    }

    for (const [id, kind] of this.highlights) {
      const shape = this.world.shapeById.get(id);
      if (!shape) continue;
      ctx.beginPath();
      path(shape.outlines[level]);
      ctx.fillStyle = colors[kind];
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.stroke();
    }

    const center = this.center();
    this.markers = [];
    for (const s of this.world.shapes) {
      if (!s.id || !this.world.byId.has(s.id)) continue;
      const px = Math.sqrt(s.area) * scale;
      const kind = this.highlights.get(s.id);
      if (px >= MARKER_BELOW_PX && !(kind && px < RING_BELOW_PX)) continue;
      if (geoDistance(s.centroid, center) > Math.PI / 2 - 0.02) continue;
      const p = this.projection(s.centroid);
      if (!p) continue;
      if (px < MARKER_BELOW_PX) {
        this.markers.push({ id: s.id, x: p[0], y: p[1] });
        ctx.beginPath();
        ctx.arc(p[0], p[1], MARKER_RADIUS, 0, Math.PI * 2);
        const known = this.knowledge.get(s.id);
        ctx.fillStyle = kind ? colors[kind] : known ? colors[known] : colors.marker;
        ctx.fill();
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (kind) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 15, 0, Math.PI * 2);
        ctx.strokeStyle = colors[kind];
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    path(sphere);
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /** Shapes that could be on screen: on the near side of the globe and inside the viewport. */
  private visibleShapes(): Shape[] {
    const scale = this.projection.scale();
    const halfDiagonal = Math.hypot(this.width, this.height) / 2;
    const reach = halfDiagonal >= scale ? Math.PI / 2 : Math.asin(halfDiagonal / scale);
    const center = this.center();
    return this.world.shapes.filter((s) => geoDistance(center, s.bound.center) - s.bound.radius < reach);
  }

  /** Coarsest outline whose dropped detail is under about a pixel; one step coarser while moving. */
  private detailLevel(scale: number): number {
    const pixelArea = (0.8 / scale) ** 2;
    const level = DETAIL_LEVELS.findIndex((l) => l.weight <= pixelArea);
    return Math.max(0, level - (this.moving ? 1 : 0));
  }

  private markMoving() {
    this.moving = true;
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.moving = false;
      this.requestRender();
    }, 150);
  }

  private animateTo(rotation: [number, number], zoom: number, duration: number) {
    this.cancelAnimation();
    this.spinning = false;
    this.heading = { rotation, zoom };
    const from = [...this.rotation] as [number, number];
    const fromZoom = this.zoom;
    // Take the short way round in longitude.
    const dLng = ((((rotation[0] - from[0]) % 360) + 540) % 360) - 180;
    const dLat = rotation[1] - from[1];
    // Zoom out part-way when travelling far, so the move reads as flying rather than sliding.
    const far = Math.hypot(dLng, dLat) > 40;
    const midZoom = Math.min(fromZoom, zoom, 1);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.rotation = [from[0] + dLng * e, from[1] + dLat * e];
      if (!far) this.zoom = lerpLog(fromZoom, zoom, e);
      else this.zoom = e < 0.5 ? lerpLog(fromZoom, midZoom, e * 2) : lerpLog(midZoom, zoom, e * 2 - 1);
      this.markMoving();
      this.render();
      this.animation = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.animation = requestAnimationFrame(step);
  }

  private cancelAnimation() {
    if (this.animation != null) cancelAnimationFrame(this.animation);
    this.animation = null;
  }

  private bindPointer() {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      this.cancelAnimation();
      this.spinning = false;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) {
        this.gesture = { startX: p.x, startY: p.y, moved: false, multi: false };
      } else if (this.pointers.size === 2 && this.gesture) {
        const [a, b] = [...this.pointers.values()];
        this.gesture.multi = true;
        this.gesture.startDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.gesture.startZoom = this.zoom;
      }
    });

    c.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev || !this.gesture) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      const g = this.gesture;
      if (Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP_PX) g.moved = true;

      if (this.pointers.size === 2 && g.startDist) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = clamp((g.startZoom! * dist) / g.startDist, MIN_ZOOM, MAX_ZOOM);
        // Half the movement, since both fingers report it.
        this.rotateBy((p.x - prev.x) / 2, (p.y - prev.y) / 2);
      } else if (this.pointers.size === 1 && g.moved) {
        this.rotateBy(p.x - prev.x, p.y - prev.y);
      }
      if (g.moved || g.multi) this.markMoving();
      this.requestRender();
    });

    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size > 0) return;
      const g = this.gesture;
      this.gesture = null;
      if (g && !g.moved && !g.multi && e.type === "pointerup") {
        const p = local(e);
        this.onTap?.(this.hit(p.x, p.y), p.x, p.y);
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.cancelAnimation();
        this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        this.markMoving();
        this.requestRender();
      },
      { passive: false },
    );
  }

  private rotateBy(dx: number, dy: number) {
    const k = 180 / (Math.PI * this.projection.scale());
    this.rotation = [this.rotation[0] + dx * k, clamp(this.rotation[1] - dy * k, -85, 85)];
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpLog(a: number, b: number, t: number) {
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
}
