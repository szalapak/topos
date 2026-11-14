import { test } from "node:test";
import assert from "node:assert/strict";
import { mainColors } from "../src/flagcolors.ts";

type RGB = [number, number, number];

/** RGBA pixels for a flag drawn by `colorAt`, as the browser would hand them over. */
function pixels(width: number, height: number, colorAt: (x: number, y: number) => RGB): number[] {
  const out: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.push(...colorAt(x, y), 255);
  return out;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

const BLUE: RGB = [0, 0, 145];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [225, 0, 15];

test("finds the three bands of a tricolour, leaving out the blend where they meet", () => {
  const france = pixels(64, 48, (x) => {
    // Drawn small, the bands meet in a column of blended pixels.
    if (x === 21) return mix(BLUE, WHITE, 0.4);
    if (x === 42) return mix(WHITE, RED, 0.6);
    return x < 21 ? BLUE : x < 42 ? WHITE : RED;
  });
  assert.deepEqual(new Set(mainColors(france)), new Set(["#000091", "#ffffff", "#e1000f"]));
});

test("narrow stripes don't add their blend as a colour of its own", () => {
  // Thirteen stripes in 48 rows: every boundary is a blended row, the US flag's pink problem.
  const stripes = pixels(64, 48, (_, y) => {
    const at = (y * 13) / 48;
    const edge = at - Math.floor(at);
    const color = Math.floor(at) % 2 ? WHITE : RED;
    const next = Math.floor(at) % 2 ? RED : WHITE;
    return edge > 0.7 ? mix(color, next, 0.5) : color;
  });
  assert.deepEqual(mainColors(stripes), ["#e1000f", "#ffffff"]);
});

test("leaves out small details such as an emblem", () => {
  const flag = pixels(64, 48, (x, y) => {
    if (x >= 30 && x < 34 && y >= 22 && y < 26) return [250, 200, 0];
    return x < 32 ? RED : WHITE;
  });
  assert.deepEqual(new Set(mainColors(flag)), new Set(["#e1000f", "#ffffff"]));
});

test("keeps a small but real part, like the disc on Japan's flag", () => {
  const japan = pixels(64, 48, (x, y) => (Math.hypot(x - 32, y - 24) < 9 ? [188, 0, 45] : WHITE));
  assert.deepEqual(mainColors(japan), ["#ffffff", "#bc002d"]);
});

test("ignores see-through pixels", () => {
  const flag = pixels(4, 4, (_, y) => (y < 2 ? [0, 200, 0] : RED));
  // The top two rows, green, are see-through.
  for (let i = 0; i < 8; i++) flag[i * 4 + 3] = 0;
  assert.deepEqual(mainColors(flag), ["#e1000f"]);
});
