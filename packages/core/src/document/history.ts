/**
 * Undo and redo stacks (architecture §6.2), as immutable values. `execute` applies a command and
 * clears the redo stack; the document is dirty when the newest applied command is not the one that
 * was newest at the last save.
 */
import type { Command } from "./commands";
import type { DocumentContent } from "./document-state";

export interface History {
  readonly undoStack: readonly Command[];
  readonly redoStack: readonly Command[];
  /** The command on top of the undo stack when the file was last saved (`null`: nothing applied). */
  readonly savedTop: Command | null;
}

export const EMPTY_HISTORY: History = { undoStack: [], redoStack: [], savedTop: null };

export interface Step {
  readonly content: DocumentContent;
  readonly history: History;
}

/**
 * Applies a command and records it.
 * @param step Current content and history.
 * @param command The edit.
 * @returns New content and history.
 */
export function execute(step: Step, command: Command): Step {
  return {
    content: command.apply(step.content),
    history: { ...step.history, undoStack: [...step.history.undoStack, command], redoStack: [] },
  };
}

/**
 * Undoes the newest command, if any.
 * @param step Current content and history.
 * @returns The previous content, or `step` unchanged when there is nothing to undo.
 */
export function undo(step: Step): Step {
  const command = step.history.undoStack.at(-1);
  if (!command) return step;
  return {
    content: command.undo(step.content),
    history: { ...step.history, undoStack: step.history.undoStack.slice(0, -1), redoStack: [...step.history.redoStack, command] },
  };
}

/**
 * Re-applies the newest undone command, if any.
 * @param step Current content and history.
 * @returns The next content, or `step` unchanged when there is nothing to redo.
 */
export function redo(step: Step): Step {
  const command = step.history.redoStack.at(-1);
  if (!command) return step;
  return {
    content: command.apply(step.content),
    history: { ...step.history, undoStack: [...step.history.undoStack, command], redoStack: step.history.redoStack.slice(0, -1) },
  };
}

/**
 * Whether the content differs from the last save.
 * @param history The history.
 * @returns True when there are unsaved edits.
 */
export function isDirty(history: History): boolean {
  return (history.undoStack.at(-1) ?? null) !== history.savedTop;
}

/**
 * Records that the current content was saved.
 * @param history The history.
 * @returns The history with the saved point moved here.
 */
export function markSaved(history: History): History {
  return { ...history, savedTop: history.undoStack.at(-1) ?? null };
}
