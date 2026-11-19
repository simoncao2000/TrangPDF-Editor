import { moveAnnotation, pdfRectToScreen, resizeAnnotation, screenDeltaToPdf, screenRectToPdf, type Annotation, type EditableAnnotation, type PageFrame, type ScreenRect } from "@pdf-editor/core";
import { useCallback, useRef, useState, type PointerEvent } from "react";
import { resizeRect, type Handle } from "./resize-handles";

/** A press that moves less than this (CSS pixels) is a click, not a drag. */
const DRAG_THRESHOLD = 3;

interface DragState {
  readonly pointerId: number;
  readonly mode: "move" | Handle;
  readonly startX: number;
  readonly startY: number;
  readonly original: EditableAnnotation;
  readonly originalBox: ScreenRect;
  moved: boolean;
}

export interface AnnotationDrag {
  /** The annotation as it is being dragged, or as committed until the engine's copy arrives. */
  readonly preview: Annotation | null;
  /** Drops the preview (call when a fresh annotation list arrives). */
  clearPreview(): void;
  /**
   * Starts moving or resizing. Call from a pointerdown on the annotation or one of its handles.
   * @param event The pointerdown event; the pointer is captured by its target.
   * @param annotation The annotation to change.
   * @param mode "move", or the corner being dragged.
   */
  start(event: PointerEvent<Element>, annotation: EditableAnnotation, mode: "move" | Handle): void;
  /** Pointer handlers for the layer: they receive the captured pointer's events. */
  readonly handlers: {
    onPointerMove(event: PointerEvent<Element>): void;
    onPointerUp(event: PointerEvent<Element>): void;
    onPointerCancel(event: PointerEvent<Element>): void;
  };
}

/**
 * Drag to move an annotation, or drag a corner to resize it. The annotation follows the pointer
 * at once; `commit` runs once when the pointer is released.
 * @param frame How the page is shown, to turn screen distances into PDF distances.
 * @param commit Records the change (dispatches an edit command).
 * @returns The preview, a start function and the layer's pointer handlers.
 */
export function useAnnotationDrag(frame: PageFrame, commit: (before: EditableAnnotation, after: EditableAnnotation) => void): AnnotationDrag {
  const drag = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<Annotation | null>(null);

  const start = useCallback(
    (event: PointerEvent<Element>, annotation: EditableAnnotation, mode: "move" | Handle) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, original: annotation, originalBox: pdfRectToScreen(annotation.rect, frame), moved: false };
    },
    [frame],
  );

  /** Where the annotation would be for the pointer's current position. */
  const dragged = (state: DragState, event: PointerEvent<Element>): EditableAnnotation => {
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.mode === "move") {
      const delta = screenDeltaToPdf({ x: dx, y: dy }, frame);
      return moveAnnotation(state.original, delta.x, delta.y);
    }
    return resizeAnnotation(state.original, screenRectToPdf(resizeRect(state.originalBox, state.mode, dx, dy), frame));
  };

  const onPointerMove = (event: PointerEvent<Element>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD) return;
    state.moved = true;
    setPreview(dragged(state, event));
  };

  const onPointerUp = (event: PointerEvent<Element>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!state.moved) return;
    const after = dragged(state, event);
    setPreview(after); // shown until the engine's copy arrives
    commit(state.original, after);
  };

  const onPointerCancel = (event: PointerEvent<Element>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
  };

  const clearPreview = useCallback(() => setPreview(null), []);

  return { preview, clearPreview, start, handlers: { onPointerMove, onPointerUp, onPointerCancel } };
}
