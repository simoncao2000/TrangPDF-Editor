import {
  addPageText,
  editPageText,
  movePageText,
  type DocumentSession,
  type PageTextObject,
  type TextRun,
  type TextRunLines,
  type TextRunPlacement,
} from "@pdf-editor/core";
import type { PdfPoint } from "@pdf-editor/shared";

/**
 * Records added text only when the draft contains a run with content.
 * @param session The active session.
 * @param pageId The destination page.
 * @param lines The styled paragraphs.
 * @param placement The final baseline and rotation.
 * @returns Nothing.
 */
export function commitAddedText(
  session: DocumentSession,
  pageId: string,
  lines: TextRunLines,
  placement: TextRunPlacement,
) {
  if (lines.some((line) => line.some((run) => run.text.length))) {
    session.dispatch((content) => addPageText(content, pageId, lines, placement));
  }
}

/**
 * Records motion before replacement so undo first restores the original text at its new location.
 * @param session The active session.
 * @param pageId The edited page.
 * @param object The original line.
 * @param draft The changed runs and displacement in PDF units.
 * @returns Nothing.
 */
export function commitPageDraft(
  session: DocumentSession,
  pageId: string,
  object: PageTextObject,
  draft: { runs: readonly TextRun[] | null; delta: PdfPoint },
) {
  const { runs, delta } = draft;
  if (delta.x || delta.y) {
    session.dispatch((content) => movePageText(content, pageId, object, { dx: delta.x, dy: delta.y }));
  }
  if (runs) session.dispatch((content) => editPageText(content, pageId, object, runs));
}
