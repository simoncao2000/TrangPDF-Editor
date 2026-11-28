import { useLayoutEffect, useRef, useState } from "react";
import { onFrameEdge } from "./frame-edge";
import { clampFrameMove, pointerDelta } from "./frame-move";

const ZERO = { x: 0, y: 0 };

/** Inset the move outline enough to keep its hit band outside the edited text. */
const FRAME_OUTLINE_INSET = 2;

/** @returns A marker for the outline, its live translation, and its translation at commit time. */
export function useFrameMove() {
  const marker = useRef<HTMLSpanElement>(null);
  const offsetRef = useRef(ZERO);
  const [offset, setOffset] = useState(ZERO);

  useLayoutEffect(() => {
    const frame = marker.current?.parentElement;
    const page = frame?.closest("[data-page]");
    if (!frame || !page) return;
    let drag: { id: number; start: typeof ZERO; initial: typeof ZERO; box: DOMRect; page: DOMRect } | undefined;
    let hover: HTMLElement | SVGElement | undefined;
    let previousCursor = "";

    /** @returns Nothing. */
    function restoreCursor() {
      if (hover) hover.style.cursor = previousCursor;
      hover = undefined;
    }

    /** @param next The translated screen position. @returns Nothing. */
    function update(next: typeof ZERO) {
      offsetRef.current = next;
      setOffset(next);
    }

    /** @param event The pointer over or near the frame. @returns Whether the outline accepts the press. */
    function edge(event: PointerEvent) {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !page?.contains(target) ||
        target.closest("button, input, [data-text-style-controls]")
      )
        return false;
      const box = marker.current?.getBoundingClientRect();
      return !!box && onFrameEdge(box, { x: event.clientX, y: event.clientY }, event.pointerType);
    }

    /** @param event The primary pointer press. @returns Nothing. */
    function down(event: PointerEvent) {
      if (drag || event.button || !frame || !page || !edge(event)) return;
      event.preventDefault();
      event.stopPropagation();
      drag = {
        id: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        initial: offsetRef.current,
        box: frame.getBoundingClientRect(),
        page: page.getBoundingClientRect(),
      };
      frame.setPointerCapture(event.pointerId);
    }

    /** @param event The hovering or captured pointer. @returns Nothing. */
    function move(event: PointerEvent) {
      if (drag) {
        if (drag.id !== event.pointerId) return;
        const { start, initial, box, page } = drag;
        update(clampFrameMove(initial, pointerDelta(start, { x: event.clientX, y: event.clientY }), box, page));
        event.stopPropagation();
        return;
      }
      restoreCursor();
      if (!edge(event) || !(event.target instanceof HTMLElement || event.target instanceof SVGElement)) return;
      hover = event.target;
      previousCursor = hover.style.cursor;
      hover.style.cursor = "move";
    }

    /** @param event The completed or cancelled pointer. @returns Nothing. */
    function end(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      if (event.type === "pointercancel") update(drag.initial);
      drag = undefined;
      restoreCursor();
    }

    /** @param event The keyboard event during capture. @returns Nothing. */
    function escape(event: KeyboardEvent) {
      if (!drag || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      update(drag.initial);
      if (frame?.hasPointerCapture(drag.id)) frame.releasePointerCapture(drag.id);
      drag = undefined;
      restoreCursor();
    }

    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("lostpointercapture", end, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      restoreCursor();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("lostpointercapture", end, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, []);
  const edges = (
    <span
      ref={marker}
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ inset: FRAME_OUTLINE_INSET }}
    />
  );
  return { offset, offsetRef, edges };
}
