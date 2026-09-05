/**
 * Turn a font file into geometry.
 *
 * A glyph in a text run is opaque — the shaping engine owns it, and all you
 * can do is set it and clip things to it. This pulls each outline out as
 * polygons plus the metrics that position it, normalised to a 1000-unit em
 * box, so the rest of the library can treat a letter as a shape rather than
 * as text.
 *
 * It is the same work whether it runs at build time over a file on disk
 * (`scripts/extract.mjs`) or in a browser over a font somebody just dropped
 * on the page: bytes in, a `GlyphFont` out, no I/O of its own.
 */

import opentype from "opentype.js";

import { scanline } from "./geometry";
import type { Contour, GlyphData, GlyphFont, Point } from "./types";

/** The em box everything is expressed in, so callers never see font units. */
export const EM = 1000;
export const DEFAULT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&.,-'!?";
/**
 * Flattening runs fine and is then simplified back down, both in em units.
 * The tolerance is a *sag* budget: 0.5/1000 em is a third of a pixel on a
 * 700px letter, which is below what any screen resolves.
 */
const FLATTEN_STEP = 2;
const SIMPLIFY_TOLERANCE = 0.5;

export type ExtractOptions = {
  /** Which characters to pull. Anything the font has no glyph for is skipped. */
  readonly chars?: string;
  /** Overrides the name read from the font's own tables. */
  readonly name?: string;
};

export type ExtractResult = {
  readonly font: GlyphFont;
  /** Characters asked for that the font had no glyph for. */
  readonly missing: string[];
};

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Flatten a glyph's outline to polygons.
 *
 * The warp has to move individual points, and moving the control point of a
 * cubic does not move the curve through it — so the geometry it works on has
 * to be polygonal. Flattening happens once here, at a tolerance fine enough
 * that the result is indistinguishable at display sizes, rather than at every
 * frame in the browser.
 */
function flatten(path: opentype.Path, scale: number): Point[][] {
  const contours: Point[][] = [];
  let current: Point[] | null = null;
  let cursor: Point = [0, 0];

  // getPath already emits SVG coordinates — y-down, baseline at the y it was
  // given — so this only rescales into the em box. Nothing above the baseline
  // is negated twice.
  const at = (x: number, y: number): Point => [x * scale, y * scale];

  /** Adaptive-ish subdivision: segment count from the control polygon length. */
  const steps = (pts: Point[]) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return Math.max(2, Math.min(96, Math.ceil(len / FLATTEN_STEP)));
  };

  for (const cmd of path.commands) {
    if (cmd.type === "M") {
      current = [];
      contours.push(current);
      cursor = at(cmd.x, cmd.y);
      current.push(cursor);
    } else if (cmd.type === "L") {
      cursor = at(cmd.x, cmd.y);
      current?.push(cursor);
    } else if (cmd.type === "Q") {
      const c = at(cmd.x1, cmd.y1);
      const e = at(cmd.x, cmd.y);
      const n = steps([cursor, c, e]);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        current?.push([
          u * u * cursor[0] + 2 * u * t * c[0] + t * t * e[0],
          u * u * cursor[1] + 2 * u * t * c[1] + t * t * e[1],
        ]);
      }
      cursor = e;
    } else if (cmd.type === "C") {
      const c1 = at(cmd.x1, cmd.y1);
      const c2 = at(cmd.x2, cmd.y2);
      const e = at(cmd.x, cmd.y);
      const n = steps([cursor, c1, c2, e]);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        current?.push([
          u * u * u * cursor[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
          u * u * u * cursor[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
        ]);
      }
      cursor = e;
    } else if (cmd.type === "Z") {
      // The closing edge is implicit; drop a duplicated first point.
      if (current && current.length > 1) {
        const a = current[0];
        const b = current[current.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) current.pop();
      }
      current = null;
    }
  }

  return contours.filter((c) => c.length >= 3);
}

