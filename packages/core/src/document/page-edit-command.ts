/**
 * Commands for edits PDFium holds (annotations, page text, form values; architecture §6.1). Each
 * one gives the page a new revision in the content, so its picture is redrawn, and does the real
 * work in the engine.
 */
import type { PageAddress } from "../engine/protocol";
import type { Command, CommandEngine } from "./commands";
import { annotationRevisionOf, type DocumentContent, pageAddressOf } from "./document-state";

/** Revision tokens only ever grow, so an old token is never reused for a different state. */
let lastRevision = 0;

/**
 * Builds a command that changes one page in the engine.
 * @param content The content the command is made from (to find the page and its revision).
 * @param pageId The page.
 * @param label Shown in toasts and the undo tooltip.
 * @param applyInEngine Engine work for apply and redo.
 * @param undoInEngine Engine work for undo.
 * @returns The command.
 */
export function pageEditCommand(
  content: DocumentContent,
  pageId: string,
  label: string,
  applyInEngine: (engine: CommandEngine, at: PageAddress) => Promise<unknown>,
  undoInEngine: (engine: CommandEngine, at: PageAddress) => Promise<unknown>,
): Command {
  const at = pageAddressOf(content, pageId);
  if (!at) throw new Error(`Unknown page ${pageId}.`);
  const before = annotationRevisionOf(content, pageId);
  const after = ++lastRevision;
  const withRevision = (current: DocumentContent, revision: number): DocumentContent => ({
    ...current,
    annotationRevisions: { ...current.annotationRevisions, [pageId]: revision },
  });
  return {
    label,
    apply: (current) => withRevision(current, after),
    undo: (current) => withRevision(current, before),
    applyInEngine: (engine) => applyInEngine(engine, at),
    undoInEngine: (engine) => undoInEngine(engine, at),
  };
}
