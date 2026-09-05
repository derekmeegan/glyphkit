import { bboxOf, densify, scanline, transpose, type Run } from "./geometry";
import type { Contour, Point } from "./types";

/**
 * Stretching a letter without ruining it.
 *
 * `transform: scaleX(1.6)` scales the ink along with the space, so vertical
 * stems get 60% fatter while horizontal bars stay put, and the letter stops
 * matching the rest of its own alphabet. A real width axis avoids this because
 * the type designer redrew the glyph; with no such axis in the font, this
 * recovers most of the same result from the outline alone.
 *
 * Two things happen, in this order.
 *
 * 1. A global map `X(x)`, built so that columns full of stroke keep their
 *    scale and columns of counter absorb the stretch. That is what holds a
 *    vertical stem to exactly its drawn width and keeps the outermost stems
 *    flush with the edges of the letter.
 *
 * 2. A local correction, per point. A stem is a column, but a diagonal or a
 *    curve is a stroke that moves as it descends, so no fixed column can
 *    describe it. Each point is therefore placed relative to the *centre* of
 *    the ink run it sits on at its own height: the centre travels through
 *    `X`, and the run keeps its width. That is the "translate points through
 *    the counters while leaving stem widths fixed" rule, applied where it
 *    actually belongs — to the run, not to the band.
 *
 * The vertical axis is the same algorithm with the axes swapped: what a stem
 * is to a horizontal stretch, a bar is to a vertical one.
 */

/** Columns of the density profile. Cheap; the glyphs are small. */
const COLUMNS = 128;
/** Rows sampled when building the profile. */
const ROWS = 128;
/**
 * Columns to blur the profile over, as a fraction of the letter's width.
 *
 * Sampled raw, the profile is noisy: a diagonal enters and leaves a column
 * over a few rows, so coverage jumps about between neighbours. Those jumps
 * become slope changes in the map, and a slope change is a kink in every
 * stroke that crosses it — which is how a stretched W ends up with wavy legs.
 * Blurring first costs nothing and takes the ripple out.
 */
const PROFILE_BLUR = 0.06;

/**
 * Longest edge the warp will work with, as a fraction of stroke weight.
 * Anything longer is split, so a diagonal has points along it to be placed by.
 */
const MAX_EDGE = 0.3;

/**
 * How wide an ink run may be, in stroke weights, and still count as a stroke
 * whose width must be held. Between the two the classification ramps, so a
 * letter never jumps between behaviours as a run widens.
 */
const STROKE_MAX = 1.45;
const BAR_MIN = 2.6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * 0 for a run that is a stroke crossed side-on (hold its width), 1 for one
 * wide enough to be a bar seen end-on (let it stretch), ramping between.
 */
function barness(width: number, stem: number): number {
  return smoothstep(stem * STROKE_MAX, stem * BAR_MIN, width);
}

/** How far outside a run a point may sit and still be read as on it. */
const ON_RUN = 0.6;
/**
 * Heights to read the stroke at, as fractions of stroke weight either side of
 * the point.
 *
 * Zero is the point's own height. The two small steps resolve a corner, where
 * the edges meeting on a scanline are both excluded by the crossing rule and
 * the line reads whatever else the glyph has at that height.
 *
 * Reaching further was tried, to see through the place where a counter opens
 * and one run becomes two. It does clear the notch that leaves — an O's
 * shoulder goes from 22 units deep to 2 — but only at a reach of half a
 * stroke weight, by which point the probe is finding narrower runs all over
 * the letter and the worst stroke-weight error goes from 0.2% to 15%. The
 * notch is the cheaper of the two faults.
 */
const PROBE = [0, -0.004, 0.004];

function gapTo(run: Run, x: number): number {
  return x < run[0] ? run[0] - x : x > run[1] ? x - run[1] : 0;
}

/**
 * The run containing `x`, or the nearest one.
 *
 * Outline points sit on the boundary of a run, so rounding can leave one a
 * hair outside the run it belongs to; nearest-wins is the right reading of
 * that. Only a glyph with no ink at this height returns nothing.
 */
