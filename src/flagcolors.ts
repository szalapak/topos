/** Used when a flag can't be read, e.g. offline before it was ever cached. */
const FALLBACK = ["#ffd54a", "#ffffff", "#4caf73"];

const cache = new Map<string, Promise<string[]>>();

/** A flag's main colours as hex, biggest share first. Read once per flag, then remembered. */
export function flagColors(url: string): Promise<string[]> {
  let colors = cache.get(url);
  if (!colors) {
    colors = readFlag(url).then(
      (found) => (found.length ? found : FALLBACK),
      () => FALLBACK,
    );
    cache.set(url, colors);
  }
  return colors;
}

const WIDTH = 64;
const HEIGHT = 48;

/** Draws the flag small and counts its pixels, which copes with any flag however it is drawn. */
async function readFlag(url: string): Promise<string[]> {
  const svg = await (await fetch(url)).text();
  // Firefox and Safari draw an SVG with no width and height as nothing.
  const sized = svg.replace(/<svg\b/, `<svg width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="none"`);
  const blob = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = blob;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
    return mainColors(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  } finally {
    URL.revokeObjectURL(blob);
  }
}

/** Colours closer than this (in RGB) count as one, which also soaks up the blend at their edges. */
const SAME_COLOR = 56;

/**
 * The main colours in RGBA pixels, as hex, biggest share first. Colours covering less than
 * `minShare` of the flag (stars, emblems, the blend along edges) are left out.
 */
export function mainColors(pixels: ArrayLike<number>, max = 4, minShare = 0.03): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    total++;
  }
  const found: Color[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const c = { n: bucket.n, r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n };
    const same = found.find((f) => Math.hypot(f.r - c.r, f.g - c.g, f.b - c.b) < SAME_COLOR);
    if (same) same.n += c.n;
    else found.push(c);
  }
  const kept: Color[] = [];
  for (const c of found.filter((f) => f.n >= total * minShare).sort((a, b) => b.n - a.n)) {
    // Where two colours meet they blend (pink between the US flag's red and white stripes),
    // and a narrow stripe can be mostly edge. A smaller colour between two bigger ones is that.
    if (!kept.some((a, i) => kept.slice(i + 1).some((b) => isBlend(c, a, b)))) kept.push(c);
  }
  return kept.slice(0, max).map((f) => `#${[f.r, f.g, f.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`);
}

interface Color {
  n: number;
  r: number;
  g: number;
  b: number;
}

/** Whether `c` lies on the way from `a` to `b`, not right at either end. */
function isBlend(c: Color, a: Color, b: Color): boolean {
  const ab = [b.r - a.r, b.g - a.g, b.b - a.b];
  const ac = [c.r - a.r, c.g - a.g, c.b - a.b];
  const t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1);
  if (t < 0.1 || t > 0.9) return false;
  return Math.hypot(ac[0] - ab[0] * t, ac[1] - ab[1] * t, ac[2] - ab[2] * t) < 24;
}
