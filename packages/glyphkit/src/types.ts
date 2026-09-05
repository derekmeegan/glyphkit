/**
 * A letter, as geometry rather than as text.
 *
 * Coordinates are y-down with the baseline at y = 0 and the em box `em` units
 * wide, so caps occupy negative y. The metrics below stay positive distances
 * *from* the baseline: the cap line is at y = -capHeight, the descender line
 * at y = +descender.
 */
export type Point = readonly [number, number];

/** One closed loop. The closing edge back to point 0 is implicit. */
export type Contour = readonly Point[];

export type GlyphData = {
  /** How far the pen moves after setting this glyph, in em units. */
  readonly advance: number;
  /** Left and right side bearings — the air the designer drew around the ink. */
  readonly lsb: number;
  readonly rsb: number;
  /** [minX, minY, maxX, maxY] of the ink itself. */
  readonly bbox: readonly [number, number, number, number];
  readonly contours: readonly Contour[];
};

export type GlyphFont = {
  readonly name: string;
  /** Units per em. Everything else in the file is in these units. */
  readonly em: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly xHeight: number;
  /**
   * The font's dominant stroke weight. The warp uses it to tell a stem from a
   * bar; see `warpContours`.
   */
  readonly stemWidth: number;
  readonly glyphs: Readonly<Record<string, GlyphData>>;
};

/**
 * How far to stretch, per axis. 1 is the letter as drawn.
 *
 * These are *width* factors, not transforms: at x: 1.6 the letter occupies
 * 1.6x the horizontal space, but with `protectStems` on, its strokes are
 * still the weight the type designer drew.
 */
export type Stretch = {
  readonly x?: number;
  readonly y?: number;
};

export type WarpOptions = {
  readonly stretch?: Stretch;
  /**
   * Use a continuous axis map without local scanline corrections. Keeps joins
   * smooth at display sizes, trading some stroke precision on curves and diagonals.
   */
  readonly smooth?: boolean;
  /**
   * Hold stroke weight constant while stretching. Off, this degrades to the
   * plain anisotropic scale, which is the distortion you already know.
   */
  readonly protectStems?: boolean;
  /**
   * The stroke weight to protect, in em units. Defaults to the font's.
   * Raising it protects wider runs of ink; lowering it lets more of them
   * stretch as bars.
   */
  readonly stemWidth?: number;
};
