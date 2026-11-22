/**
 * Page text the reader selected with the Select tool: one selection in the whole document, as in
 * any reader. View state only; copying and marking it go through the menu or Ctrl/Cmd+C.
 */
import type { PdfRect } from "@pdf-editor/shared";
import { create } from "zustand";

export interface PageTextSelection {
  readonly pageId: string;
  /** One rectangle per line, in PDF space. */
  readonly rects: readonly PdfRect[];
  readonly text: string;
  /** False while the pointer is still dragging (the menu waits until it is let go). */
  readonly settled: boolean;
}

export interface TextSelectionState {
  readonly selection: PageTextSelection | null;
  select(selection: PageTextSelection | null): void;
}

export const useTextSelection = create<TextSelectionState>((set) => ({
  selection: null,
  select: (selection) => set({ selection }),
}));
