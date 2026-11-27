/** A document subset that exposes the browser caret lookup APIs. */
export interface CaretPointDocument {
  /** @param x The client x coordinate. @param y The client y coordinate. @returns The caret position, if available. */
  caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  /** @param x The client x coordinate. @param y The client y coordinate. @returns The caret range, if available. */
  caretRangeFromPoint?(x: number, y: number): Range | null;
}

/** The result of mapping a client point into an editor root. */
export type CaretAtPoint =
  | { readonly kind: "point"; readonly node: Node; readonly offset: number }
  | { readonly kind: "start" }
  | { readonly kind: "end" }
  | null;

/** A collapsed text selection at a DOM-derived offset. */
export interface CollapsedTextSelection {
  readonly anchorOffset: number;
  readonly focusOffset: number;
}

/** Clamps a DOM caret offset and returns equal offsets for a collapsed selection. */
/**
 * @param offset The caret offset from the DOM.
 * @param textLength The Lexical text node length.
 * @returns Equal, clamped anchor and focus offsets.
 */
export function collapsedTextSelection(offset: number, textLength: number): CollapsedTextSelection {
  const caretOffset = Math.min(offset, textLength);
  return { anchorOffset: caretOffset, focusOffset: caretOffset };
}

/** Maps a client point to a DOM caret position or an editor boundary. */
/**
 * @param source The document-like object with caret lookup functions.
 * @param root The editor root element.
 * @param point The client point to map.
 * @returns The text position, a boundary clamp, or null when unavailable.
 */
export function caretAtPoint(
  source: CaretPointDocument,
  root: HTMLElement,
  point: { readonly x: number; readonly y: number },
): CaretAtPoint {
  const position = source.caretPositionFromPoint?.(point.x, point.y);
  const range = !position ? source.caretRangeFromPoint?.(point.x, point.y) : null;
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;
  if (node && offset !== undefined && root.contains(node)) return { kind: "point", node, offset };

  if (!source.caretPositionFromPoint && !source.caretRangeFromPoint) return null;
  if (node && root.contains(node)) return null;

  const rect = root.getBoundingClientRect();
  if (point.x <= rect.left) return { kind: "start" };
  if (point.x >= rect.right) return { kind: "end" };
  return null;
}
