/**
 * A letter is a shape, not a character.
 *
 * Everything here follows from that: outlines extracted from a font at build
 * time, a warp that stretches them without ruining their stroke weight, and a
 * component that draws one with real clips, real strokes and real joins.
 */

export { Glyph, glyphBox } from "./Glyph";
export type { GlyphProps, GlyphLayers, GlyphBox } from "./Glyph";

export { Word } from "./Word";
export type { WordProps } from "./Word";

export { glyphGeometry, glyphMetrics, alphabet, minStretch } from "./outline";
export type { GlyphGeometry, GlyphOptions } from "./outline";

export { warpContours, condensingFloor } from "./warp";
export { bboxOf, densify, scanline, toPathData, transpose } from "./geometry";
export type { Run } from "./geometry";

export { topoLevels } from "./topo";
export type { TopoLevel, TopoOptions } from "./topo";

export type {
  Contour,
  GlyphData,
  GlyphFont,
  Point,
  Stretch,
  WarpOptions,
} from "./types";
