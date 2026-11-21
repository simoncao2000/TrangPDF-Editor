/**
 * The editor's layout: whether the Pages and Properties sidebars are shown, and where the floating
 * tool palette sits and which way it is turned. Remembered between visits (a convenience: if
 * storage is blocked, the default layout is used).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Point } from "../components/shell/tool-placement";

export type ToolOrientation = "vertical" | "horizontal";

export interface LayoutState {
  readonly pagesOpen: boolean;
  readonly propertiesOpen: boolean;
  /** The palette's top-left corner inside the document area, or `null` for its default place. */
  readonly toolPosition: Point | null;
  readonly toolOrientation: ToolOrientation;
  togglePages(): void;
  toggleProperties(): void;
  moveTools(position: Point): void;
  turnTools(): void;
  /** Puts the palette back in its default place, upright. */
  resetTools(): void;
}

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      pagesOpen: true,
      propertiesOpen: true,
      toolPosition: null,
      toolOrientation: "vertical",
      togglePages: () => set((state) => ({ pagesOpen: !state.pagesOpen })),
      toggleProperties: () => set((state) => ({ propertiesOpen: !state.propertiesOpen })),
      moveTools: (toolPosition) => set({ toolPosition }),
      turnTools: () => set((state) => ({ toolOrientation: state.toolOrientation === "vertical" ? "horizontal" : "vertical" })),
      resetTools: () => set({ toolPosition: null, toolOrientation: "vertical" }),
    }),
    {
      name: "trangpdf-layout",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ pagesOpen, propertiesOpen, toolPosition, toolOrientation }) => ({ pagesOpen, propertiesOpen, toolPosition, toolOrientation }),
      // Version 0 stored a docking edge; the palette now floats, so start it in its default place.
      migrate: (persisted) => ({ ...(persisted as object), toolPosition: null, toolOrientation: "vertical" }),
    },
  ),
);
