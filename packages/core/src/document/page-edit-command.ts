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

/** The engine work of a page edit, given the engine and where the page lives in it. */
export interface PageEngineWork {
  /** Work for apply and redo. */
  apply(engine: CommandEngine, at: PageAddress): Promise<unknown>;
  /** Work for undo. */
  undo(engine: CommandEngine, at: PageAddress): Promise<unknown>;
  /** Releases retained PDF objects when the history entry is discarded. */
  drop?(engine: CommandEngine, at: PageAddress): Promise<unknown>;
}

/**
 * Builds a command that changes one page in the engine.
 * @param content The content the command is made from (to find the page and its revision).
 * @param pageId The page.
 * @param label Shown in toasts and the undo tooltip.
 * @param work The engine work for apply (and redo) and for undo.
 * @returns The command.
 */
export function pageEditCommand(
  content: DocumentContent,
  pageId: string,
  label: string,
  work: PageEngineWork,
): Command {
  const at = pageAddressOf(content, pageId);
  if (!at) throw new Error(`Unknown page ${pageId}.`);
  const before = annotationRevisionOf(content, pageId);
  const { drop } = work;
  // Retained-object edits resolve text and font IDs afresh on every history transition.
  const after = ++lastRevision;
  const withRevision = (current: DocumentContent, revision: number): DocumentContent => ({
    ...current,
    annotationRevisions: { ...current.annotationRevisions, [pageId]: revision },
  });
  return {
    label,
    apply: (current) => withRevision(current, drop ? ++lastRevision : after),
    undo: (current) => withRevision(current, drop ? ++lastRevision : before),
    applyInEngine: (engine) => work.apply(engine, at),
    undoInEngine: (engine) => work.undo(engine, at),
    ...(drop && { dropInEngine: (engine: CommandEngine) => drop(engine, at) }),
  };
}
