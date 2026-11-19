/**
 * Every edit and save the UI offers, in one place: runs the command through the session, confirms it
 * with a toast (with Undo), and gets save targets from the FileAdapter at click time.
 */
import { deletePages, insertPages, movePages, pagesLabel, rotatePages } from "@pdf-editor/core";
import type { SaveTarget } from "@pdf-editor/shared";
import { useCallback, useMemo } from "react";
import { useToast } from "../state/toast-store";
import { baseName, describePages } from "./file-names";
import { useEditorServices } from "./hooks";
import { useLeaveGuard } from "./leave-guard";

/** A file chosen for insertion, opened and waiting for a position. */
export interface PagesToInsert {
  readonly name: string;
  readonly pageCount: number;
  insert(atIndex: number): void;
  /** Lets go of the file when the user cancels. */
  cancel(): void;
}

export interface DocumentActions {
  undo(): void;
  redo(): void;
  rotate(pageIds: readonly string[], degrees: 90 | -90): void;
  remove(pageIds: readonly string[]): void;
  /** Moves pages so the first lands at `toIndex` (a position among the pages that are not moving). */
  move(pageIds: readonly string[], toIndex: number): void;
  /** Picks a PDF and opens it as a source; resolves its page count, or `null` if nothing was added. */
  pickPagesToInsert(): Promise<PagesToInsert | null>;
  /** Saves the selected pages as a new file. */
  extract(pageIds: readonly string[]): Promise<void>;
  /** Saves in place when possible, otherwise asks where. Resolves true when saved. */
  save(): Promise<boolean>;
  /** Always asks where to save. Resolves true when saved. */
  saveAs(): Promise<boolean>;
  /** Runs `action` now, or after the user decides about unsaved changes. */
  guardUnsaved(action: () => void): void;
}

/**
 * Builds the document actions for the current editor.
 * @returns Stable action functions.
 */
export function useDocumentActions(): DocumentActions {
  const { session, files } = useEditorServices();
  const show = useToast((state) => state.show);
  const ask = useLeaveGuard((state) => state.ask);

  const undoNow = useCallback(() => {
    const label = session.store.getState().undoLabel;
    session.undo();
    if (label) show(`Undone: ${label.toLowerCase()}`, { action: { label: "Redo", run: () => session.redo() } });
  }, [session, show]);

  const redoNow = useCallback(() => {
    const label = session.store.getState().redoLabel;
    session.redo();
    if (label) show(`Redone: ${label.toLowerCase()}`, { action: { label: "Undo", run: () => session.undo() } });
  }, [session, show]);

  /** Page numbers (1-based) of page ids in the current order. */
  const numbersOf = useCallback(
    (pageIds: readonly string[]) => {
      const wanted = new Set(pageIds);
      return session.store
        .getState()
        .pages.map((page, index) => (wanted.has(page.id) ? index + 1 : 0))
        .filter((n) => n > 0);
    },
    [session],
  );

  const confirm = useCallback((message: string) => show(message, { action: { label: "Undo", run: () => session.undo() } }), [session, show]);

  const writeWith = useCallback(
    async (getTarget: () => Promise<SaveTarget | null>) => {
      let target;
      try {
        target = await getTarget();
      } catch {
        show("Couldn’t open a place to save the file.", { tone: "error" });
        return false;
      }
      if (!target) return false;
      const result = await session.save((bytes) => target.write(bytes));
      if (result.saved) show(`Saved ${result.file.name}`);
      else if (result.reason === "build-failed") show("The PDF couldn’t be built, so nothing was written. Your changes are still open.", { tone: "error" });
      else if (result.reason === "write-failed") show("Couldn’t write the file. Your changes are still open; try Save as.", { tone: "error" });
      return result.saved;
    },
    [session, show],
  );

  const saveAs = useCallback(() => {
    const name = session.store.getState().fileName ?? "Document.pdf";
    return writeWith(() => files.pickSaveTarget(name));
  }, [files, session, writeWith]);

  const save = useCallback(async () => {
    const { fileId } = session.store.getState();
    const inPlace = fileId ? await files.saveTarget(fileId).catch(() => null) : null;
    return inPlace ? writeWith(async () => inPlace) : saveAs();
  }, [files, session, saveAs, writeWith]);

  return useMemo<DocumentActions>(
    () => ({
      undo: undoNow,
      redo: redoNow,
      rotate(pageIds, degrees) {
        session.dispatch(rotatePages(pageIds, degrees));
        confirm(`Rotated ${describePages(numbersOf(pageIds))}`);
      },
      remove(pageIds) {
        const numbers = numbersOf(pageIds);
        session.dispatch((content) => deletePages(content, pageIds));
        confirm(`Deleted ${describePages(numbers)}`);
      },
      move(pageIds, toIndex) {
        session.dispatch((content) => movePages(content, pageIds, toIndex));
        confirm(`Moved ${pagesLabel(pageIds.length)}`);
      },
      async pickPagesToInsert() {
        const file = await files.open().catch(() => null);
        if (!file) return null;
        const imported = await session.importSource(file);
        if (!imported.ok) {
          const reason = imported.error === "password-required" ? "it has a password. Remove the password and try again" : "it isn’t a PDF that can be read";
          show(`Couldn’t insert ${file.name}: ${reason}.`, { tone: "error" });
          return null;
        }
        const source = imported.value;
        return {
          name: source.name,
          pageCount: source.pageCount,
          insert: (atIndex) => {
            session.dispatch(insertPages(source, atIndex));
            confirm(`Inserted ${pagesLabel(source.pageCount)} from ${source.name}`);
          },
          cancel: () => void session.releaseSource(source),
        };
      },
      async extract(pageIds) {
        const numbers = numbersOf(pageIds);
        const name = `${baseName(session.store.getState().fileName ?? "Document")} (${describePages(numbers)}).pdf`;
        let target;
        try {
          target = await files.pickSaveTarget(name);
        } catch {
          target = null;
        }
        if (!target) return;
        try {
          const saved = await target.write(await session.buildPdf(pageIds));
          show(`Saved ${saved.name}`);
        } catch {
          show("Couldn’t save the extracted pages.", { tone: "error" });
        }
      },
      save,
      saveAs,
      guardUnsaved(action) {
        if (session.store.getState().status === "dirty") ask(action);
        else action();
      },
    }),
    [undoNow, redoNow, session, confirm, numbersOf, files, show, save, saveAs, ask],
  );
}