function runAt(runs: Run[], x: number): Run | null {
  let best: Run | null = null;
  let bestGap = Infinity;
  for (const run of runs) {
    const gap = gapTo(run, x);
    if (gap < bestGap) {
      bestGap = gap;
      best = run;
      if (gap === 0) break;
    }
  }
  return best;
}

/**
 * How much of each column is stroke, from 0 (open counter) to 1 (solid stem).
 *
 * Only runs classified as strokes contribute, which is the distinction that
 * makes this work on more than an I: the T's arm covers every column at its
 * own height but is a bar, so it leaves the profile flat and the arm is free
 * to stretch, while the T's stem covers a narrow band at every height and
 * pins it.
 */
function densityProfile(
  contours: readonly Contour[],
  box: readonly [number, number, number, number],
  stem: number,
): Float64Array {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 || 1;
  const h = y1 - y0 || 1;
  const profile = new Float64Array(COLUMNS);

  for (let r = 0; r < ROWS; r++) {
    // Sample at row centres, so the extreme scanlines are inside the ink
    // rather than tangent to it.
    const y = y0 + (h * (r + 0.5)) / ROWS;
    for (const run of scanline(contours, y)) {
      const hold = 1 - barness(run[1] - run[0], stem);
      if (hold <= 0) continue;
      const from = ((run[0] - x0) / w) * COLUMNS;
      const to = ((run[1] - x0) / w) * COLUMNS;
      const lo = Math.max(0, Math.floor(from));
      const hi = Math.min(COLUMNS - 1, Math.ceil(to) - 1);
      for (let c = lo; c <= hi; c++) {
        // Partial columns at the ends of the run count for what they cover.
        const overlap = Math.min(c + 1, to) - Math.max(c, from);
        if (overlap > 0) profile[c] += (overlap * hold) / ROWS;
      }
    }
  }
  return blur(profile, Math.max(1, Math.round(COLUMNS * PROFILE_BLUR)));
}

/** Three box passes, which is close enough to a Gaussian and much cheaper. */
function blur(profile: Float64Array, radius: number): Float64Array {
  let src = profile;
  const n = src.length;
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        // Clamped at the edges, so the outermost stem keeps its full weight
        // rather than being averaged with the air outside the letter.
        sum += src[j < 0 ? 0 : j >= n ? n - 1 : j];
        count++;
      }
      out[i] = sum / count;
    }
    src = out;
  }
  return src;
}

/**
 * The global map, as a lookup over `COLUMNS + 1` samples.
 *
 * Slope is 1 where the column is solid stroke and rises where it is open, so
 * the extra width lands in the counters. The two ends are fixed, which is why
 * a stretched N still starts and finishes on its stems.
 */
function buildMap(profile: Float64Array, width: number, factor: number): Float64Array {
  const stretchable = new Float64Array(COLUMNS);
  let total = 0;
  for (let c = 0; c < COLUMNS; c++) {
    // Squared, so a column that is half stroke resists more than half. Without
    // it the shoulder of a round letter gives up too much of its weight.
    const open = 1 - Math.min(1, profile[c]);
    stretchable[c] = open * open;
    total += stretchable[c];
  }

  const step = width / COLUMNS;
  const extra = (factor - 1) * width;
  // With nothing open — a solid block — there is nowhere to put the stretch
  // but everywhere, and the shape scales uniformly.
  const k = total > 1e-6 ? extra / (total * step) : factor - 1;

  const map = new Float64Array(COLUMNS + 1);
  for (let c = 0; c < COLUMNS; c++) {
    // Condensing takes width out of the counters, and a counter can only give
    // up what it has. Past that the slope would go negative, which is the map
    // folding back on itself and the outline crossing through itself. Clamped,
    // the letter instead runs out of counter and the solver puts the rest of
    // the compression through the strokes — thinner than they were drawn, but
    // still a letter. `condensingFloor` is where that begins.
    map[c + 1] = map[c] + step * Math.max(MIN_SLOPE, 1 + k * stretchable[c]);
  }
  return map;
}

