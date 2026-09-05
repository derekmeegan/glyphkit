import { bboxOf, toPathData } from "./geometry";
import type { Contour, GlyphFont, Stretch, WarpOptions } from "./types";
import { condensingFloor, warpContours } from "./warp";

export type GlyphGeometry = {
  readonly char: string;
  /** The outline, ready for a `<path d>`. Empty for a space. */
  readonly d: string;
  readonly contours: readonly Contour[];
  /** Ink box in em units, y-down with the baseline at 0. */
  readonly bbox: readonly [number, number, number, number];
  /** Pen advance in em units, stretched along with the letter. */
  readonly advance: number;
  readonly lsb: number;
  readonly rsb: number;
  /** Whether the requested letter was in the font. */
  readonly missing: boolean;
};

export type GlyphOptions = WarpOptions;

/**
 * Resolve a letter to geometry.
 *
 * Everything downstream — the component, the layout, the clip — is built on
 * this. It is deliberately free of React and of the DOM: the interesting part
 * of a letter library is the geometry, and it should be usable from a canvas,
 * a build script, or a plotter just as well as from a component.
 */
export function glyphGeometry(
  font: GlyphFont,
  char: string,
  { stretch, protectStems = true, stemWidth, smooth = false }: GlyphOptions = {},
): GlyphGeometry {
  const data = font.glyphs[char] ?? font.glyphs[char.toUpperCase()];

  if (!data) {
    // A space carries an advance and no ink; anything else unknown is treated
    // the same way rather than throwing, so a caller can set arbitrary text.
    const blank = char === " " ? font.em * 0.26 : font.em * 0.32;
    return {
      char,
      d: "",
      contours: [],
      bbox: [0, 0, 0, 0],
      advance: blank * (stretch?.x ?? 1),
      lsb: 0,
      rsb: blank,
      missing: char !== " ",
    };
  }

  const sx = stretch?.x ?? 1;
  const sy = stretch?.y ?? 1;
  const same = Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4;

  let contours: readonly Contour[] = data.contours;
  let bbox = data.bbox;

  if (!same) {
    contours = warpContours(data.contours, {
      stretch,
      protectStems,
      smooth,
      stemWidth: stemWidth ?? font.stemWidth,
    });

    // The side bearings are air the designer drew, and they are part of the
    // letter's width, so they widen with it — the same thing a real width
    // axis does to the em. Shifting the ink to sit on the new left bearing
    // keeps the letter centred in its own advance.
    const shift = data.lsb * (sx - 1);
    if (Math.abs(shift) > 1e-4) {
      contours = contours.map((c) => c.map(([x, y]) => [x + shift, y] as const));
    }
    bbox = bboxOf(contours) as [number, number, number, number];
  }

  return {
    char,
    d: toPathData(contours),
    contours,
    bbox,
    lsb: data.lsb * sx,
    rsb: data.rsb * sx,
    // Measured from the ink out, so the advance always matches the geometry
    // the caller is about to draw.
    advance: bbox[2] + data.rsb * sx,
    missing: false,
  };
}

/**
 * The most this text can be condensed before stroke weight starts to go.
 *
 * Fitting a word to a width by condensing is free down to this factor and
 * costs weight below it, so it is the number to check before deciding that a
 * headline can be made to fit.
 */
export function minStretch(font: GlyphFont, text: string, stemWidth?: number): number {
  let floor = 0;
  for (const char of text) {
    const data = font.glyphs[char] ?? font.glyphs[char.toUpperCase()];
    if (!data || !data.contours.length) continue;
    // The word is only as condensable as its least condensable letter.
    floor = Math.max(floor, condensingFloor(data.contours, stemWidth ?? font.stemWidth));
  }
  return floor;
}

/** Metrics for sizing a glyph against a layout, in em units. */
export function glyphMetrics(font: GlyphFont) {
  return {
    em: font.em,
    capHeight: font.capHeight,
    xHeight: font.xHeight,
    ascender: font.ascender,
    descender: font.descender,
    stemWidth: font.stemWidth,
  };
}

/** Every character the font was extracted with. */
export function alphabet(font: GlyphFont): string[] {
  return Object.keys(font.glyphs);
}

export type { Stretch };
