import type { DocumentSession, PageTextObject } from "@pdf-editor/core";
import type { PdfPoint } from "@pdf-editor/shared";

/**
 * Finds each word boundary using the PDF reader's character-level selection geometry.
 * @param session The open PDF.
 * @param pageId The selected page.
 * @param point The clicked character.
 * @param object The line containing the character.
 * @returns The word and its selection rectangles.
 */
export async function selectWord(session: DocumentSession, pageId: string, point: PdfPoint, object: PageTextObject) {
  /** @param end The end of the line to search towards. @returns The furthest point within the word. */
  async function boundary(end: number) {
    let inside = point.x;
    let outside = end;
    while (Math.abs(outside - inside) > 0.25) {
      const x = (inside + outside) / 2;
      const range = await session.textSelection(pageId, point, { x, y: point.y });
      if (/^\S+$/u.test(range.text)) inside = x;
      else outside = x;
    }
    return { x: inside, y: point.y };
  }
  const { x, width } = object.bounds;
  const [from, to] = await Promise.all([boundary(x), boundary(x + width)]);
  return session.textSelection(pageId, from, to);
}
