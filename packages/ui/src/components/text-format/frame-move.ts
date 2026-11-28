import type { ScreenPoint } from "@pdf-editor/core";

/** @param start The pointer-down point. @param current The current pointer point. @returns The pointer displacement. */
export function pointerDelta(start: ScreenPoint, current: ScreenPoint): ScreenPoint {
  return { x: current.x - start.x, y: current.y - start.y };
}

/**
 * Keeps the frame inside its page while applying a pointer displacement.
 * @param initial The frame's translation before the drag.
 * @param delta The pointer displacement.
 * @param box The frame bounds at pointer down.
 * @param page The page bounds.
 * @returns The clamped translation.
 */
export function clampFrameMove(
  initial: ScreenPoint,
  delta: ScreenPoint,
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  page: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): ScreenPoint {
  return {
    x: initial.x + Math.max(page.left - box.left, Math.min(page.right - box.right, delta.x)),
    y: initial.y + Math.max(page.top - box.top, Math.min(page.bottom - box.bottom, delta.y)),
  };
}
