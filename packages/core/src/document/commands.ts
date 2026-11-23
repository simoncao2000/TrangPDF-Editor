/**
 * Page commands (architecture §6.2). Each one is created from the current content, knows how to apply
 * itself and how to undo itself, and never mutates: both return new content. Undo, redo and the
 * "unsaved changes" state all come from this one pattern.
 */
import type { EngineMethod, EngineParams, EngineResult, Rotation } from "../engine/protocol";
import type { DocumentContent, PageRef, SourceDoc } from "./document-state";

/**
 * How a command reaches the engine. Calls must be sent before the returned promise is awaited, so
 * they reach the worker in the order commands run (the worker handles calls one at a time, in order).
 */
export type CommandEngine = <M extends EngineMethod>(method: M, params: EngineParams<M>) => Promise<EngineResult<M>>;

export interface Command {
  /** Shown in toasts and the undo tooltip, e.g. "Rotate 2 pages". */
  readonly label: string;
  apply(content: DocumentContent): DocumentContent;
  undo(content: DocumentContent): DocumentContent;
  /** Engine work that goes with `apply` (and redo), for edits PDFium holds: annotations, form values. */
  readonly applyInEngine?: (engine: CommandEngine) => Promise<unknown>;
  /** Engine work that goes with `undo`. */
  readonly undoInEngine?: (engine: CommandEngine) => Promise<unknown>;
  /** Releases engine resources retained for undo or redo. */
  readonly dropInEngine?: (engine: CommandEngine) => Promise<unknown>;
}

/**
 * "1 page" or "3 pages".
 * @param count How many pages.
 * @returns The count with the right noun.
 */
export function pagesLabel(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

/**
 * Adds a quarter turn (or several) to a rotation.
 * @param rotation The current rotation.
 * @param degrees A multiple of 90, positive for clockwise.
 * @returns The new rotation in [0, 360).
 */
function turn(rotation: Rotation, degrees: number): Rotation {
  return ((((rotation + degrees) % 360) + 360) % 360) as Rotation;
}

/**
 * Rotates pages. Undo turns them back by the same amount.
 * @param pageIds Pages to rotate.
 * @param degrees 90 (clockwise), -90 (counter-clockwise) or 180.
 * @returns The command.
 */
export function rotatePages(pageIds: readonly string[], degrees: 90 | -90 | 180): Command {
  const ids = new Set(pageIds);
  const rotate = (content: DocumentContent, by: number): DocumentContent => ({
    ...content,
    pages: content.pages.map((page) => (ids.has(page.id) ? { ...page, rotation: turn(page.rotation, by) } : page)),
  });
  return {
    label: `Rotate ${pagesLabel(ids.size)}`,
    apply: (content) => rotate(content, degrees),
    undo: (content) => rotate(content, -degrees),
  };
}

/**
 * Moves pages so the first of them lands at `toIndex`, keeping their relative order. `toIndex` is a
 * position in the list after the moved pages are taken out (0 = start, length = end).
 * @param content The content the move is made from (its order is remembered for undo).
 * @param pageIds Pages to move.
 * @param toIndex Where they go.
 * @returns The command.
 */
export function movePages(content: DocumentContent, pageIds: readonly string[], toIndex: number): Command {
  const ids = new Set(pageIds);
  const before = content.pages.map((page) => page.id);
  const order = (pages: readonly PageRef[], idOrder: readonly string[]): PageRef[] => {
    const byId = new Map(pages.map((page) => [page.id, page]));
    return idOrder.map((id) => byId.get(id)).filter((page): page is PageRef => page !== undefined);
  };
  return {
    label: `Move ${pagesLabel(ids.size)}`,
    apply: (current) => {
      const moving = current.pages.filter((page) => ids.has(page.id));
      const rest = current.pages.filter((page) => !ids.has(page.id));
      const at = Math.max(0, Math.min(toIndex, rest.length));
      return { ...current, pages: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
    },
    undo: (current) => ({ ...current, pages: order(current.pages, before) }),
  };
}

/**
 * Removes pages. The source files stay registered, so undo can put the pages back where they were.
 * @param content The content the pages are removed from (positions are remembered for undo).
 * @param pageIds Pages to delete.
 * @returns The command.
 */
export function deletePages(content: DocumentContent, pageIds: readonly string[]): Command {
  const ids = new Set(pageIds);
  const removed = content.pages.map((page, index) => ({ page, index })).filter(({ page }) => ids.has(page.id));
  return {
    label: `Delete ${pagesLabel(removed.length)}`,
    apply: (current) => ({ ...current, pages: current.pages.filter((page) => !ids.has(page.id)) }),
    undo: (current) => {
      const pages = [...current.pages];
      for (const { page, index } of removed) pages.splice(index, 0, page);
      return { ...current, pages };
    },
  };
}

/**
 * Inserts every page of a newly opened source file at a position (a merge).
 * @param source The source, already opened in the engine.
 * @param atIndex Position in the page list (0 = start).
 * @returns The command.
 */
export function insertPages(source: SourceDoc, atIndex: number): Command {
  const inserted: PageRef[] = Array.from({ length: source.pageCount }, (_, sourceIndex) => ({
    id: `${source.id}:${sourceIndex}`,
    source: source.id,
    sourceIndex,
    rotation: 0,
  }));
  const ids = new Set(inserted.map((page) => page.id));
  return {
    label: `Insert ${pagesLabel(inserted.length)}`,
    apply: (current) => {
      const at = Math.max(0, Math.min(atIndex, current.pages.length));
      return {
        ...current,
        sources: { ...current.sources, [source.id]: source },
        pages: [...current.pages.slice(0, at), ...inserted, ...current.pages.slice(at)],
      };
    },
    undo: (current) => ({ ...current, pages: current.pages.filter((page) => !ids.has(page.id)) }),
  };
}
