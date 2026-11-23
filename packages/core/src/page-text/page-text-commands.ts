/** Commands for editing, adding and moving the page's own text. */
import type { Command, CommandEngine } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import type { PageAddress } from "../engine/protocol";
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
  const proposed = typeof runs === "string" ? [{ ...style, text: runs }] : runs.filter((run) => run.text);
  let input: { id: string; runs: readonly TextRun[] } | undefined = {
    id: line.id,
    runs: proposed.some(({ text }) => text.trim()) ? proposed : [],
  };
  const editId = crypto.randomUUID();
  let initial: Promise<unknown> | undefined;

  /**
   * Exchanges the versions in worker order, ignoring a queued toggle if the initial edit failed.
   * @param engine Sends the request to the engine.
   * @param at The page address.
   * @param applied Whether the edited version should be visible.
   * @returns The result of the toggle.
   */
  const toggle = (engine: CommandEngine, at: PageAddress, applied: boolean): Promise<unknown> =>
    engine("togglePageTextEdit", { ...at, editId, applied }).catch(async (error: unknown) => {
      try {
        await initial;
      } catch {
        return;
      }
      throw error;
    });

  const command = pageEditCommand(content, pageId, input.runs.length ? "Edit text" : "Delete text", {
    apply: (engine, at) => {
      const pending = input;
      input = undefined;
      if (!pending) return toggle(engine, at, true);
      initial = engine("editPageText", { ...at, ...pending, editId });
      return initial;
    },
    undo: (engine, at) => toggle(engine, at, false),
    drop: (engine, at) => engine("dropPageTextEdit", { ...at, editId }),
  });
  return { ...command, discardOnApplyFailure: true };
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
