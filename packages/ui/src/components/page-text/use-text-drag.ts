import type { PageFrame, PageTextObject, ScreenRect, ScreenPoint } from "@pdf-editor/core";
import { displayedSize, pdfRectToScreen, screenDeltaToPdf } from "@pdf-editor/core";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

/** A press that moves less than this (CSS pixels) is a click: it opens the editor instead. */
const DRAG_THRESHOLD = 3;

interface Press {
  readonly pointerId: number;
  readonly object: PageTextObject;
  readonly startX: number;
  readonly startY: number;
  dragging: boolean;
}

export interface TextDrag {
  /** The text being dragged and how far it has moved on screen, while it moves or until the page redraws. */
  readonly moving: { readonly object: PageTextObject; readonly offset: ScreenPoint } | null;
  /** Drops the preview (call when the page's fresh text arrives). */
  clear(): void;
  onPointerDown(event: PointerEvent<SVGElement>, object: PageTextObject): void;
  onPointerMove(event: PointerEvent<SVGElement>): void;
  onPointerUp(event: PointerEvent<SVGElement>): void;
  onPointerCancel(event: PointerEvent<SVGElement>): void;
}

/**
 * Press-and-drag on page text: a drag moves it, a press without movement is a click.
 * @param frame How the page is shown, to turn the screen distance into a PDF distance.
 * @param onMove Records a finished move (dx, dy in points).
 * @param onClick Called for a press that did not move.
 * @returns The live preview and handlers to spread on each outline.
 */
export function useTextDrag(
  frame: PageFrame,
  onMove: (object: PageTextObject, dx: number, dy: number) => void,
  onClick?: (object: PageTextObject, point: ScreenPoint) => void,
): TextDrag {
  const press = useRef<Press | null>(null);
  const [moving, setMoving] = useState<TextDrag["moving"]>(null);

  const clear = useCallback(() => setMoving(null), []);
  useEffect(() => {
    /** @param event The key pressed during a drag. @returns Nothing. */
    function cancel(event: KeyboardEvent) {
      if (event.key !== "Escape" || !press.current) return;
      press.current = null;
      clear();
    }
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [clear]);

  /** @param state The captured press. @param event The latest pointer position. @returns The bounded displacement. */
  function offsetOf(state: Press, event: PointerEvent<SVGElement>): ScreenPoint {
    const box = pdfRectToScreen(state.object.bounds, frame);
    const page = displayedSize(frame);
    return {
      x: Math.max(-box.left, Math.min(event.clientX - state.startX, page.width - box.left - box.width)),
      y: Math.max(-box.top, Math.min(event.clientY - state.startY, page.height - box.top - box.height)),
    };
  }

  return {
    moving,
    clear,
    onPointerDown(event, object) {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      press.current = {
        pointerId: event.pointerId,
        object,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
    },
    onPointerMove(event) {
      const state = press.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const offset = offsetOf(state, event);
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.dragging && distance < DRAG_THRESHOLD) return;
      state.dragging = true;
      setMoving({ object: state.object, offset });
    },
    onPointerUp(event) {
      const state = press.current;
      if (!state || state.pointerId !== event.pointerId) return;
      press.current = null;
      if (!state.dragging) {
        onClick?.(state.object, { x: event.clientX, y: event.clientY });
        return;
      }
      const offset = offsetOf(state, event);
      setMoving({ object: state.object, offset }); // kept until the page redraws with the text moved
      const delta = screenDeltaToPdf(offset, frame);
      onMove(state.object, delta.x, delta.y);
    },
    onPointerCancel(event) {
      if (press.current?.pointerId !== event.pointerId) return;
      press.current = null;
      setMoving(null);
    },
  };
}

/**
 * @param box The displayed line bounds.
 * @param point The page-relative pointer position.
 * @returns Whether a mouse press should move this line.
 */
export function onLineEdge(box: ScreenRect, point: ScreenPoint) {
  const dx = Math.min(point.x - box.left, box.left + box.width - point.x);
  const dy = Math.min(point.y - box.top, box.top + box.height - point.y);
  // Reserve the middle half of a small line for text selection.
  return dx >= -6 && dy >= -6 && (dx <= Math.min(6, box.width / 4) || dy <= Math.min(6, box.height / 4));
}
