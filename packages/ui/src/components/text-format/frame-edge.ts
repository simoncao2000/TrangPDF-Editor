import type { ScreenPoint } from "@pdf-editor/core";

/** Maximum distance inside the frame line that still counts as its edge. */
const FRAME_EDGE_INNER_TOLERANCE = 1;
/** Mouse and pen move band outside the frame line. */
const FRAME_EDGE_OUTER_BAND = 5;
/** Touch move band outside the frame line. */
const TOUCH_FRAME_EDGE_OUTER_BAND = 10;

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
  const outerBand = pointerType === "touch" ? TOUCH_FRAME_EDGE_OUTER_BAND : FRAME_EDGE_OUTER_BAND;
  const edges = [
    { inside: point.x - box.left, outside: box.left - point.x },
    { inside: box.right - point.x, outside: point.x - box.right },
    { inside: point.y - box.top, outside: box.top - point.y },
    { inside: box.bottom - point.y, outside: point.y - box.bottom },
  ];
  return edges.some(({ inside, outside }) =>
    inside >= 0 ? inside <= FRAME_EDGE_INNER_TOLERANCE : outside >= 0 && outside <= outerBand,
  );
}

export const TEXT_FRAME_CLASS = "fill-none stroke-paper-focus";
export const TEXT_FRAME_DASH = "4 3";
