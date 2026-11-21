/** Where the floating tool palette may sit. Pure, so it is easy to test. */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Space kept between the palette and the edges of the document area, in CSS pixels. */
export const PLACEMENT_MARGIN = 12;

/**
 * Keeps the palette fully inside the document area, so it never goes missing when the window
 * shrinks or the sidebars open.
 * @param position Where the palette's top-left corner wants to be, inside the area.
 * @param palette The palette's size.
 * @param area The document area's size.
 * @returns The nearest position that keeps the whole palette in view (top-left wins when the area is
 *   smaller than the palette).
 */
export function placeInside(position: Point, palette: Size, area: Size): Point {
  const maxX = Math.max(PLACEMENT_MARGIN, area.width - palette.width - PLACEMENT_MARGIN);
  const maxY = Math.max(PLACEMENT_MARGIN, area.height - palette.height - PLACEMENT_MARGIN);
  return {
    x: Math.min(Math.max(position.x, PLACEMENT_MARGIN), maxX),
    y: Math.min(Math.max(position.y, PLACEMENT_MARGIN), maxY),
  };
}
