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
 * Checks the underlying page when a double click reaches the Select surface. Images in PDF page
 * content count as background and may receive added text; only app-added image annotations block it.
 * @param session The open document.
 * @param pageId The clicked page.
 * @param point The clicked PDF coordinates.
 * @param gesture The active tool and the text outline that received the gesture.
 * @returns The text object, "occupied" for another hit, or null for empty space.
 */
export async function pageHit(
  session: DocumentSession,
  pageId: string,
  point: PdfPoint,
  gesture: { tool: Tool; outline?: PageTextObject } = { tool: "select" },
) {
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
 * @param hit The resolved double-click hit.
 * @param edit Opens the existing line editor.
 * @param insert Opens the new text box at the clicked position.
 * @returns Nothing.
 */
export function openTextHit(
  hit: Awaited<ReturnType<typeof pageHit>> | undefined,
  edit: (object: PageTextObject) => void,
  insert: () => void,
) {
  if (hit === null) insert();
  else if (hit && hit !== "occupied") edit(hit);
}
