/**
 * Vertical layout of a page list, and which pages fall inside the viewport. Used by the page
 * viewport and the thumbnail list to render only what is visible (architecture §8.1).
 */
import type { PageSize } from "@pdf-editor/shared";
import type { Size } from "./zoom";

/** Where one page sits in the scroll area, in CSS pixels. */
export interface PageBox {
  readonly index: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PageLayout {
  readonly boxes: readonly PageBox[];
  /** Height of the whole scroll area, including padding. */
  readonly totalHeight: number;
  /** Width of the widest box. */
  readonly maxWidth: number;
}

export interface LayoutOptions {
  /** Space between boxes. */
  readonly gap: number;
  /** Space above the first and below the last box. */
  readonly padding: number;
  /** Extra height under each box (e.g. a thumbnail caption). */
  readonly extraHeight?: number;
}

/**
 * Stacks pages top to bottom.
 * @param sizes On-screen size of each page, in order.
 * @param options Gap, padding and per-box extra height.
 * @returns Each page's box, the total height and the widest width.
 */
export function layoutPages(sizes: readonly Size[], options: LayoutOptions): PageLayout {
  const extra = options.extraHeight ?? 0;
  let top = options.padding;
  let maxWidth = 0;
  const boxes = sizes.map((size, index) => {
    const box = { index, top, width: size.width, height: size.height + extra };
    top += box.height + options.gap;
    maxWidth = Math.max(maxWidth, size.width);
    return box;
  });
  const totalHeight = boxes.length ? top - options.gap + options.padding : options.padding * 2;
  return { boxes, totalHeight, maxWidth };
}

/**
 * Scales each page to a fixed width (used for thumbnails).
 * @param pages Page sizes in points.
 * @param width Target width in CSS pixels.
 * @returns On-screen sizes with the same aspect ratios.
 */
export function sizesAtWidth(pages: readonly PageSize[], width: number): Size[] {
  return pages.map((page) => ({ width, height: (page.height / page.width) * width }));
}

/**
 * Finds the first box whose bottom edge is below `y` (binary search; boxes are sorted by `top`).
 * @param boxes Boxes from `layoutPages`.
 * @param y A scroll offset.
 * @returns An index into `boxes`, or `boxes.length` if `y` is past the end.
 */
function firstBoxEndingAfter(boxes: readonly PageBox[], y: number): number {
  let low = 0;
  let high = boxes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const box = boxes[middle]!;
    if (box.top + box.height <= y) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Pages to render for a scroll position: the visible ones plus `overscan` on each side.
 * @param layout The page layout.
 * @param scrollTop Scroll offset of the viewport.
 * @param viewportHeight Height of the viewport.
 * @param overscan Extra pages above and below (architecture §8.1 uses 1).
 * @returns Inclusive first and last indexes, or `null` when there are no pages.
 */
export function visibleRange(
  layout: PageLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 1,
): { first: number; last: number } | null {
  const { boxes } = layout;
  if (boxes.length === 0) return null;
  const first = Math.min(firstBoxEndingAfter(boxes, scrollTop), boxes.length - 1);
  let last = first;
  while (last + 1 < boxes.length && boxes[last + 1]!.top < scrollTop + viewportHeight) last++;
  return { first: Math.max(0, first - overscan), last: Math.min(boxes.length - 1, last + overscan) };
}

/**
 * The page the reader is on: the one covering the line 40% down the viewport.
 * @param layout The page layout.
 * @param scrollTop Scroll offset of the viewport.
 * @param viewportHeight Height of the viewport.
 * @returns A page index, or 0 when there are no pages.
 */
export function currentPageIndex(layout: PageLayout, scrollTop: number, viewportHeight: number): number {
  const { boxes } = layout;
  if (boxes.length === 0) return 0;
  return Math.min(firstBoxEndingAfter(boxes, scrollTop + viewportHeight * 0.4), boxes.length - 1);
}
