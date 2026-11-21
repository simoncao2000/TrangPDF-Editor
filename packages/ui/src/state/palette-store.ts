/** Whether the command palette is open, and what it opens with (e.g. ">" for commands). */
import { create } from "zustand";

export interface PaletteState {
  readonly open: boolean;
  /** Text the palette starts with when opened. */
  readonly initialQuery: string;
  show(initialQuery?: string): void;
  hide(): void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  initialQuery: "",
  show: (initialQuery = "") => set({ open: true, initialQuery }),
  hide: () => set({ open: false }),
}));
