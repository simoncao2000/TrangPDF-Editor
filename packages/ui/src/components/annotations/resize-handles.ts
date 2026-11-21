/**
 * Corner handles for resizing an annotation on screen. Pure math, so it is easy to test.
 */
import type { ScreenRect } from "@pdf-editor/core";

export type Handle = "nw" | "ne" | "sw" | "se";
export const HANDLES: readonly Handle[] = ["nw", "ne", "sw", "se"];

/** Smallest box a resize can produce, in CSS pixels. */
export const MIN_SIZE = 8;

/**
 * Where a handle sits on a box.
 * @param rect The box.
 * @param handle Which corner.
 * @returns The corner's position.
 */
export function handlePosition(rect: ScreenRect, handle: Handle): { x: number; y: number } {
  return {
    x: handle.endsWith("w") ? rect.left : rect.left + rect.width,
    y: handle.startsWith("n") ? rect.top : rect.top + rect.height,
  };
}

/**
 * The box after dragging one of its corners. The opposite corner stays put; dragging past it flips
 * nothing, the box just stops at the minimum size.
 * @param rect The box when the drag started.
 * @param handle The corner being dragged.
 * @param dx Distance dragged along x, in CSS pixels.
 * @param dy Distance dragged along y, in CSS pixels.
 * @returns The new box.
 */
export function resizeRect(rect: ScreenRect, handle: Handle, dx: number, dy: number): ScreenRect {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const left = handle.endsWith("w") ? Math.min(rect.left + dx, right - MIN_SIZE) : rect.left;
  const top = handle.startsWith("n") ? Math.min(rect.top + dy, bottom - MIN_SIZE) : rect.top;
  const newRight = handle.endsWith("e") ? Math.max(right + dx, left + MIN_SIZE) : right;
  const newBottom = handle.startsWith("s") ? Math.max(bottom + dy, top + MIN_SIZE) : bottom;
  return { left, top, width: newRight - left, height: newBottom - top };
}