/** Flattest the map may get before it would start folding. */
const MIN_SLOPE = 0.02;

/** Read the map at an arbitrary x, interpolating between its samples. */
function sampleMap(map: Float64Array, box0: number, width: number, x: number): number {
  const t = ((x - box0) / (width || 1)) * COLUMNS;
  // Outside the box, carry on at the slope of the end it left by.
  if (t <= 0) return map[0] + (t * width) / COLUMNS;
  if (t >= COLUMNS) return map[COLUMNS] + ((t - COLUMNS) * width) / COLUMNS;
  const i = Math.floor(t);
  return lerp(map[i], map[i + 1], t - i);
}

/** Heights sampled when checking whether stroke weight has survived. */
const FLOOR_ROWS = 24;
/** How much weight may be lost before the floor is considered reached. */
const FLOOR_TOLERANCE = 0.03;
/** Bisection steps; ten puts the answer inside a thousandth. */
const FLOOR_STEPS = 10;

/**
 * What the letter's stems weigh.
 *
 * At each height, the narrowest run that could be a stroke — which is the
 * stem, since every other structure a scanline crosses is wider — and then
 * the median of those across the letter.
 *
 * Two simpler readings were wrong. One height is not enough: which feature
 * sits at a given fraction of the height moves as the letter is warped, so
 * the comparison is between two different features. And a median over *all*
 * stroke-band runs drifts as the letter narrows, because a bar that starts
 * out too wide to count — an E's arms at 373 units — narrows into the band
 * and pulls the median up with it, which read as the E holding weight it had
 * already lost.
 */
function stemWeight(
  contours: readonly Contour[],
  stem: number,
  /**
   * The weight this letter was drawn at, once it is known. The band has to be
   * anchored to it rather than to the font's nominal stem, because a bar
   * narrows as the letter does: an E's arms start at 373 units, too wide to
   * count, and slip under the threshold at around 0.95 — at which point the
   * reading jumps to the arms and the E appears to be holding weight it has
   * already lost.
   */
  reference?: number,
): number | null {
  const box = bboxOf(contours);
  const widest = reference === undefined ? stem * BAR_MIN : reference * 1.8;
  const narrowest = reference === undefined ? stem * 0.3 : reference * 0.3;
  const perRow: number[] = [];

  for (let r = 0; r < FLOOR_ROWS; r++) {
    const y = box[1] + ((box[3] - box[1]) * (r + 0.5)) / FLOOR_ROWS;
    let thinnest = Infinity;
    for (const [a, b] of scanline(contours, y)) {
      const w = b - a;
      // At each height the narrowest run that could be a stroke is the stem;
      // everything else a scanline crosses is wider.
      if (w > narrowest && w < widest && w < thinnest) thinnest = w;
    }
    if (thinnest !== Infinity) perRow.push(thinnest);
  }

  if (!perRow.length) return null;
  perRow.sort((a, b) => a - b);
  return perRow[perRow.length >> 1];
}

/** Whether a warp at this factor still draws the strokes it was given. */
function holdsWeight(
  contours: readonly Contour[],
  factor: number,
  stem: number,
): boolean {
  const before = stemWeight(contours, stem);
  if (before === null) return true;
  // Through the same densify the real warp does, or the answer is measured on
  // geometry the caller will never see.
  const after = stemWeight(
    solveAxis(densify(contours, stem * MAX_EDGE), factor, stem, true),
    stem,
    before,
  );
  return after !== null && Math.abs(after / before - 1) <= FLOOR_TOLERANCE;
}

