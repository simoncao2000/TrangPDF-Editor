/**
 * Importing pages from another file, as shared state: the File menu, the command palette and the
 * Organize view start it; the InsertPagesFlow dialog finishes it.
 */
import { useCallback } from "react";
import { create } from "zustand";
import { useDocumentActions, type PagesToInsert } from "./use-document-actions";

export interface InsertFlowState {
  /** A picked file waiting for a position, or `null`. */
  readonly pending: (PagesToInsert & { atEnd?: boolean }) | null;
  set(pending: (PagesToInsert & { atEnd?: boolean }) | null): void;
}

const useInsertFlow = create<InsertFlowState>((set) => ({ pending: null, set: (pending) => set({ pending }) }));

/**
 * Starts importing pages.
 * @param atEnd Whether to default to appending the file.
 * @returns A function that shows the file picker, then asks where the pages go.
 */
export function useStartInsertPages(atEnd = false): () => Promise<void> {
  const actions = useDocumentActions();
  const set = useInsertFlow((state) => state.set);
  return useCallback(async () => {
    const picked = await actions.pickPagesToInsert();
    if (picked) set({ ...picked, atEnd });
  }, [actions, set, atEnd]);
}

/**
 * Whether the position dialog is open (so other shortcuts can stand aside).
 * @returns True while a picked file waits for a position.
 */
export function useInsertPending(): boolean {
  return useInsertFlow((state) => state.pending !== null);
}

/**
 * The picked file waiting for a position, and how to clear it.
 * @returns The pending file and its setter.
 */
export function useInsertFlowState(): InsertFlowState {
  return useInsertFlow();
}