/**
 * Ramer-Douglas-Peucker. Flattening at a fixed step oversamples gentle curves
 * and undersamples tight ones; this drops every point that sits within the
 * tolerance of the chord it spans, so points end up where the curvature is.
 * Straight stems collapse to their endpoints, which is most of the saving.
 */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;

    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const norm = Math.hypot(dx, dy) || 1;

    let worst = -1;
    let at = lo;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * (px - ax) - dx * (py - ay)) / norm;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }

    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([lo, at], [at, hi]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * A contour is a closed loop, so it has no natural endpoints to anchor RDP.
 * Splitting it at two far-apart points gives two open chains, and neither
 * anchor can be dropped — which keeps the loop from collapsing inward.
 */
function simplifyLoop(points: Point[], tolerance: number): Point[] {
  if (points.length < 8) return points;
  const half = Math.floor(points.length / 2);
  const a = simplify(points.slice(0, half + 1), tolerance);
  const b = simplify(points.slice(half), tolerance);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/**
 * The font's dominant stroke weight, in em units.
 *
 * The warp needs it to tell a stem from a bar: an ink run about this wide,
 * crossed horizontally, is a stroke and must keep its width; one much wider
 * is a bar seen end-on and is free to stretch. Measuring it once here beats
 * re-estimating it per glyph, where a letter with no vertical stem at all
 * (O, S) has nothing to estimate from.
 *
 * Bars sit at mid cap height by design, so a scanline there crosses the E's
 * arm and the H's crossbar rather than their stems. Sampling either side of
 * it and keeping the narrowest run at each height reads the stem itself, and
 * the median over the letters absorbs whatever a spur or a diagonal adds.
 */
export function measureStemWidth(glyphs: Readonly<Record<string, GlyphData>>): number {
  const samples: number[] = [];
  for (const ch of ["I", "H", "E", "L", "N", "T", "F", "P"]) {
    const g = glyphs[ch];
    if (!g) continue;
    // y-down: bbox[1] is the cap line, bbox[3] the baseline.
    const [, cap, , base] = g.bbox;
    for (const t of [0.3, 0.7]) {
      const runs = scanline(g.contours, cap + (base - cap) * t);
      if (!runs.length) continue;
      samples.push(Math.min(...runs.map(([a, b]) => b - a)));
    }
  }
  if (!samples.length) return EM * 0.13;
  samples.sort((a, b) => a - b);
  return round(samples[samples.length >> 1]);
}

/** Read a parsed opentype font into glyphkit's geometry. */
export function extractParsed(font: opentype.Font, options: ExtractOptions = {}): ExtractResult {
  const chars = options.chars ?? DEFAULT_CHARS;
  const scale = EM / font.unitsPerEm;
  const glyphs: Record<string, GlyphData> = {};
  const missing: string[] = [];

  for (const ch of chars) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.index === 0) {
      missing.push(ch);
      continue;
    }
    const contours: Contour[] = flatten(glyph.getPath(0, 0, font.unitsPerEm), scale)
      .map((c) => simplifyLoop(c, SIMPLIFY_TOLERANCE))
      .map((c) => c.map(([x, y]) => [round(x), round(y)] as Point))
      .filter((c) => c.length >= 3);

    const xs = contours.flat().map((p) => p[0]);
    const ys = contours.flat().map((p) => p[1]);
    const advance = round((glyph.advanceWidth ?? 0) * scale);

    glyphs[ch] = {
      advance,
      // Side bearings, so a caller can set letters without re-deriving them.
      lsb: xs.length ? round(Math.min(...xs)) : 0,
      rsb: xs.length ? round(advance - Math.max(...xs)) : advance,
      bbox: xs.length
        ? [round(Math.min(...xs)), round(Math.min(...ys)), round(Math.max(...xs)), round(Math.max(...ys))]
        : [0, 0, 0, 0],
      contours,
    };
  }

  const os2 = (font.tables as { os2?: { sCapHeight?: number; sxHeight?: number } }).os2 ?? {};
  // opentype.js buckets names by platform — windows is the one Google's TTFs
  // always carry, macintosh the fallback for older files — while its published
  // types still describe the flat shape it used to return.
  type Names = Record<string, { en?: string } | undefined>;
  const table = font.names as unknown as Names & { windows?: Names; macintosh?: Names };
  const names: Names = table.windows ?? table.macintosh ?? table;
  const english = (entry: { en?: string } | undefined) => entry?.en;

  return {
    font: {
      name: options.name ?? english(names.fullName) ??
        `${english(names.fontFamily) ?? "font"} ${english(names.fontSubfamily) ?? ""}`.trim(),
      em: EM,
      // Contours are y-down with the baseline at y=0, so caps occupy negative
      // y. These stay positive distances *from* the baseline: the cap line is
      // at y = -capHeight, the descender line at y = +descender.
      ascender: round(font.ascender * scale),
      descender: round(-font.descender * scale),
      capHeight: round((os2.sCapHeight ?? font.ascender * 0.72) * scale),
      xHeight: round((os2.sxHeight ?? font.ascender * 0.52) * scale),
      stemWidth: measureStemWidth(glyphs),
      glyphs,
    },
    missing,
  };
}

/**
 * Read font bytes into glyphkit's geometry.
 *
 * Takes what a `File`, a `fetch`, or `readFileSync` hands back. TrueType,
 * OpenType and WOFF parse; WOFF2 does not.
 */
export function extractFont(bytes: ArrayBuffer, options: ExtractOptions = {}): ExtractResult {
  return extractParsed(opentype.parse(bytes), options);
}
