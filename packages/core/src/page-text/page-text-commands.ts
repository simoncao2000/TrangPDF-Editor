/** Commands for editing, adding and moving the page's own text. */
import type { Command } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import {
  legacyTextRuns,
  normalizeTextRuns,
  type TextRun,
  type NewTextLine,
  type NewTextStyle,
  type PageTextObject,
  type TextRunLines,
  type TextRunPlacement,
} from "./page-text";

/**
 * Replaces a line in a single history step.
 * @param content The current content.
 * @param pageId The page.
 * @param line The line reported by the engine.
 * @param runs The new runs, or plain text from the legacy editor.
 * @returns The command.
 */
export function editPageText(
  content: DocumentContent,
  pageId: string,
  line: PageTextObject,
  runs: readonly TextRun[] | string,
): Command {
  const style =
    line.runs?.[0] ??
    ({
      fontFamily: line.style.family === "serif" ? "Times" : line.style.family === "mono" ? "Courier" : "Helvetica",
      fontSize: line.fontSize,
      color: line.color,
      bold: line.style.bold,
      italic: line.style.italic,
      underline: false,
    } satisfies Omit<TextRun, "text">);
  let input: { id: string; runs: readonly TextRun[] } | undefined = {
    id: line.id,
    runs: typeof runs === "string" ? [{ ...style, text: runs }] : runs.filter((run) => run.text),
  };
  if (!input.runs.some(({ text }) => text.trim())) input.runs = [];
  const editId = crypto.randomUUID();
  return pageEditCommand(content, pageId, input.runs.length ? "Edit text" : "Delete text", {
    apply: (engine, at) => {
      const pending = input;
      input = undefined;
      return pending
        ? engine("editPageText", { ...at, ...pending, editId })
        : engine("togglePageTextEdit", { ...at, editId, applied: true });
    },
    undo: (engine, at) => engine("togglePageTextEdit", { ...at, editId, applied: false }),
    drop: (engine, at) => engine("dropPageTextEdit", { ...at, editId }),
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
