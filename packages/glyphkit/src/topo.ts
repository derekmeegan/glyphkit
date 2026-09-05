/**
 * A contour map, as paths.
 *
 * Included because it is the thing a glyph library makes newly possible: once
 * a letter is a `<path>`, filling it with something is a real clip rather than
 * `background-clip: text`, and the fill can be generated to span a whole word
 * so the surface runs continuously across the letters instead of restarting
 * inside each one.
 *
 * Nested perturbed circles read as wood grain — one centre, every line a
 * closed ring. A contour map is a noise field sliced at even elevations, so it
 * gets peaks, basins, saddles, lines that branch and run off the edge, and
 * dense banding where the ground is steep. That is marching squares over fBm
 * value noise.
 */

export type TopoOptions = {
  /** Grid resolution. More columns is more detail, and more path data. */
  readonly cols?: number;
  readonly rows?: number;
  /** How many elevations to slice at. */
  readonly levels?: number;
  readonly seed?: number;
  /** Feature size, in slices per width. Higher is busier terrain. */
  readonly frequency?: number;
  /** The box the field is drawn into, in user units. */
  readonly width?: number;
  readonly height?: number;
  /**
   * Fit a spline through the contour points instead of joining them with
   * straight lines. Marching squares puts its points on grid edges, so at
   * large sizes the joins are visible as faceting; a curve removes it.
   */
  readonly smooth?: boolean;
  /** Minimum gap between kept points, in grid cells, before the curve fit. */
  readonly decimate?: number;
};

type Pt = [number, number];

/** Seeded value noise, four octaves. Deterministic, so it renders the same on
 *  the server and the client. */
