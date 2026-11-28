import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { PageBox } from "@pdf-editor/core";
import type { PageMenuAnchor } from "../organize/PageMenu";
import { moveTarget } from "../organize/move-target";
import { pointerGap, startsDrag } from "./rail-reorder";

interface Gesture {
  id: string;
  index: number;
  pointer: number;
  x: number;
  y: number;
  start: number;
  clientY: number;
  active: boolean;
  offset?: number;
  gap: number;
  timer?: number;
  frame?: number;
}

interface DragOptions {
  scroll: RefObject<HTMLDivElement | null>;
  boxes: readonly PageBox[];
  order: readonly string[];
  move: (ids: string[], index: number) => void;
  menu: (anchor: PageMenuAnchor) => void;
}

/**
 * @param options Rail geometry, command and context menu.
 * @returns Pointer handlers and the lifted page's position.
 */
export function useRailDrag({ scroll, boxes, order, move, menu }: DragOptions) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [lift, setLift] = useState<{ index: number; gap: number; offset: number } | null>(null);

  /** @returns Nothing. Releases timers and pending animation. */
  function clear() {
    const g = gesture.current;
    window.clearTimeout(g?.timer);
    if (g?.frame !== undefined) cancelAnimationFrame(g.frame);
    gesture.current = null;
  }

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !gesture.current) return;
      e.stopPropagation();
      suppressClick.current = true;
      clear();
      setLift(null);
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      clear();
      window.removeEventListener("keydown", escape, true);
    };
  }, []);

  /** @returns Nothing. Scrolls at the edge and recomputes the gap even with a stationary pointer. */
  function frame() {
    const g = gesture.current;
    const el = scroll.current;
    if (!g?.active || !el) return;
    const rect = el.getBoundingClientRect();
    const edge = g.clientY < rect.top + 32 ? -1 : g.clientY > rect.bottom - 32 ? 1 : 0;
    el.scrollTop += edge * 8;
    const y = g.clientY - rect.top + el.scrollTop;
    const offset = y - g.start;
    if (offset !== g.offset) {
      g.offset = offset;
      g.gap = pointerGap(boxes, y);
      setLift({ index: g.index, gap: g.gap, offset });
    }
    g.frame = requestAnimationFrame(frame);
  }

  return {
    lift,
    suppressClick,
    down(e: PointerEvent<HTMLButtonElement>, id: string, index: number) {
      if (!e.isPrimary || e.button !== 0 || !scroll.current) return;
      clear();
      suppressClick.current = false;
      const el = e.currentTarget;
      const { clientX: x, clientY: y, pointerId: pointer } = e;
      el.setPointerCapture(pointer);
      const start = y - scroll.current.getBoundingClientRect().top + scroll.current.scrollTop;
      const g: Gesture = { id, index, pointer, x, y, start, clientY: y, active: false, gap: index };
      gesture.current = g;
      if (e.pointerType === "touch")
        g.timer = window.setTimeout(() => {
          clear();
          suppressClick.current = true;
          menu({ id, element: el, point: { x, y } });
        }, 450);
    },
    motion(e: PointerEvent) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointer) return;
      g.clientY = e.clientY;
      if (g.active || !startsDrag(e.clientX - g.x, e.clientY - g.y)) return;
      window.clearTimeout(g.timer);
      suppressClick.current = true;
      g.active = true;
      frame();
    },
    end(e: PointerEvent, commit: boolean) {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return;
      if (commit && g.active && scroll.current) {
        const y = e.clientY - scroll.current.getBoundingClientRect().top + scroll.current.scrollTop;
        const gap = pointerGap(boxes, y);
        const target = moveTarget(order, new Set([g.id]), gap);
        if (order[g.index] === g.id && target !== g.index) move([g.id], target);
      }
      clear();
      setLift(null);
    },
  };
}
