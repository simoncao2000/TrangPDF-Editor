import type { DocumentSession } from "@pdf-editor/core";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";

/**
 * Checks the underlying page when a double click reaches the Select surface. Images in PDF page
 * content count as background and may receive added text; only app-added image annotations block it.
 * @param session The open document.
 * @param pageId The clicked page.
 * @param point The clicked PDF coordinates.
 * @returns The text object, "occupied" for another hit, or null for empty space.
 */
export async function pageHit(session: DocumentSession, pageId: string, point: PdfPoint) {
  const [marks, fields, text, selection] = await Promise.all([
    session.readAnnotations(pageId),
    session.readFormFields(pageId),
    session.textObjectAt(pageId, point),
    session.textSelection(pageId, point, point),
  ]);
  /** @param item The widget or mark. @returns Whether the click hit its rectangle. */
  function hit({ rect }: { rect: PdfRect }) {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }
  if (marks.some(hit) || fields.some(hit)) return "occupied";
  return text ?? (selection.rects.length ? "occupied" : null);
}