/**
 * The most a letter can be condensed before its stroke weight starts to go,
 * as a factor of its drawn width.
 *
 * A letter can only be narrowed by closing its counters, and once they are
 * closed there is nowhere left to take width from. An N drawn 590 wide is 391
 * of stem, so it runs out around 0.78; an E, which is mostly counter, goes to
 * 0.29. An I is nothing but stem and cannot be condensed at all.
 *
 * This is measured rather than predicted — the warp is run and the strokes are
 * read back. Estimating it from the density profile was tried and was wrong
 * where it mattered most, putting the N at 0.54 against a true 0.78, because
 * weight starts to go some way before any single column has actually closed.
 *
 * Worth asking before fitting a word to a width: the answer for the word is
 * the largest of the answers for its letters, and below that number the
 * fitting is no longer free.
 */
export function condensingFloor(
  contours: readonly Contour[],
  stemWidth: number,
): number {
  if (!contours.length) return 0;
  if (holdsWeight(contours, 0.2, stemWidth)) return 0.2;

  let lost = 0.2;
  let held = 1;
  for (let i = 0; i < FLOOR_STEPS; i++) {
    const mid = (lost + held) / 2;
    if (holdsWeight(contours, mid, stemWidth)) held = mid;
    else lost = mid;
  }
  return held;
}

/**
 * One axis of the warp, for a given map strength; the caller transposes for
 * the other axis.
 */
function warpAxis(
  contours: readonly Contour[],
  box: readonly [number, number, number, number],
  profile: Float64Array,
  strength: number,
  stem: number,
  smooth = false,
): Contour[] {
  const [x0, , x1] = box;
  const width = x1 - x0;
  const map = buildMap(profile, width, strength);
  const X = (x: number) => x0 + sampleMap(map, x0, width, x);

  // The monotone map preserves contour topology and straight stems. Local
  // scanline corrections hold weight more closely, but can jump where a
  // counter opens or a stroke joins a bar. Display work can opt out of those.
  if (smooth) return contours.map((contour) => contour.map(([x, y]) => [X(x), y] as Point));

  // Cache one scanline per distinct y: a contour visits the same height twice
  // whenever a stroke goes up and comes back down.
  const rows = new Map<number, Run[]>();
  const runsAt = (y: number) => {
    const key = Math.round(y * 1e3);
    let runs = rows.get(key);
    if (!runs) {
      runs = scanline(contours, y);
      rows.set(key, runs);
    }
    return runs;
  };

  /**
   * The run a point sits on.
   *
   * A scanline taken at exactly a corner's height is ambiguous — the two
   * edges meeting there start and end on it, so the crossing rule counts
   * neither, and the line reads whatever else the glyph has at that height.
   * On an H that put the top of a stem on the crossbar's run and folded the
   * stem in half. Stepping a hair off the corner reads the shape the point
   * actually belongs to; either side will do, since a corner is on both.
   */
  const findRun = (x: number, y: number): Run | null => {
    let best: Run | null = null;
    let bestWidth = Infinity;
    let fallback: Run | null = null;

    // Narrowest wins. Anything that makes a stroke read wider than it is —
    // a corner, a counter about to open — only ever inflates the reading, so
    // the thinnest run that still contains the point is the honest one.
    for (const d of PROBE) {
      const run = runAt(runsAt(y + d * stem), x);
      if (!run) continue;
      if (d === 0) fallback = run;
      if (gapTo(run, x) > ON_RUN) continue;
      const width = run[1] - run[0];
      if (width < bestWidth) {
        bestWidth = width;
        best = run;
      }
    }
    return best ?? fallback;
  };

  return contours.map((c) => {
    // The correction each point wants on top of the global map, rather than
    // its final position: corrections vary smoothly along a stroke, while
    // positions have the letter's real corners in them.
    /*
     * The correction each point wants on top of the global map, rather than
     * its final position: corrections vary smoothly along a stroke, while
     * positions have the letter's real corners in them.
     *
     * It is tempting to filter this — where two runs merge, the run's width
     * and centre jump between one point and the next, and a jump leaves a
     * notch. Both obvious filters cost more than they fix. Averaging along
     * the contour blurs the corrections at the places where the letter
     * genuinely changes character, and took the worst stroke-weight error
     * across the alphabet from 1% to 15%. Replacing the points that disagree
     * with their neighbours is worse still on the letters it was meant to
     * help: the point of a V or the join of an A's crossbar *is* a
     * disagreement, and rejecting it puts a notch where there was a corner.
     */
    // Per point: the centre-line of the stroke it sits on, and how wide that
    // stroke is. Read straight off the scanline, these two are what the whole
    // correction is computed from.
    const centres: number[] = [];
    const widths: number[] = [];

    for (const [x, y] of c) {
      const run = findRun(x, y);
      centres.push(run ? (run[0] + run[1]) / 2 : x);
      widths.push(run ? run[1] - run[0] : 0);
    }

    carryAcrossTapers(centres, widths, stem * TAPER);

    return c.map(([x, y], i) => {
      const centre = centres[i];
      // A bar goes through the map whole; a stroke keeps its width and rides
      // to wherever the map takes its centre.
      const asStroke = X(centre) + (x - centre);
      const delta = (asStroke - X(x)) * (1 - barness(widths[i], stem));
      return [X(x) + delta, y] as Point;
    });
  });
}

