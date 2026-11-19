/**
 * Turns the rectangles PDFium reports for a text selection (one per run of characters) into one
 * rectangle per line, which is what a highlight stores.
 */
import type { PdfRect } from "@pdf-editor/shared";

/** Two rectangles are on the same line when they overlap vertically by at least this share. */
const SAME_LINE_OVERLAP = 0.5;

/**
 * How much two rectangles overlap vertically, as a share of the shorter one.
 * @param a A rectangle.
 * @param b Another rectangle.
 * @returns 0 (apart) to 1 (one spans the other).
 */
function verticalOverlap(a: PdfRect, b: PdfRect): number {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const shorter = Math.min(a.height, b.height);
  return shorter <= 0 ? 0 : Math.max(0, overlap) / shorter;
}

/**
 * The smallest rectangle around two rectangles.
 * @param a A rectangle.
 * @param b Another rectangle.
 * @returns Their union.
 */
function union(a: PdfRect, b: PdfRect): PdfRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/**
 * Merges text rectangles that sit on the same line.
 * @param rects Rectangles in reading order, as PDFium reports them.
 * @returns One rectangle per line, top line first.
 */
export function mergeIntoLines(rects: readonly PdfRect[]): PdfRect[] {
  const lines: PdfRect[] = [];
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const index = lines.findIndex((line) => verticalOverlap(line, rect) >= SAME_LINE_OVERLAP);
    if (index === -1) lines.push(rect);
    else lines[index] = union(lines[index]!, rect);
  }
  return lines.sort((a, b) => b.y - a.y);
}
