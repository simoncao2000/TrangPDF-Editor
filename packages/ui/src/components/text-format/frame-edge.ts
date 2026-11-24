import type { ScreenPoint } from "@pdf-editor/core";

/**
 * Tests the band on either side of the dashed editing outline.
 * @param box The outline's viewport bounds.
 * @param point The pointer in viewport coordinates.
 * @param pointerType The active pointer device.
 * @returns Whether dragging here should move the frame.
 */
export function onFrameEdge(
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  point: ScreenPoint,
  pointerType: string,
) {
  const zone = pointerType === "touch" ? 12 : 6;
  const distance = Math.min(point.x - box.left, box.right - point.x, point.y - box.top, box.bottom - point.y);
  return Math.abs(distance) <= zone;
}