function makeNoise(seed: number) {
  const hash = (i: number, j: number) => {
    const x = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const ease = (t: number) => t * t * (3 - 2 * t);

  const value = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = ease(x - xi);
    const v = ease(y - yi);
    return (
      hash(xi, yi) * (1 - u) * (1 - v) +
      hash(xi + 1, yi) * u * (1 - v) +
      hash(xi, yi + 1) * (1 - u) * v +
      hash(xi + 1, yi + 1) * u * v
    );
  };

  return (x: number, y: number) => {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let freq = 1;
    for (let o = 0; o < 4; o++) {
      sum += amp * value(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

/**
 * Marching squares. Walks every cell, works out which edges the iso-line
 * crosses, and interpolates the crossing along each edge so the result follows
 * the field rather than the grid.
 */
function isoSegments(field: number[][], level: number, cols: number, rows: number) {
  const segs: [Pt, Pt][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v00 = field[r][c];
      const v10 = field[r][c + 1];
      const v11 = field[r + 1][c + 1];
      const v01 = field[r + 1][c];

      const code =
        (v00 > level ? 1 : 0) |
        (v10 > level ? 2 : 0) |
        (v11 > level ? 4 : 0) |
        (v01 > level ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const mix = (a: number, b: number) => (level - a) / (b - a);
      const top = (): Pt => [c + mix(v00, v10), r];
      const right = (): Pt => [c + 1, r + mix(v10, v11)];
      const bottom = (): Pt => [c + mix(v01, v11), r + 1];
      const left = (): Pt => [c, r + mix(v00, v01)];

      switch (code) {
        case 1: case 14: segs.push([left(), top()]); break;
        case 2: case 13: segs.push([top(), right()]); break;
        case 3: case 12: segs.push([left(), right()]); break;
        case 4: case 11: segs.push([right(), bottom()]); break;
        case 6: case 9: segs.push([top(), bottom()]); break;
        case 7: case 8: segs.push([left(), bottom()]); break;
        // Saddles: the two crossings that keep the high ground connected.
        case 5: segs.push([left(), top()], [right(), bottom()]); break;
        case 10: segs.push([top(), right()], [left(), bottom()]); break;
      }
    }
  }
  return segs;
}

/** Stitch loose segments end to end, so each contour emits as one path. */
function chain(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`;
  const ends = new Map<string, Pt[]>();
  const done: Pt[][] = [];

  for (const [a, b] of segs) {
    const ka = key(a);
    const kb = key(b);
    const ca = ends.get(ka);
    const cb = ends.get(kb);

    if (ca && ca === cb) {
      ends.delete(ka);
      ends.delete(kb);
      ca.push(ca[0]); // closed loop
      done.push(ca);
    } else if (ca && cb) {
      ends.delete(ka);
      ends.delete(kb);
      if (key(ca[0]) === ka) ca.reverse();
      if (key(cb[cb.length - 1]) === kb) cb.reverse();
      const merged = ca.concat(cb);
      ends.set(key(merged[0]), merged);
      ends.set(key(merged[merged.length - 1]), merged);
    } else if (ca) {
      ends.delete(ka);
      if (key(ca[0]) === ka) ca.reverse();
      ca.push(b);
      ends.set(key(b), ca);
    } else if (cb) {
      ends.delete(kb);
      if (key(cb[0]) === kb) cb.reverse();
      cb.push(a);
      ends.set(key(a), cb);
    } else {
      const fresh: Pt[] = [a, b];
      ends.set(ka, fresh);
      ends.set(kb, fresh);
    }
  }

  for (const c of new Set(ends.values())) done.push(c);
  return done;
}

/** Thin out grid-dense points so the curve fit has room to breathe. */
function decimatePts(pts: Pt[], min: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    if ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 >= min * min) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A Catmull-Rom spline through the points, emitted as the cubic Béziers SVG
 * understands. Closed contours wrap, so a loop has no seam at its start.
 */
function curveThrough(pts: Pt[], sx: number, sy: number): string {
  const closed =
    pts.length > 3 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1];
  const p = closed ? pts.slice(0, -1) : pts;
  if (p.length < 2) return "";

  const at = (i: number) =>
    closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))];
  const fmt = (q: Pt) => `${(q[0] * sx).toFixed(1)} ${(q[1] * sy).toFixed(1)}`;

  let d = "M" + fmt(at(0));
  const span = closed ? p.length : p.length - 1;
  for (let i = 0; i < span; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d +=
      "C" +
      fmt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) +
      " " +
      fmt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) +
      " " +
      fmt(p2);
  }
  return closed ? d + "Z" : d;
}

export type TopoLevel = {
  /** 0 at the lowest contour, 1 at the highest. */
  readonly elevation: number;
  /** True every third line, as on a printed map, where they are drawn heavier. */
  readonly index: boolean;
  readonly d: string;
};

/**
 * One contour map, sliced into levels.
 *
 * Generate once for a whole word and let each letter clip its own window on
 * it; that is what makes the terrain read as one surface the letters are cut
 * out of, rather than as a texture repeating inside each glyph.
 */
export function topoLevels({
  cols = 96,
  rows = 44,
  levels = 12,
  seed = 7,
  frequency = 7.2,
  width = 1000,
  height = 460,
  smooth = false,
  decimate = 1.15,
}: TopoOptions = {}): TopoLevel[] {
  const noise = makeNoise(seed);
  const field: number[][] = [];
  let lo = 1;
  let hi = 0;

  for (let r = 0; r <= rows; r++) {
    const row: number[] = [];
    for (let c = 0; c <= cols; c++) {
      // Frequencies track the aspect ratio, so the terrain is not stretched.
      const v = noise((c / cols) * frequency, (r / rows) * frequency * (height / width));
      row.push(v);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    field.push(row);
  }

  const sx = width / cols;
  const sy = height / rows;
  const out: TopoLevel[] = [];

  for (let i = 1; i <= levels; i++) {
    const level = lo + ((hi - lo) * i) / (levels + 1);
    const d = chain(isoSegments(field, level, cols, rows))
      .map((line) => (smooth ? decimatePts(line, decimate) : line))
      .filter((line) => line.length > 2)
      .map((line) =>
        smooth
          ? curveThrough(line, sx, sy)
          : "M" +
            line.map((p) => `${(p[0] * sx).toFixed(1)} ${(p[1] * sy).toFixed(1)}`).join("L"),
      )
      .join("");
    out.push({ elevation: i / (levels + 1), index: i % 3 === 0, d });
  }

  return out;
}
