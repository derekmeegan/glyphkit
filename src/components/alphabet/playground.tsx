"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Word, type GlyphFont } from "glyphkit";
import initialFont from "glyphkit/fonts/familjen-grotesk-700";
import { ArrowDownToLine, Check, ChevronDown, RotateCcw, X } from "lucide-react";

import { INK, LETTERS, MAX_SCALE, MIN_SCALE, clampScale, defaults, initialComposition, layoutComposition, resizeLetter, type Composition, type LetterBox, type LetterSettings } from "./composition";
import styles from "./playground.module.css";
import { geometryFor, letterSvg } from "./drawing";
import { FAMILIES, WEIGHTS, loadTypeface, type Family, type Weight, type FontChoice } from "./typefaces";

const COLORS = [INK, "#e8492d", "#3159d8", "#a48320"];
const HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
type Handle = typeof HANDLES[number];
type Drag = {
  char: string;
  handle: Handle;
  pointerId: number;
  startX: number;
  startY: number;
  box: LetterBox;
  composition: Composition;
  layout: ReturnType<typeof layoutComposition>;
  target: HTMLButtonElement;
  ratios: Record<string, number>;
};


const LetterDrawing = memo(function LetterDrawing({ font, box, baseSize, settings }: {
  font: GlyphFont;
  box: LetterBox;
  baseSize: number;
  settings: LetterSettings;
}) {
  const geometry = useMemo(() => geometryFor(font, box, baseSize, settings), [font, box, baseSize, settings]);
  const [x0, y0, x1, y1] = geometry.bbox;
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} width="100%" height="100%" aria-hidden="true" overflow="visible">
      <path d={geometry.d} fill={settings.outline ? "none" : settings.color}
        stroke={settings.outline ? settings.color : "none"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}, (previous, next) => previous.font === next.font && previous.baseSize === next.baseSize && previous.settings === next.settings
  && previous.box.char === next.box.char && previous.box.width === next.box.width && previous.box.height === next.box.height);

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className={styles.range}>
      <span><span>{label}</span><output>{Math.round(value * 100)}<small>%</small></output></span>
      <input type="range" aria-label={label} min={MIN_SCALE} max={MAX_SCALE} step="0.01" value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function Playground() {
  const [choice, setChoice] = useState<FontChoice>({ family: "Familjen Grotesk", weight: 700 });
  const [typeface, setTypeface] = useState({ family: "Familjen Grotesk" as Family, weight: 700 as Weight, font: initialFont });
  const [fontLoading, setFontLoading] = useState(false);
  const fontRequest = useRef(0);
  const font = typeface.font;
  const ratios = useMemo(() => Object.fromEntries(LETTERS.map((char) => {
    const [x0, y0, x1, y1] = font.glyphs[char].bbox;
    return [char, (x1 - x0) / (y1 - y0)];
  })), [font]);
  const [composition, setComposition] = useState(initialComposition);
  const [selected, setSelected] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ side: "right", vertical: "bottom" });
  const [dragging, setDragging] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [notice, setNotice] = useState("");
  const canvas = useRef<HTMLDivElement>(null);
  const letterButtons = useRef(new Map<string, HTMLButtonElement>());
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<Composition | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layout = useMemo(() => layoutComposition(dimensions.width, dimensions.height, composition, ratios), [dimensions, composition, ratios]);
  const current = selected ? composition[selected] : null;
  const download = useMemo(() => {
    const box = layout.boxes.find((box) => box.char === selected);
    if (!box || !current || !dimensions.width) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(letterSvg(font, box, layout.baseSize, current))}`;
  }, [selected, current, dimensions.width, font, layout]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (editorOpen) closeButton.current?.focus({ preventScroll: true });
  }, [editorOpen]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    if (selected) letterButtons.current.get(selected)?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = drag.current;
      if (active) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        pending.current = null;
        setComposition(active.composition);
        drag.current = null;
        if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
        setDragging(false);
      } else {
        closeEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeEditor]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
  }, []);

  function update(char: string, patch: Partial<LetterSettings>) {
    setComposition((previous) => ({ ...previous, [char]: { ...previous[char], ...patch } }));
  }

  async function changeTypeface(next: FontChoice) {
    const request = ++fontRequest.current;
    setChoice(next);
    setFontLoading(true);
    try {
      const loaded = await loadTypeface(next);
      if (request !== fontRequest.current) return;
      setTypeface({ ...next, font: loaded });
    } catch {
      if (request !== fontRequest.current) return;
      setChoice({ family: typeface.family, weight: typeface.weight });
      announce("Couldn’t load that typeface. Try again.");
    } finally {
      if (request === fontRequest.current) setFontLoading(false);
    }
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, char: string, handle: Handle) {
    if (event.button !== 0 || drag.current || fontLoading) return;
    event.preventDefault();
    event.stopPropagation();
    const box = layout.boxes.find((box) => box.char === char)!;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { char, handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, box, composition, layout, target: event.currentTarget, ratios };
    setSelected(char);
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = (event.clientX - active.startX) * (active.handle.includes("w") ? -1 : 1);
    const dy = (event.clientY - active.startY) * (active.handle.includes("n") ? -1 : 1);
    const size = resizeLetter(active.char,
      /[ew]/.test(active.handle) ? active.box.width + dx : undefined,
      /[ns]/.test(active.handle) ? active.box.height + dy : undefined,
      active.layout, active.composition, active.ratios);
    pending.current = { ...active.composition, [active.char]: { ...active.composition[active.char], ...size } };
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      if (pending.current) setComposition(pending.current);
      pending.current = null;
      frame.current = null;
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (cancelled) setComposition(active.composition);
    else if (pending.current) setComposition(pending.current);
    pending.current = null;
    frame.current = null;
    drag.current = null;
    if (active.target.hasPointerCapture(event.pointerId)) active.target.releasePointerCapture(event.pointerId);
    setDragging(false);
    letterButtons.current.get(active.char)?.focus({ preventScroll: true });
  }

  function announce(message: string) {
    setNotice(message);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2600);
  }


  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.wordmark} aria-label="glyphkit"><Word text="GLYPHKIT" font={initialFont} size={12} fill={INK} tracking={-.04} /></h1>
        <div className={styles.actions}>
          <button type="button" aria-label="Reset alphabet" onClick={() => { setComposition(initialComposition()); setSelected(null); setEditorOpen(false); announce("Alphabet reset"); }}><RotateCcw size={13} /><span>Reset</span></button>
          <a href="https://github.com/derekmeegan/glyphkit" target="_blank" rel="noopener noreferrer" aria-label="Glyphkit on GitHub" title="GitHub">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" /></svg>
          </a>
        </div>
      </header>

      <div className={`${styles.canvas} ${dragging ? styles.dragging : ""}`} ref={canvas}
        aria-label="Interactive alphabet" onPointerDown={(event) => {
          if (event.target === event.currentTarget) { setSelected(null); setEditorOpen(false); }
        }}>
        {dimensions.width > 0 ? layout.boxes.map((box) => (
          <div key={box.char} className={`${styles.letter} ${selected === box.char ? styles.selected : ""}`}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height } as CSSProperties}>
            <button type="button" className={styles.letterButton}
              ref={(element) => { if (element) letterButtons.current.set(box.char, element); else letterButtons.current.delete(box.char); }}
              aria-label={`Edit letter ${box.char}`} aria-expanded={selected === box.char && editorOpen}
              aria-controls={selected === box.char && editorOpen ? "letter-editor" : undefined}
              aria-describedby="alphabet-help"
              onClick={() => {
                setSelected(box.char);
                setEditorPosition({
                  side: box.x + box.width / 2 > dimensions.width / 2 ? "left" : "right",
                  vertical: box.y + box.height / 2 > dimensions.height / 2 ? "top" : "bottom",
                });
                setEditorOpen(true);
              }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                const step = event.shiftKey ? 0.15 : 0.05;
                const setting = composition[box.char];
                setSelected(box.char);
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") update(box.char, { x: clampScale(setting.x + (event.key === "ArrowRight" ? step : -step)) });
                else update(box.char, { y: clampScale(setting.y + (event.key === "ArrowUp" ? step : -step)) });
              }}>
              <LetterDrawing font={font} box={box} baseSize={layout.baseSize} settings={composition[box.char]} />
            </button>
            <span className={styles.selectionBorder} aria-hidden="true" />
            {HANDLES.map((handle) => (
              <button key={handle} type="button" tabIndex={-1} aria-hidden="true" aria-label={`Resize ${box.char} ${handle}`}
                className={`${styles.handle} ${styles[handle]}`} onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => startDrag(event, box.char, handle)} onPointerMove={moveDrag}
                onPointerUp={(event) => endDrag(event)} onPointerCancel={(event) => endDrag(event, true)}
                onLostPointerCapture={(event) => endDrag(event, true)}><span /></button>
            ))}
          </div>
        )) : <div className={styles.fallback} aria-label="Loading interactive alphabet">{["ABCDEF", "GHIJKLM", "NOPQRST", "UVWXYZ"].map((row) => <span key={row}>{row}</span>)}</div>}
      </div>

      <footer className={styles.footer}>
        <p id="alphabet-help">Drag or click to edit<span className={styles.keyboardHelp}>. When focused, use arrow keys to resize; Shift for larger steps.</span></p>
        <div className={styles.typeface} aria-busy={fontLoading}>
          <label><select aria-label="Typeface" value={choice.family} disabled={dragging} onChange={(event) => changeTypeface({ ...choice, family: event.target.value as Family })}>{FAMILIES.map((family) => <option key={family}>{family}</option>)}</select><ChevronDown size={10} /></label>
          <label><select aria-label="Font weight" value={choice.weight} disabled={dragging} onChange={(event) => changeTypeface({ ...choice, weight: Number(event.target.value) as Weight })}>{WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select><ChevronDown size={10} /></label>
          <span className={styles.keyboardHelp} role="status">{fontLoading ? "Loading typeface" : `${typeface.family}, ${typeface.weight}`}</span>
        </div>
      </footer>

      {selected && current && editorOpen && (
        <aside id="letter-editor" className={styles.editor} data-side={editorPosition.side} data-vertical={editorPosition.vertical} aria-label={`Edit letter ${selected}`}>
          <div className={styles.editorHeader}>
            <div><span className={styles.editorEyebrow}>LETTER {String(LETTERS.indexOf(selected) + 1).padStart(2, "0")} / 26</span><h2>{selected}<span>Make it your own.</span></h2></div>
            <button ref={closeButton} className={styles.close} type="button" onClick={closeEditor} aria-label="Close letter editor"><X size={17} /></button>
          </div>
          <div className={styles.ranges}>
            <Range label="Width" value={current.x} onChange={(x) => update(selected, { x })} />
            <Range label="Height" value={current.y} onChange={(y) => update(selected, { y })} />
          </div>
          <label className={styles.protect}><span>Keep stroke weight</span><input type="checkbox" checked={current.protect} onChange={(event) => update(selected, { protect: event.target.checked })} /><span className={styles.checkbox}><Check size={11} strokeWidth={2.5} /></span></label>
          <div className={styles.appearance}>
            <span className={styles.fieldLabel}>Appearance</span>
            <div className={styles.segments} aria-label="Letter appearance">
              <button type="button" aria-pressed={!current.outline} onClick={() => update(selected, { outline: false })}>Solid</button>
              <button type="button" aria-pressed={current.outline} onClick={() => update(selected, { outline: true })}>Outline</button>
            </div>
          </div>
          <div className={styles.colorRow}><span className={styles.fieldLabel}>Ink</span><div className={styles.swatches}>
            {COLORS.map((color, index) => <button key={color} type="button" aria-label={["Charcoal ink", "Vermilion ink", "Blue ink", "Ochre ink"][index]} aria-pressed={current.color === color}
              style={{ "--swatch": color } as CSSProperties} onClick={() => update(selected, { color })}>{current.color === color && <Check size={11} strokeWidth={2.5} />}</button>)}
            <label className={styles.customColor} title="Choose an ink color"><input type="color" aria-label="Custom ink color" value={current.color} onChange={(event) => update(selected, { color: event.target.value })} /><span>+</span></label>
          </div></div>
          <div className={styles.editorFooter}>
            <button type="button" onClick={() => update(selected, defaults())}><RotateCcw size={12} />Reset letter</button>
            <a href={download ?? undefined} download={`letter-${selected.toLowerCase()}.svg`}><ArrowDownToLine size={13} />SVG</a>
          </div>
        </aside>
      )}
      <div className={`${styles.notice} ${notice ? styles.noticeVisible : ""}`} role="status">{notice}</div>
    </main>
  );
}
