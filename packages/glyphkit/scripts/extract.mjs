/**
 * Build step: turn a font into geometry.
 *
 * A glyph in a text run is opaque — the shaping engine owns it, and all you
 * can do is set it and clip things to it. This pulls each outline out as an
 * SVG path plus the metrics that position it, normalised to a 1000-unit em
 * box, so the runtime can treat a letter as a shape rather than as text.
 *
 *   node scripts/extract.mjs --font <ttf|url> --out fonts/name.json
 *                            [--chars ABC] [--name "Family 700"]
 *
 * Defaults to Familjen Grotesk 700 from Google Fonts, uppercase + digits,
 * which is what the wordmark needs.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import opentype from "opentype.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULT_FONT =
  "https://fonts.gstatic.com/s/familjengrotesk/v11/Qw3LZR9ZHiDnImG6-NEMQ41wby8WRnYsfkunR_eGfMFubizt.ttf";
const DEFAULT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&.,-'!?";

/** The em box everything is expressed in, so callers never see font units. */
const EM = 1000;
/**
 * Flattening runs fine and is then simplified back down, both in em units.
 * The tolerance is a *sag* budget: 0.5/1000 em is a third of a pixel on a
 * 700px letter, which is below what any screen resolves.
 */
const FLATTEN_STEP = 2;
const SIMPLIFY_TOLERANCE = 0.5;

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "");
    out[key] = process.argv[i + 1];
  }
  return out;
}

