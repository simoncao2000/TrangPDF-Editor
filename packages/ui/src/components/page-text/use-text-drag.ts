import type { PageFrame, PageTextObject, ScreenPoint } from "@pdf-editor/core";
import { screenDeltaToPdf } from "@pdf-editor/core";
import { useCallback, useRef, useState, type PointerEvent } from "react";

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
  /** Pointer handlers for one text outline. */
  handlersFor(object: PageTextObject): {
    onPointerDown(event: PointerEvent<SVGElement>): void;
    onPointerMove(event: PointerEvent<SVGElement>): void;
    onPointerUp(event: PointerEvent<SVGElement>): void;
    onPointerCancel(event: PointerEvent<SVGElement>): void;
  };
}

/**
 * Press-and-drag on page text: a drag moves it, a press without movement is a click.
 * @param frame How the page is shown, to turn the screen distance into a PDF distance.
 * @param onMove Records a finished move (dx, dy in points).
 * @param onClick Called for a press that did not move.
 * @returns The live preview and handlers to spread on each outline.
 */
export function useTextDrag(frame: PageFrame, onMove: (object: PageTextObject, dx: number, dy: number) => void, onClick: (object: PageTextObject) => void): TextDrag {
  const press = useRef<Press | null>(null);
  const [moving, setMoving] = useState<TextDrag["moving"]>(null);

  const clear = useCallback(() => setMoving(null), []);
  const offsetOf = (state: Press, event: PointerEvent<SVGElement>): ScreenPoint => ({ x: event.clientX - state.startX, y: event.clientY - state.startY });

  return {
    moving,
    clear,
    handlersFor: (object) => ({
      onPointerDown(event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        press.current = { pointerId: event.pointerId, object, startX: event.clientX, startY: event.clientY, dragging: false };
      },
      onPointerMove(event) {
        const state = press.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const offset = offsetOf(state, event);
        if (!state.dragging && Math.hypot(offset.x, offset.y) < DRAG_THRESHOLD) return;
        state.dragging = true;
        setMoving({ object: state.object, offset });
      },
      onPointerUp(event) {
        const state = press.current;
        if (!state || state.pointerId !== event.pointerId) return;
        press.current = null;
        if (!state.dragging) {
          onClick(state.object);
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
    }),
  };
}
