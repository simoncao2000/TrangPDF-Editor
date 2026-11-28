import { screenToPdf, type PageFrame } from "@pdf-editor/core";
import type { PdfPoint } from "@pdf-editor/shared";
import { useEffect, useRef, type PointerEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useTextSelection } from "../../state/text-selection-store";

import { HOLD_TIME, pageHit, SELECT_DISTANCE } from "./page-hit";
import { selectWord } from "./select-word";

/**
 * Selecting page text by dragging across it with the Select tool. A press that does not move
 * (a click) selects nothing and clears any selection.
 * @param pageId The page.
 * @param frame How the page is shown.
 * @returns Pointer handlers for the page-sized surface under the annotations.
 */
export function useSelectText(pageId: string, frame: PageFrame) {
  const { session } = useEditorServices();
  const select = useTextSelection((state) => state.select);
  const drag = useRef<{ pointerId: number; from: PdfPoint; start: { x: number; y: number }; moved: boolean } | null>(
    null,
  );
  /** Bumped on every read, so an older answer never replaces a newer one. */
  const reads = useRef(0);

  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      reads.current++;
      drag.current = null;
    },
    [pageId, frame],
  );

  const pointOf = (event: PointerEvent<Element>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const read = (to: PdfPoint, settled: boolean) => {
    const from = drag.current?.from;
    if (!from) return;
    const read = ++reads.current;
    void session.textSelection(pageId, from, to).then(
      ({ rects, text }) => {
        if (read !== reads.current) return;
        select(rects.length > 0 ? { pageId, rects, text, settled } : null);
      },
      () => select(null),
    );
  };

  return {
    onPointerDown: (event: PointerEvent<Element>) => {
      clearTimeout(timer.current);
      reads.current++;
      if (event.button !== 0 || !event.isPrimary) {
        drag.current = null;
        return;
      }
      held.current = false;
      select(null);
      const start = pointOf(event);
      drag.current = { pointerId: event.pointerId, from: screenToPdf(start, frame), start, moved: false };
      if (event.pointerType === "touch") {
        const { from } = drag.current;
        const ticket = reads.current;
        /** @returns Completion of the held word selection. */
        const hold = async () => {
          held.current = true;
          const hit = await pageHit(session, pageId, from);
          if (!hit || hit === "occupied" || ticket !== reads.current) return;
          const word = await selectWord(session, pageId, from, hit);
          if (ticket === reads.current && word.rects.length) select({ ...word, pageId, settled: true });
        };
        timer.current = setTimeout(() => void hold().catch(() => undefined), HOLD_TIME);
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<Element>) => {
      const state = drag.current;
      if (state?.pointerId !== event.pointerId) return;
      const point = pointOf(event);
      if (!state.moved && Math.hypot(point.x - state.start.x, point.y - state.start.y) < SELECT_DISTANCE) return;
      clearTimeout(timer.current);
      if (event.pointerType === "touch" && !held.current) {
        drag.current = null;
        return;
      }
      state.moved = true;
      read(screenToPdf(point, frame), false);
    },
    onPointerUp: (event: PointerEvent<Element>) => {
      const state = drag.current;
      if (state?.pointerId !== event.pointerId) return;
      clearTimeout(timer.current);
      if (state.moved) read(screenToPdf(pointOf(event), frame), true);
      drag.current = null;
      return state.moved || held.current;
    },
    onPointerCancel: () => {
      clearTimeout(timer.current);
      reads.current++;
      drag.current = null;
    },
  };
}
