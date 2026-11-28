/**
 * The three ways to open a file (picker, drop, recent list). Each file opens in a tab of its own
 * (or brings its tab to the front if it is already open). Records successful opens in the
 * platform's recent list.
 */
import type { OpenedFile, OpenErrorKind } from "@pdf-editor/shared";
import { useCallback } from "react";
import { create } from "zustand";
import { useEditorServices } from "./hooks";

interface FileErrorState {
  /** A platform-level failure (the file could not be read), shown before the session is involved. */
  readonly error: { readonly kind: OpenErrorKind; readonly fileName: string | null } | null;
  readonly set: (error: FileErrorState["error"]) => void;
}

/** Platform read errors live outside the document session, which only sees files that were read. */
export const useFileError = create<FileErrorState>((set) => ({ error: null, set: (error) => set({ error }) }));

export interface FileOpener {
  /** Shows the file picker and opens the choice. */
  openFromPicker(): Promise<void>;
  /** Opens the first PDF in a drop. */
  openFromDrop(transfer: DataTransfer): Promise<void>;
  /** Reopens a recent file. */
  openRecent(id: string, name: string): Promise<void>;
}

/**
 * Builds the open actions for the current editor.
 * @returns Stable callbacks for each way of opening a file.
 */
export function useFileOpener(): FileOpener {
  const { files, workspace } = useEditorServices();
  const setError = useFileError((state) => state.set);

  const load = useCallback(
    async (read: () => Promise<OpenedFile | null>, fallbackName: string | null) => {
      let file: OpenedFile | null;
      try {
        file = await read();
      } catch {
        setError({ kind: "unreadable", fileName: fallbackName });
        return;
      }
      if (!file) return;
      setError(null);
      const tab = await workspace.open(file);
      const state = tab.session.store.getState();
      if (state.status === "clean") await files.rememberOpened(file, state.pages.length);
    },
    [files, workspace, setError],
  );

  return {
    openFromPicker: useCallback(() => load(() => files.open(), null), [files, load]),
    // The drop is read at once: it is only valid during the event.
    openFromDrop: useCallback((transfer: DataTransfer) => load(() => files.openDropped(transfer), null), [files, load]),
    openRecent: useCallback(
      async (id: string, name: string) => {
        await load(async () => {
          const file = await files.openRecent(id);
          if (!file) throw new Error("Recent file is gone or access was denied.");
          return file;
        }, name);
      },
      [files, load],
    ),
  };
}
