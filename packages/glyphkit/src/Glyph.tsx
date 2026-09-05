"use client";

import { useId, useMemo, type CSSProperties, type ReactNode, type SVGProps } from "react";

import { glyphGeometry, type GlyphGeometry, type GlyphOptions } from "./outline";
import type { GlyphFont } from "./types";

/**
 * One letter, drawn.
 *
 * The letter is a `<path>`, not a text run, and everything that used to be a
 * trick is now a straightforward drawing operation: the fill is a real clip,
 * the halo is a real offset stroke, the outline has real joins, and the
 * extrusion is the same path drawn again behind itself.
 */

export type GlyphLayers = {
  /** White by default. Set to "none" to see only the outline. */
  readonly fill?: string;
  /** Hairline around the letterform. */
  readonly stroke?: string;
  readonly strokeWidth?: number;
  /**
   * Copies of the letter receding behind it, and how far each one steps, in
   * em. A wireframe: stroked only, so every copy stays visible through the
   * one in front.
   */
  readonly depth?: number;
  readonly depthStep?: number;
  readonly depthStroke?: string;
  /** In px. The wireframe stays a hairline however large the letter is set. */
  readonly depthStrokeWidth?: number;
  /**
   * A cut of background around the letter, in em, painted under the face.
   * Against a matching ground it is invisible except where letters overlap,
   * which is exactly where a gap is wanted.
   */
  readonly halo?: number;
  readonly haloColor?: string;
};

export type GlyphProps = GlyphOptions &
  GlyphLayers & {
    readonly char: string;
    readonly font: GlyphFont;
    /** Cap height in px. The one number that sets the letter's size. */
    readonly size?: number;
    /**
     * Drawn inside the letter, clipped to it — a contour map, an image, a
     * gradient. This is the thing `background-clip: text` was standing in for.
     */
    readonly children?: ReactNode;
    /** Unique per instance when `children` are used; generated if omitted. */
    readonly id?: string;
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly title?: string;
    readonly svgProps?: SVGProps<SVGSVGElement>;
  };

/** Everything a caller needs to place a letter, in px. */
export type GlyphBox = {
  readonly geometry: GlyphGeometry;
  readonly scale: number;
  /** Ink size in px. */
  readonly width: number;
  readonly height: number;
  readonly advance: number;
  /** Room the drawing needs beyond the ink, in px. */
  readonly bleed: number;
  readonly viewBox: string;
};

/**
 * Size and box a glyph, in px.
 *
 * The viewBox is the ink box grown by whatever the layers stick out by —
 * halo, outline, extrusion — so nothing is clipped by its own SVG, and so the
 * caller can still lay out against the ink itself.
 */
export function glyphBox(
  font: GlyphFont,
  char: string,
  size: number,
  options: GlyphOptions = {},
  layers: GlyphLayers = {},
): GlyphBox {
  const geometry = glyphGeometry(font, char, options);
  const scale = size / font.capHeight;
  const [x0, y0, x1, y1] = geometry.bbox;

  const { depth = 0, depthStep = 0, halo = 0, strokeWidth = 0 } = layers;
  // In em units: the extrusion runs down-right, the halo and outline go every
  // way, and strokes are centred so only half of each sticks out. The depth
  // wireframe is a screen-space hairline and needs no allowance beyond the
  // offset it is drawn at.
  const bleedEm = Math.max(halo, strokeWidth / 2) + depth * depthStep;
  const bleed = bleedEm * font.em * scale;

  const w = (x1 - x0) * scale;
  const h = (y1 - y0) * scale;

  return {
    geometry,
    scale,
    width: w,
    height: h,
    advance: geometry.advance * scale,
    bleed,
    viewBox: `${x0 - bleedEm * font.em} ${y0 - bleedEm * font.em} ${
      x1 - x0 + 2 * bleedEm * font.em
    } ${y1 - y0 + 2 * bleedEm * font.em}`,
  };
}

export function Glyph({
  char,
  font,
  size = 200,
  stretch,
  protectStems = true,
  smooth = false,
  stemWidth,
  fill = "#ffffff",
  stroke,
  strokeWidth = 0,
  depth = 0,
  depthStep = 0.013,
  depthStroke = "rgba(150, 190, 245, 0.5)",
  depthStrokeWidth = 0,
  halo = 0,
  haloColor = "#050506",
  children,
  id,
  className,
  style,
  title,
  svgProps,
}: GlyphProps) {
  const layers = { depth, depthStep, halo, strokeWidth, depthStrokeWidth };
  const box = useMemo(
    () =>
      glyphBox(font, char, size, { stretch, protectStems, stemWidth, smooth }, layers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      font, char, size, stretch?.x, stretch?.y, protectStems, stemWidth, smooth,
      depth, depthStep, halo, strokeWidth, depthStrokeWidth,
    ],
  );

  // useId, not a module counter: the clip has to carry the same name through
  // the server render and the client one or the fill goes missing on hydrate.
  const auto = useId();
  const clipId = id ?? `glyph-${auto}`;
  const { d } = box.geometry;
  const em = font.em;
  const step = depthStep * em;

  if (!d) {
    // A space still occupies its advance, so a word built of these lays out.
    return (
      <svg
        width={box.advance}
        height={size}
        className={className}
        style={style}
        aria-hidden
        {...svgProps}
      />
    );
  }

  return (
    <svg
      viewBox={box.viewBox}
      width={box.width + 2 * box.bleed}
      height={box.height + 2 * box.bleed}
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      overflow="visible"
      {...svgProps}
    >
      {title ? <title>{title}</title> : null}

      {children ? (
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
      ) : null}

      {/* Receding copies, furthest first, so the nearest reads on top. */}
      {depth > 0
        ? Array.from({ length: depth }, (_, i) => {
            const back = depth - i;
            return (
              <path
                key={i}
                d={d}
                transform={`translate(${back * step} ${back * step})`}
                fill="none"
                stroke={depthStroke}
                // Paired with non-scaling-stroke, so this is px on screen.
                strokeWidth={depthStrokeWidth || 1}
                strokeOpacity={0.05 + (i / depth) * 0.2}
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        : null}

      {/* The cut of ground. Stroked and filled with the same colour, so the
          silhouette comes out fatter than the letter by half the stroke. */}
      {halo > 0 ? (
        <path
          d={d}
          fill={haloColor}
          stroke={haloColor}
          strokeWidth={halo * 2 * em}
          strokeLinejoin="round"
        />
      ) : null}

      {/* The face. */}
      <path d={d} fill={fill} />

      {/*
        Children are given the ink box as their own space: (0, 0) is the top
        left of the letter and (width, height) the bottom right. Without this
        they would land in em coordinates, where the letter sits *above* the
        baseline at negative y and a fill drawn from the origin misses it
        entirely.
      */}
      {children ? (
        <g clipPath={`url(#${clipId})`}>
          <g transform={`translate(${box.geometry.bbox[0]} ${box.geometry.bbox[1]})`}>
            {children}
          </g>
        </g>
      ) : null}

      {stroke && strokeWidth > 0 ? (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth * em}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