async function load(src) {
  if (/^https?:/.test(src)) {
    const res = await fetch(src, {
      // gstatic serves woff2 to modern UAs and truetype to older ones, and
      // opentype.js only parses the latter.
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3)" },
    });
    if (!res.ok) throw new Error(`${res.status} fetching ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(resolve(src));
}

/**
 * Flatten a glyph's outline to polygons.
 *
 * The warp has to move individual points, and moving the control point of a
 * cubic does not move the curve through it — so the geometry it works on has
 * to be polygonal. Flattening happens once here, at a tolerance fine enough
 * that the result is indistinguishable at display sizes, rather than at every
 * frame in the browser.
 */
function flatten(path, scale) {
  const contours = [];
  let current = null;
  let cursor = [0, 0];

  // getPath already emits SVG coordinates — y-down, baseline at the y it was
  // given — so this only rescales into the em box. Nothing above the baseline
  // is negated twice.
  const at = (x, y) => [x * scale, y * scale];

  /** Adaptive-ish subdivision: segment count from the control polygon length. */
  const steps = (pts) => {
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
      current.push(cursor);
    } else if (cmd.type === "Q") {
      const c = at(cmd.x1, cmd.y1);
      const e = at(cmd.x, cmd.y);
      const n = steps([cursor, c, e]);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        current.push([
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
        current.push([
          u * u * u * cursor[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
          u * u * u * cursor[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
        ]);
      }
      cursor = e;
    } else if (cmd.type === "Z") {
      // The closing edge is implicit; drop a duplicated first point.
      if (current.length > 1) {
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
function simplify(points, tolerance) {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
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
function simplifyLoop(points, tolerance) {
  if (points.length < 8) return points;
  const half = Math.floor(points.length / 2);
  const a = simplify(points.slice(0, half + 1), tolerance);
  const b = simplify(points.slice(half), tolerance);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * The font's dominant stroke weight, in em units.
 *
 * The warp needs it to tell a stem from a bar: an ink run about this wide,
 * crossed horizontally, is a stroke and must keep its width; one much wider
 * is a bar seen end-on and is free to stretch. Measuring it once here beats
 * re-estimating it per glyph, where a letter with no vertical stem at all
 * (O, S) has nothing to estimate from.
 */
function measureStem(glyphs) {
  // I is a bare stem. H and E have one flush against the left edge. Each
  // gives the same number, so the median absorbs a bad reading.
  const samples = [];
  for (const ch of ["I", "H", "E", "L", "N", "T"]) {
    const g = glyphs[ch];
    if (!g) continue;
    const mid = (g.bbox[1] + g.bbox[3]) / 2;
    const runs = scanline(g.contours, mid);
    if (!runs.length) continue;
    // The leftmost run at mid-height is the left stem on every one of these.
    samples.push(runs[0][1] - runs[0][0]);
  }
  if (!samples.length) return EM * 0.13;
  samples.sort((a, b) => a - b);
  return round(samples[samples.length >> 1]);
}

/** Ink runs where a horizontal line at `y` crosses the outline. */
function scanline(contours, y) {
  const xs = [];
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const [x0, y0] = c[i];
      const [x1, y1] = c[(i + 1) % c.length];
      // Half-open in y, so a vertex shared by two edges counts once and the
      // crossings stay paired.
      if (y0 <= y === y1 <= y) continue;
      xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
  }
  xs.sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i + 1 < xs.length; i += 2) runs.push([xs[i], xs[i + 1]]);
  return runs;
}

async function main() {
  const opts = args();
  const chars = opts.chars ?? DEFAULT_CHARS;
  const font = opentype.parse(
    (await load(opts.font ?? DEFAULT_FONT)).buffer.slice(0),
  );

  const scale = EM / font.unitsPerEm;
  const glyphs = {};

  for (const ch of chars) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.index === 0) {
      console.warn(`no glyph for ${JSON.stringify(ch)} — skipped`);
      continue;
    }
    const contours = flatten(glyph.getPath(0, 0, font.unitsPerEm), scale)
      .map((c) => simplifyLoop(c, SIMPLIFY_TOLERANCE))
      .map((c) => c.map(([x, y]) => [round(x), round(y)]))
      .filter((c) => c.length >= 3);

    const xs = contours.flat().map((p) => p[0]);
    const ys = contours.flat().map((p) => p[1]);
    const advance = round(glyph.advanceWidth * scale);

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

  const os2 = font.tables.os2 ?? {};
  // opentype.js buckets names by platform; windows is the one Google's TTFs
  // always carry, macintosh the fallback for older files.
  const names = font.names.windows ?? font.names.macintosh ?? font.names;
  const data = {
    name: opts.name ?? names.fullName?.en ??
      `${names.fontFamily?.en ?? "font"} ${names.fontSubfamily?.en ?? ""}`.trim(),
    em: EM,
    // Contours are y-down with the baseline at y=0, so caps occupy negative
    // y. These stay positive distances *from* the baseline: the cap line is
    // at y = -capHeight, the descender line at y = +descender.
    ascender: round(font.ascender * scale),
    descender: round(-font.descender * scale),
    capHeight: round((os2.sCapHeight ?? font.ascender * 0.72) * scale),
    xHeight: round((os2.sxHeight ?? font.ascender * 0.52) * scale),
    stemWidth: measureStem(glyphs),
    glyphs,
  };

  const out = resolve(HERE, "..", opts.out ?? "fonts/familjen-grotesk-700.json");
  mkdirSync(dirname(out), { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(out, json);

  /**
   * A typed twin of the JSON, so importing a font costs the compiler one
   * string literal instead of a structural type for 2,600 points — and costs
   * the browser one `JSON.parse`, which V8 runs faster than it builds the
   * equivalent object literal.
   */
  const stem = out.replace(/\.json$/, "");
  const ident = stem
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[0-9]+/, "");
  writeFileSync(
    `${stem}.ts`,
    `// Generated by scripts/extract.mjs — do not edit.\n` +
      `// ${data.name}, ${Object.keys(glyphs).length} glyphs.\n` +
      `import type { GlyphFont } from "../src/types";\n\n` +
      `const ${ident} = JSON.parse(\n  ${JSON.stringify(json)},\n) as GlyphFont;\n\n` +
      `export default ${ident};\n`,
  );

  const pts = Object.values(glyphs).reduce(
    (n, g) => n + g.contours.reduce((m, c) => m + c.length, 0), 0,
  );
  console.log(
    `${data.name}: ${Object.keys(glyphs).length} glyphs, ${pts} points, ` +
      `${(JSON.stringify(data).length / 1024).toFixed(1)} kB -> ${out}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
