/**
 * Commands for the page's own text. The engine never deletes text objects: an edit switches the
 * original off and adds a replacement, and added text is switched off on undo. Undo and redo switch
 * objects on and off by id.
 */
import type { Command } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import {
  legacyTextRuns,
  normalizeTextRuns,
  type NewTextLine,
  type NewTextStyle,
  type PageTextObject,
  type TextRunLines,
  type TextRunPlacement,
} from "./page-text";

/**
 * Changes the text of one text object on a page. Removing all of its text deletes it.
 * @param content The current content.
 * @param pageId The page.
 * @param object The text object, as the engine reported it.
 * @param text The new text.
 * @returns The command.
 */
export function editPageText(content: DocumentContent, pageId: string, object: PageTextObject, text: string): Command {
  if (!text.trim()) {
    return pageEditCommand(content, pageId, "Delete text", {
      apply: (engine, at) => engine("showPageText", { ...at, show: [], hide: [object.id] }),
      undo: (engine, at) => engine("showPageText", { ...at, show: [object.id], hide: [] }),
    });
  }
  const newId = crypto.randomUUID();
  // The replacement is made the first time the command runs; redo switches it back on. The flag is
  // set when the call is sent, and calls reach the worker in order, so a quick undo still works.
  let made = false;
  return pageEditCommand(content, pageId, "Edit text", {
    apply: (engine, at) => {
      if (made) return engine("showPageText", { ...at, show: [newId], hide: [object.id] });
      made = true;
      return engine("replacePageText", { ...at, id: object.id, newId, text });
    },
    undo: (engine, at) => engine("showPageText", { ...at, show: [object.id], hide: [newId] }),
  });
}

/**
 * Adds lines of text to a page, as page text like the rest of the page's text.
 * @param content The current content.
 * @param pageId The page.
 * @param lines Styled runs by paragraph, or legacy text lines with explicit baselines.
 * @param style The block placement, or the legacy style shared across lines.
 * @returns The command.
 */
export function addPageText(
  content: DocumentContent,
  pageId: string,
  lines: readonly NewTextLine[] | TextRunLines,
  style: NewTextStyle | TextRunPlacement,
): Command {
  const styled =
    "origin" in style
      ? normalizeTextRuns(lines as TextRunLines).map((runs) => ({ runs }))
      : legacyTextRuns(lines as readonly NewTextLine[], style);
  const ids = styled.flatMap(({ runs }) =>
    runs.flatMap((run) => Array.from({ length: run.underline ? 2 : 1 }, () => crypto.randomUUID())),
  );
  const origin = "origin" in style ? style.origin : { x: 0, y: 0 };
  let made = false;
  return pageEditCommand(content, pageId, "Add text", {
    apply: (engine, at) => {
      if (made) return engine("showPageText", { ...at, show: ids, hide: [] });
      made = true;
      return engine("addPageText", { ...at, angle: style.angle, fontSize: style.fontSize, origin, runs: styled, ids });
    },
    undo: (engine, at) => engine("showPageText", { ...at, show: [], hide: ids }),
  });
}

/** A distance on the page, in points (positive dy is up). */
export interface PageOffset {
  readonly dx: number;
  readonly dy: number;
}

/**
 * Moves a text object on a page. Undo moves it back.
 * @param content The current content.
 * @param pageId The page.
 * @param object The text object.
 * @param by How far to move it.
 * @returns The command.
 */
export function movePageText(
  content: DocumentContent,
  pageId: string,
  object: PageTextObject,
  by: PageOffset,
): Command {
  const { dx, dy } = by;
  return pageEditCommand(content, pageId, "Move text", {
    apply: (engine, at) => engine("movePageText", { ...at, id: object.id, dx, dy }),
    undo: (engine, at) => engine("movePageText", { ...at, id: object.id, dx: -dx, dy: -dy }),
  });
}
