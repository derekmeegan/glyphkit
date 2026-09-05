"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { GripHorizontal, X } from "lucide-react";
import styles from "./playground.module.css";

type Position = { x: number; y: number };
type Drag = { pointerId: number; x: number; y: number; origin: Position; previous: Position | null };

export default function MovableEditor({ label, side, vertical, preview, closeButton, onClose, children }: {
  label: string;
  side: string;
  vertical: string;
  preview: ReactNode;
  closeButton: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [moving, setMoving] = useState(false);

  function constrain(next: Position): Position {
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return next;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 12;
    const top = (viewport?.offsetTop ?? 0) + 12;
    return {
      x: Math.max(left, Math.min(next.x, left + (viewport?.width ?? window.innerWidth) - bounds.width - 24)),
      y: Math.max(top, Math.min(next.y, top + (viewport?.height ?? window.innerHeight) - bounds.height - 24)),
    };
  }

  useEffect(() => {
    const keepVisible = () => setPosition((previous) => previous ? constrain(previous) : previous);
    const observer = new ResizeObserver(keepVisible);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", keepVisible);
    window.visualViewport?.addEventListener("resize", keepVisible);
    window.visualViewport?.addEventListener("scroll", keepVisible);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", keepVisible);
      window.visualViewport?.removeEventListener("resize", keepVisible);
      window.visualViewport?.removeEventListener("scroll", keepVisible);
    };
  }, []);

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (cancelled) setPosition(active.previous);
    drag.current = null;
    setMoving(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <aside ref={panel} id="letter-editor" className={styles.editor} data-side={side} data-vertical={vertical}
      aria-label={label} style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
      <div className={styles.editorHeader}>
        <button type="button" className={styles.editorMove} aria-label="Move letter editor"
          title="Drag to move. Use arrow keys when focused." data-moving={moving}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current || !panel.current) return;
            event.preventDefault();
            const bounds = panel.current.getBoundingClientRect();
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
              origin: { x: bounds.left, y: bounds.top }, previous: position };
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoving(true);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            setPosition(constrain({ x: active.origin.x + event.clientX - active.x, y: active.origin.y + event.clientY - active.y }));
          }}
          onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
          onLostPointerCapture={(event) => finish(event, true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) {
              event.stopPropagation();
              setPosition(drag.current.previous);
              const pointerId = drag.current.pointerId;
              drag.current = null;
              setMoving(false);
              if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
              return;
            }
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !panel.current) return;
            event.preventDefault();
            const bounds = panel.current.getBoundingClientRect();
            const step = event.shiftKey ? 40 : 10;
            setPosition(constrain({
              x: bounds.left + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
              y: bounds.top + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
            }));
          }}>
          <GripHorizontal size={16} className={styles.editorGrip} />
          <span className={styles.editorPreview}>{preview}</span>
        </button>
        <button ref={closeButton} className={styles.close} type="button" onClick={onClose} aria-label="Close letter editor"><X size={17} /></button>
      </div>
      {children}
    </aside>
  );
}
