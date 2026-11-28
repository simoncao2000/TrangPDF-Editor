import { layoutPages, sizesAtWidth, type PageBox } from "@pdf-editor/core";
import type { PageSize } from "@pdf-editor/shared";

export const THUMB_WIDTH = 104;
export const CAPTION_HEIGHT = 26;
export const GAP = 12;

/**
 * @param sizes Displayed page sizes.
 * @returns Virtual boxes including the trailing add button.
 */
export function railLayout(sizes: readonly PageSize[]) {
  const thumbs = sizesAtWidth(sizes, THUMB_WIDTH);
  const last = thumbs.at(-1);
  if (last) thumbs.push(last);
  return layoutPages(thumbs, { gap: GAP, padding: GAP, extraHeight: CAPTION_HEIGHT });
}

/**
 * @param boxes Virtual rows including the add tile.
 * @param y Pointer height in scroll content coordinates.
 * @returns The gap before the first page whose midpoint is below the pointer.
 */
export function pointerGap(boxes: readonly PageBox[], y: number) {
  let low = 0;
  let high = Math.max(0, boxes.length - 1);
  while (low < high) {
    const mid = (low + high) >> 1;
    const box = boxes[mid]!;
    if (y < box.top + box.height / 2) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * @param dx Horizontal travel.
 * @param dy Vertical travel.
 * @returns Whether the pointer has left the click tolerance.
 */
export function startsDrag(dx: number, dy: number) {
  return Math.hypot(dx, dy) >= 5;
}

/**
 * @param count Number of pages.
 * @returns Whether a single page can be deleted.
 */
export function canDeletePage(count: number) {
  return count > 1;
}

/**
 * @param key Pressed key.
 * @param target Current destination, or null before pickup.
 * @param source Focused page.
 * @param count Number of pages.
 * @returns A destination, drop/cancel action, or undefined for an unrelated key.
 */
export function keyboardMove(key: string, target: number | null, source: number, count: number) {
  if (target === null) return key.toLowerCase() === "m" ? source : undefined;
  if (key === "Escape") return "cancel";
  if (key === "Enter" || key.toLowerCase() === "m") return "drop";
  if (key === "ArrowUp" || key === "ArrowLeft") return Math.max(0, target - 1);
  if (key === "ArrowDown" || key === "ArrowRight") return Math.min(count - 1, target + 1);
}

/**
 * @param value Destination entered in the rail menu.
 * @param current Current one-based page number.
 * @param count Number of pages in the document.
 * @returns The final zero-based index, a range error, or null for incomplete or unchanged input.
 */
export function movePosition(value: string, current: number, count: number): number | "range" | null {
  if (!/^-?\d+$/.test(value)) return null;
  const position = Number(value);
  if (position < 1 || position > count) return "range";
  return position === current ? null : position - 1;
}

/**
 * @param order Page IDs in document order after the move.
 * @param moved ID of the thumbnail awaiting focus.
 * @param current Current viewer index.
 * @returns The moved page's new index, or the current index if there is no destination.
 */
export function currentAfterMove(order: readonly string[], moved: string | null, current: number) {
  const destination = moved === null ? -1 : order.indexOf(moved);
  return destination < 0 ? current : destination;
}