/**
 * How thin an ink run may be, in stroke weights, before what it says about
 * the stroke's position stops being believable.
 *
 * Anywhere from 0.68 to 0.85 measures the same, and the middle is taken for
 * the margin: below it the thinnest terminals stop being caught, and at 0.9
 * the threshold reaches real strokes — a W's 121-unit stems are read as
 * tapers, their centres interpolated away, and the worst stroke-weight error
 * across the alphabet goes from 1% to 62%.
 */
const TAPER = 0.72;

/**
 * Give the tapering end of a stroke the centre-line of the stroke it ends.
 *
 * A terminal is where the run runs out: across the last few points of a C's
 * arm it falls from 120 units to 58, 31, 4. A run that thin still has a
 * centre, but the centre is wherever the tip is — which is to say, on top of
 * the point itself. The correction is built from the point's offset from that
 * centre, so it collapses to nothing exactly where the stroke needs it most,
 * and the terminal comes out sheared instead of cut square.
 *
 * The fix is to carry the *centre-line*, not the correction. An earlier
 * version copied the finished correction from the nearest solid point and
 * made things far worse — a correction is only meaningful together with the
 * offset it was computed from, and pasting one point's onto another folded
 * the outline. The centre-line is the part that genuinely belongs to the
 * stroke rather than to the point, so it is the part that travels.
 *
 * Widths are carried alongside, so a tip is classified as the stroke it
 * belongs to rather than as the sliver it locally looks like.
 */
function carryAcrossTapers(centres: number[], widths: number[], minimum: number): void {
  const n = widths.length;
  const solid = widths.map((w) => w >= minimum);

  let count = 0;
  for (const s of solid) if (s) count++;
  // Nothing to carry from, or nothing to carry to.
  if (count === 0 || count === n) return;

  const at = (i: number) => ((i % n) + n) % n;
  const original = centres.slice();
  const originalWidths = widths.slice();

  let i = 0;
  while (i < n) {
    if (solid[i]) {
      i++;
      continue;
    }

    // The whole taper at once, so it is filled from one consistent pair of
    // ends. Nearest-wins was the first attempt and it folds the outline: two
    // points either side of a corner take their centre from opposite
    // directions, disagree, and cross over.
    let length = 1;
    while (length < n && !solid[at(i + length)]) length++;

    const before = at(i - 1);
    const after = at(i + length);
    const startCentre = original[before];
    const endCentre = original[after];
    const startWidth = originalWidths[before];
    const endWidth = originalWidths[after];

    for (let k = 0; k < length; k++) {
      // Linear across the gap, so the carried centre-line meets the real one
      // at both ends and the outline stays continuous through the taper.
      const t = (k + 1) / (length + 1);
      const j = at(i + k);
      centres[j] = startCentre + (endCentre - startCentre) * t;
      widths[j] = startWidth + (endWidth - startWidth) * t;
    }

    i += length;
  }
}

