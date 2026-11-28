import { isTextMarkup, type Annotation, type DocumentSession, type PageTextObject } from "@pdf-editor/core";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";

import type { Tool } from "../../state/annotation-store";

/**
 * @param tool The active page tool.
 * @param mark The annotation under the pointer.
 * @param text The underlying page line, if any.
 * @returns Whether the annotation takes this hit before page text.
 */
export function annotationTakesHit(tool: Tool, mark: Annotation, text: PageTextObject | null): boolean {
  return !(tool === "editText" && text && isTextMarkup(mark));
}

/**
 * Checks the underlying page when a gesture reaches the Select surface. Images in PDF page
 * content count as background and may receive added text; only app-added image annotations block it.
 * @param session The open document.
 * @param pageId The clicked page.
 * @param point The clicked PDF coordinates.
 * @param gesture The tool, receiving outline, and any previous line edit that must finish before the hit test.
 * @returns The text object, "occupied" for another hit, or null for empty space.
 */
export async function pageHit(
  session: DocumentSession,
  pageId: string,
  point: PdfPoint,
  gesture: { tool: Tool; outline?: PageTextObject; pendingCommit?: Promise<void> } = { tool: "select" },
) {
  if (gesture.pendingCommit) {
    await gesture.pendingCommit;
    await session.settled();
  }
  const [marks, fields, text, selection] = await Promise.all([
    session.readAnnotations(pageId),
    session.readFormFields(pageId),
    gesture.outline ?? session.textObjectAt(pageId, point),
    session.textSelection(pageId, point, point),
  ]);
  /** @param item The widget or mark. @returns Whether the click hit its rectangle. */
  function hit({ rect }: { rect: PdfRect }) {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }
  const blocked = marks.some((mark) => hit(mark) && annotationTakesHit(gesture.tool, mark, text));
  if (blocked || fields.some(hit)) return "occupied";
  return text ?? (selection.rects.length ? "occupied" : null);
}

/**
 * @param hit The resolved hit.
 * @param action The target that this gesture can open.
 * @param edit Opens the existing line editor.
 * @param insert Opens the new text box at the clicked position.
 * @returns Nothing.
 */
export function openTextHit(
  hit: Awaited<ReturnType<typeof pageHit>> | undefined,
  action: "line" | "paper" | "either",
  edit: (object: PageTextObject) => void,
  insert: () => void,
) {
  if (hit === null && action !== "line") insert();
  else if (hit && hit !== "occupied" && action !== "paper") edit(hit);
}

/** Movement in CSS pixels that starts a text drag. */
export const SELECT_DISTANCE = 4;
/** Time in milliseconds before a stationary touch selects a word. */
export const HOLD_TIME = 500;

/**
 * @param pointerType The released pointer type.
 * @param distance The displacement from the press in CSS pixels.
 * @param duration The time held in milliseconds.
 * @param selected Whether this press already started a selection.
 * @returns Whether the release should hit-test a line for editing.
 */
export function isEditClick(pointerType: string, distance: number, duration: number, selected: boolean) {
  return !selected && distance < SELECT_DISTANCE && (pointerType !== "touch" || duration < HOLD_TIME);
}
