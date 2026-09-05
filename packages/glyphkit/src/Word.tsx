"use client";

import { useId, useMemo, type CSSProperties, type ReactNode } from "react";

import { glyphBox, type GlyphLayers } from "./Glyph";
import type { GlyphOptions } from "./outline";
import type { GlyphFont } from "./types";

/**
 * A run of letters, each drawn as its own object.
 *
 * Not a text run with letter-spacing: every glyph keeps its own layers, its
 * own face and its own halo, and the gaps between them are explicit. That is
 * what lets a word be set tighter than its letters — where two glyphs cross,
 * both are still fully there, and the crossing reads as depth rather than as
 * a collision.
 */

export type WordProps = GlyphOptions &
  GlyphLayers & {
    readonly text: string;
    readonly font: GlyphFont;
    /** Cap height in px. */
    readonly size?: number;
    /**
     * Extra space between letters as a fraction of the advance. Negative
     * packs them into each other.
     */
    readonly tracking?: number;
    /**
     * Per-gap multipliers on the tracking, one shorter than the text. Some
     * pairs want more of the closing than others: N|A cannot give up much
     * without erasing the N's right stem, while A|T interlocks and wants to
     * close until the leg meets the arm.
     */
    readonly kerning?: readonly number[];
    /**
     * Drawn inside every letter, clipped to it, positioned so the surface
     * runs continuously across the whole word rather than restarting inside
     * each glyph. Receives the letter's x offset within the word, in px.
     */
    readonly surface?: (offsetX: number, width: number) => ReactNode;
    readonly className?: string;
    readonly style?: CSSProperties;
  };

export function Word({
  text,
  font,
  size = 200,
  stretch,
  protectStems = true,
  smooth = false,
  stemWidth,
  tracking = 0,
  kerning,
  surface,
  className,
  style,
  fill = "#ffffff",
  stroke,
  strokeWidth = 0,
  depth = 0,
  depthStep = 0.013,
  depthStroke = "rgba(150, 190, 245, 0.5)",
  depthStrokeWidth = 0,
  halo = 0,
  haloColor = "#050506",
}: WordProps) {
  const auto = useId();
  const layers = { depth, depthStep, halo, strokeWidth, depthStrokeWidth };

  const laid = useMemo(() => {
    const chars = Array.from(text);
    const boxes = chars.map((ch) =>
      glyphBox(font, ch, size, { stretch, protectStems, stemWidth, smooth }, layers),
    );

    // Walk the pen. Each letter is placed against the running advance, with
    // its ink offset from the pen by its own left bearing, so a letter that
    // was drawn tucked in stays tucked in.
    let pen = 0;
    const placed = boxes.map((box, i) => {
      const x = pen + box.geometry.bbox[0] * box.scale;
      if (i < chars.length - 1) {
        pen += box.advance * (1 + tracking * (kerning?.[i] ?? 1));
      }
      return { box, x, char: chars[i] };
    });

    const last = placed[placed.length - 1];
    const width = last ? last.x + last.box.width : 0;
    // The extremes of the ink, not of any one letter: an O overshoots the cap
    // line and the baseline, and the box has to hold it.
    const top = Math.min(0, ...boxes.map((b) => b.geometry.bbox[1] * b.scale));
    const bottom = Math.max(0, ...boxes.map((b) => b.geometry.bbox[3] * b.scale));
    // Halo, outline and extrusion all draw outside the ink. The box grows by
    // that much on every side, so a word set inside a scroll container is not
    // shaved along the top.
    const bleed = Math.max(0, ...boxes.map((b) => b.bleed));

    return { placed, width, height: bottom - top, top, bleed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text, font, size, stretch?.x, stretch?.y, protectStems, stemWidth, smooth,
    tracking, kerning, depth, depthStep, halo, strokeWidth, depthStrokeWidth,
  ]);

  return (
    <div
      className={className}
      role="img"
      aria-label={text}
      style={{
        position: "relative",
        width: laid.width + 2 * laid.bleed,
        height: laid.height + 2 * laid.bleed,
        ...style,
      }}
    >
      {laid.placed.map(({ box, x, char }, i) => {
        const { d } = box.geometry;
        const em = font.em;
        const step = depthStep * em;
        const clipId = `word-${auto}-${i}`;
        if (!d) return null;

        return (
          <svg
            key={i}
            data-char={char}
            viewBox={box.viewBox}
            width={box.width + 2 * box.bleed}
            height={box.height + 2 * box.bleed}
            aria-hidden
            overflow="visible"
            style={{
              position: "absolute",
              // Each letter's own drawing box starts a bleed short of its
              // ink, and the word's box is inset by the same amount, so the
              // two cancel and the ink still starts at the word's origin.
              left: x - box.bleed + laid.bleed,
              // Letters sit on a shared baseline, so each is offset by how far
              // its own ink rises above it.
              top: box.geometry.bbox[1] * box.scale - laid.top - box.bleed + laid.bleed,
              // Later letters paint over earlier ones, and each carries its
              // own halo, so a crossing opens a gap instead of merging.
              zIndex: i,
            }}
          >
            {surface ? (
              <defs>
                <clipPath id={clipId}>
                  <path d={d} />
                </clipPath>
              </defs>
            ) : null}

            {depth > 0
              ? Array.from({ length: depth }, (_, k) => {
                  const back = depth - k;
                  return (
                    <path
                      key={k}
                      d={d}
                      transform={`translate(${back * step} ${back * step})`}
                      fill="none"
                      stroke={depthStroke}
                      // Paired with non-scaling-stroke, so this is px on screen.
                strokeWidth={depthStrokeWidth || 1}
                      strokeOpacity={0.05 + (k / depth) * 0.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })
              : null}

            {halo > 0 ? (
              <path
                d={d}
                fill={haloColor}
                stroke={haloColor}
                strokeWidth={halo * 2 * em}
                strokeLinejoin="round"
              />
            ) : null}

            <path d={d} fill={fill} />

            {surface ? (
              <g clipPath={`url(#${clipId})`}>
                {/*
                  The surface is drawn in the word's own pixel space, with its
                  origin at the word's top-left, and mapped into this glyph's
                  em space here. That is what makes it one surface the letters
                  are cut out of, rather than a texture restarting inside each
                  of them.
                */}
                <g
                  transform={
                    `translate(${box.geometry.bbox[0] - x / box.scale} ${laid.top / box.scale}) ` +
                    `scale(${1 / box.scale})`
                  }
                >
                  {surface(x, laid.width)}
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
      })}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        {text}
      </span>
    </div>
  );
}
