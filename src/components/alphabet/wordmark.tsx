"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Word } from "glyphkit";
import font from "glyphkit/fonts/familjen-grotesk-700";
import { INK } from "./composition";
import styles from "./playground.module.css";

/* ANIMATION STORYBOARD
 *    0ms   hover or keyboard focus reveals the cursor
 *   48ms   sentence starts typing (48ms per character, matching the CV)
 * 1200ms   complete sentence stays visible until leaving
 *  leave   hide and reset; reduced motion reveals the sentence immediately
 */
const TIMING = {
  character: 48,     // time between characters, including the first
  cursorPulse: 2000, // gentle caret pulse, matching the CV
};
const DESCRIPTION = "Stretch and style letters.";
const IDLE = -1;

export default function Wordmark() {
  const [stage, setStage] = useState(IDLE);

  useEffect(() => {
    if (stage < 0 || stage >= DESCRIPTION.length) return;
    const timer = setTimeout(() => {
      setStage((current) => current < 0 ? current : current + 1);
    }, TIMING.character);
    return () => clearTimeout(timer);
  }, [stage]);

  function startTyping() {
    setStage(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? DESCRIPTION.length : 0);
  }

  return (
    <div className={styles.brand}
      style={{ "--cursor-pulse": `${TIMING.cursorPulse}ms` } as CSSProperties}
      onMouseEnter={startTyping}
      onMouseLeave={(event) => {
        if (!event.currentTarget.querySelector(":focus-visible")) setStage(IDLE);
      }}
      onFocus={startTyping}
      onBlur={(event) => {
        if (!event.currentTarget.matches(":hover")) setStage(IDLE);
      }}>
      <h1 className={styles.wordmark} aria-label="glyphkit" aria-describedby="glyphkit-description" tabIndex={0}>
        <Word text="GLYPHKIT" font={font} size={12} fill={INK} tracking={-.04} />
      </h1>
      <span className={styles.wordmarkDescription} aria-hidden="true" data-visible={stage >= 0}>
        {DESCRIPTION.slice(0, Math.max(0, stage))}<span className={styles.typingCursor}>|</span>
      </span>
      <span id="glyphkit-description" className={styles.keyboardHelp}>{DESCRIPTION}</span>
    </div>
  );
}
