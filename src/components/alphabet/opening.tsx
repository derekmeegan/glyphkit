"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { glyphGeometry } from "glyphkit";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { INK, LETTERS, type LetterBox } from "./composition";
import styles from "./playground.module.css";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   one G, centered; measure the canvas behind it
 *  480ms   letters shoot from G → their measured positions
 *          (6ms stagger, 680ms flight with a small spring settle)
 * 1160ms   header and controls fade in as the last letters arrive
 * 1340ms   release all transforms; the alphabet becomes editable
 *
 * Reduced motion skips directly to the measured alphabet.
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  burst:       480, // begin the outward flight after measurement
  chrome:     1160, // reveal the header and footer
  complete:   1340, // enable editing after the final letter settles
  flight:      680, // duration of each letter's flight
  stagger:       6, // delay between launches
  seedFade:     90, // blend the initial G into the flying G
  chromeFade:  180, // reveal controls without moving the layout
};

const SEED = {
  height: 128, // centered G height, independent of viewport measurement
  particleScale: .18, // other letters begin small inside the G
};

const FLIGHT = {
  // Sample a lightly damped spring into a native CSS easing curve.
  damping: 10,
  frequency: 8,
  samples: 40,
};

const seed = glyphGeometry(font, "G");
const [x0, y0, x1, y1] = seed.bbox;
const seedWidth = SEED.height * (x1 - x0) / (y1 - y0);
const launchOrder = ["G", ...LETTERS.filter((char) => char !== "G")];
const spring = `linear(${Array.from({ length: FLIGHT.samples + 1 }, (_, index) => {
  if (index === FLIGHT.samples) return 1;
  const t = index / FLIGHT.samples;
  return (1 - Math.exp(-FLIGHT.damping * t) * (Math.cos(FLIGHT.frequency * t) + FLIGHT.damping / FLIGHT.frequency * Math.sin(FLIGHT.frequency * t))).toFixed(4);
}).join(", ")})`;

export const openingStyle = {
  "--opening-flight": `${TIMING.flight}ms`,
  "--opening-spring": spring,
  "--opening-seed-fade": `${TIMING.seedFade}ms`,
  "--opening-chrome-fade": `${TIMING.chromeFade}ms`,
} as CSSProperties;

export function useOpening(ready: boolean, replayTrigger = 0) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      timers.forEach(clearTimeout);
      setStage(3);
    };

    if (media.matches) timers.push(setTimeout(finish, 0));
    else {
      timers.push(setTimeout(() => setStage(0), 0));
      timers.push(setTimeout(() => setStage(1), TIMING.burst));
      timers.push(setTimeout(() => setStage(2), TIMING.chrome));
      timers.push(setTimeout(finish, TIMING.complete));
    }

    const onMotionChange = () => { if (media.matches) finish(); };
    media.addEventListener("change", onMotionChange);
    // A viewport change during the flight should immediately use the new layout.
    window.addEventListener("resize", finish);
    return () => {
      timers.forEach(clearTimeout);
      media.removeEventListener("change", onMotionChange);
      window.removeEventListener("resize", finish);
    };
  }, [ready, replayTrigger]);

  return stage;
}

export function openingLetterStyle(box: LetterBox, width: number, height: number): CSSProperties {
  const isSeed = box.char === "G";
  const initialHeight = SEED.height * (isSeed ? 1 : SEED.particleScale);
  const data = font.glyphs[box.char];
  const ratio = (data.bbox[2] - data.bbox[0]) / (data.bbox[3] - data.bbox[1]);
  return {
    "--opening-x": `${width / 2 - box.x - box.width / 2}px`,
    "--opening-y": `${height / 2 - box.y - box.height / 2}px`,
    "--opening-scale-x": initialHeight * ratio / box.width,
    "--opening-scale-y": initialHeight / box.height,
    "--opening-delay": `${launchOrder.indexOf(box.char) * TIMING.stagger}ms`,
    "--opening-opacity": isSeed ? 1 : 0,
  } as CSSProperties;
}

export function OpeningSeed() {
  return (
    <div className={styles.openingSeed} aria-hidden="true" style={{ width: seedWidth, height: SEED.height }}>
      <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} width="100%" height="100%">
        <path d={seed.d} fill={INK} />
      </svg>
    </div>
  );
}
