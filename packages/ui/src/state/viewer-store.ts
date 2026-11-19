/**
 * View state that is not part of the document: zoom and which page the reader is on (Zustand, per the
 * architecture's UI-state choice). The page viewport writes `currentPage`; controls request scrolls.
 */
import { stepZoom, type ZoomMode } from "@pdf-editor/core";
import { create } from "zustand";

/** Reading pages, or organizing them (the page grid with selection, drag, insert, extract). */
export type ViewerMode = "read" | "organize";

export interface ViewerState {
  readonly mode: ViewerMode;
  readonly zoomMode: ZoomMode;
  /** The zoom factor the viewport resolved `zoomMode` to (1 = 100%). */
  readonly zoom: number;
  /** Zero-based index of the page under the reading line. */
  readonly currentPage: number;
  /** A page to scroll to; `nonce` changes so the same page can be requested twice. */
  readonly scrollRequest: { readonly page: number; readonly nonce: number } | null;
  setMode(mode: ViewerMode): void;
  setZoomMode(mode: ZoomMode): void;
  zoomBy(direction: 1 | -1): void;
  reportZoom(zoom: number): void;
  reportCurrentPage(page: number): void;
  goToPage(page: number): void;
  reset(): void;
}

const INITIAL = { mode: "read" as ViewerMode, zoomMode: { kind: "fit-width" } as ZoomMode, zoom: 1, currentPage: 0, scrollRequest: null };

export const useViewer = create<ViewerState>((set, get) => ({
  ...INITIAL,
  setMode: (mode) => set({ mode }),
  setZoomMode: (zoomMode) => set({ zoomMode }),
  zoomBy: (direction) => set({ zoomMode: { kind: "percent", zoom: stepZoom(get().zoom, direction) } }),
  reportZoom: (zoom) => set({ zoom }),
  reportCurrentPage: (currentPage) => {
    if (currentPage !== get().currentPage) set({ currentPage });
  },
  goToPage: (page) => set({ scrollRequest: { page, nonce: (get().scrollRequest?.nonce ?? 0) + 1 } }),
  reset: () => set(INITIAL),
}));
