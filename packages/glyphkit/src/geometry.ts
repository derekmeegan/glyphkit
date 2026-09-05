import type { Contour, Point } from "./types";

export type Box = [number, number, number, number];

export function bboxOf(contours: readonly Contour[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}

/**
 * Contours to an SVG `d`.
 *
 * The outlines are already flattened to polygons at build time, so this is a
 * polyline per loop — no curve commands, and nothing to re-fit after a warp
 * has moved the points around. Fill rule is nonzero, which is what the font's
 * own contour winding assumes: counters are wound against their outers, so an
 * O's hole stays a hole.
 */
export function toPathData(contours: readonly Contour[], precision = 2): string {
  const n = (v: number) => {
    const s = v.toFixed(precision);
    // Trim the trailing zeros the fixed precision adds; on a wordmark's worth
    // of glyphs this is a third off the attribute.
    return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  };

  let d = "";
  for (const c of contours) {
    if (c.length < 3) continue;
    d += `M${n(c[0][0])} ${n(c[0][1])}`;
    for (let i = 1; i < c.length; i++) d += `L${n(c[i][0])} ${n(c[i][1])}`;
    d += "Z";
  }
  return d;
}

/**
 * The ink runs where a line at `y` crosses the outline, left to right.
 *
 * This is the primitive the whole warp is built on: it turns a letter into,
 * at every height, a set of ink intervals and the counters between them —
 * which is the structure that has to survive being stretched.
 */
export type Run = [number, number];

export function scanline(contours: readonly Contour[], y: number): Run[] {
  const xs: number[] = [];
  for (const c of contours) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = c[i];
      const [bx, by] = c[(i + 1) % n];
      // Half-open in y. A vertex shared by two edges is counted once, so the
      // crossings stay paired and a local maximum does not open a phantom run.
      if (ay <= y === by <= y) continue;
      xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
  }
  if (xs.length < 2) return [];
  xs.sort((a, b) => a - b);

  const runs: Run[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) runs.push([xs[i], xs[i + 1]]);
  return runs;
}

/**
 * Split every edge longer than `maxEdge` into equal pieces.
 *
 * The outlines ship simplified — a straight diagonal is two points, because
 * that is all it takes to draw one. The warp needs more than that: it places
 * each point against the ink run at that point's own height, and a stroke
 * that moves as it descends is only followed if there are points along it to
 * follow with. Two endpoints and a straight line between them would leave the
 * middle of an A's leg wherever linear interpolation put it, which is how a
 * stretched A ends up with legs thinner than the ones it was drawn with.
 */
export function densify(contours: readonly Contour[], maxEdge: number): Contour[] {
  if (!(maxEdge > 0)) return contours.map((c) => c.slice());

  return contours.map((c) => {
    const out: Point[] = [];
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = c[i];
      const b = c[(i + 1) % n];
      out.push(a);
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxEdge);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  });
}

/** Swap axes, so an algorithm written for x can be run for y. */
export function transpose(contours: readonly Contour[]): Contour[] {
  return contours.map((c) => c.map(([x, y]) => [y, x] as Point));
}
