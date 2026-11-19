/**
 * Commands for the page's own text. The engine never deletes text objects: an edit switches the
 * original off and adds a replacement, and added text is switched off on undo. Undo and redo switch
 * objects on and off by id.
 */
import type { Command } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import { pageEditCommand } from "../document/page-edit-command";
import type { NewTextLine, NewTextStyle, PageTextObject } from "./page-text";

/**
 * Changes the text of one text object on a page.
 * @param content The current content.
 * @param pageId The page.
 * @param object The text object, as the engine reported it.
 * @param text The new text.
 * @returns The command.
 */
export function editPageText(content: DocumentContent, pageId: string, object: PageTextObject, text: string): Command {
  const newId = crypto.randomUUID();
  // The replacement is made the first time the command runs; redo switches it back on. The flag is
  // set when the call is sent, and calls reach the worker in order, so a quick undo still works.
  let made = false;
  return pageEditCommand(
    content,
    pageId,
    "Edit text",
    (engine, at) => {
      if (made) return engine("showPageText", { ...at, show: [newId], hide: [object.id] });
      made = true;
      return engine("replacePageText", { ...at, id: object.id, newId, text });
    },
    (engine, at) => engine("showPageText", { ...at, show: [object.id], hide: [newId] }),
  );
}

/**
 * Adds lines of text to a page, as page text like the rest of the page's text.
 * @param content The current content.
 * @param pageId The page.
 * @param lines The lines, each with where its baseline starts.
 * @param style Size, colour and angle.
 * @returns The command.
 */
export function addPageText(content: DocumentContent, pageId: string, lines: readonly NewTextLine[], style: NewTextStyle): Command {
  const ids = lines.map(() => crypto.randomUUID());
  let made = false;
  return pageEditCommand(
    content,
    pageId,
    "Add text",
    (engine, at) => {
      if (made) return engine("showPageText", { ...at, show: ids, hide: [] });
      made = true;
      return engine("addPageText", { ...at, ...style, lines, ids });
    },
    (engine, at) => engine("showPageText", { ...at, show: [], hide: ids }),
  );
}