/**
 * Warp one axis so the ink ends up exactly `factor` times as wide.
 *
 * Holding run widths fixed means the outermost strokes come out inboard of a
 * plain stretch — a round letter has no stem to pin its extremes to the edge,
 * so an O warped at strength 1.6 lands narrower than 1.6. The fix is to solve
 * for the strength that does land on the target rather than to scale the
 * result up afterwards: scaling up would put back exactly the stroke-weight
 * error the whole thing exists to avoid.
 *
 * Width is very nearly linear in strength, so the fixed point converges in
 * two or three passes.
 */
const SOLVER_PASSES = 8;
const SOLVER_TOLERANCE = 0.05; // em units — a thousandth of a cap height

function solveAxis(
  contours: readonly Contour[],
  factor: number,
  stem: number,
  protect: boolean,
  /** Which edge of the box holds still while the letter grows. */
  anchor: "min" | "max" = "min",
  smooth = false,
): Contour[] {
  const box = bboxOf(contours);
  const width = box[2] - box[0];
  if (width <= 0 || Math.abs(factor - 1) < 1e-4) return contours.map((c) => c.slice());

  const origin = anchor === "min" ? box[0] : box[2] - width * factor;

  if (!protect) {
    // The honest naive version, kept so the difference is one prop away.
    return contours.map(
      (c) => c.map(([x, y]) => [origin + (x - box[0]) * factor, y] as Point),
    );
  }

  const profile = densityProfile(contours, box, stem);
  const target = width * factor;

  let strength = factor;
  let out = warpAxis(contours, box, profile, strength, stem, smooth);

  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    const b = bboxOf(out);
    const got = b[2] - b[0];
    if (got <= 1e-6 || Math.abs(got - target) < SOLVER_TOLERANCE) break;
    strength *= target / got;
    out = warpAxis(contours, box, profile, strength, stem, smooth);
  }

  // The solver lands within a thousandth of a cap height; this only removes
  // the rounding, so the caller can trust the box it laid out.
  return snap(out, origin, target);
}

/** Translate and scale onto [x0, x0 + target] — a no-op up to rounding. */
function snap(contours: Contour[], x0: number, target: number): Contour[] {
  const b = bboxOf(contours);
  const span = b[2] - b[0];
  if (span <= 1e-6) return contours;
  const k = target / span;
  return contours.map((c) => c.map(([x, y]) => [x0 + (x - b[0]) * k, y] as Point));
}

/**
 * Stretch a letter's outline, holding its stroke weight.
 *
 * The result occupies exactly `stretch.x` times the original ink width and
 * `stretch.y` times its height, so it can be laid out like any other box.
 */
export function warpContours(
  contours: readonly Contour[],
  {
    stretch,
    protectStems = true,
    stemWidth,
    smooth = false,
  }: {
    stretch?: { x?: number; y?: number };
    protectStems?: boolean;
    stemWidth: number;
    smooth?: boolean;
  },
): Contour[] {
  const sx = stretch?.x ?? 1;
  const sy = stretch?.y ?? 1;

  let out: Contour[] = protectStems
    ? densify(contours, stemWidth * MAX_EDGE)
    : contours.map((c) => c.slice());

  if (Math.abs(sx - 1) > 1e-4) out = solveAxis(out, sx, stemWidth, protectStems, "min", smooth);

  if (Math.abs(sy - 1) > 1e-4) {
    // Same algorithm, axes swapped: horizontal bars are now the runs whose
    // width has to survive, and the counters between them take the stretch.
    //
    // Anchored at the far end, because in these coordinates the far end of
    // the y axis is the baseline: a taller letter should rise off the line it
    // is sitting on, not sink through it.
    out = transpose(solveAxis(transpose(out), sy, stemWidth, protectStems, "max", smooth));
  }

  return out;
}
