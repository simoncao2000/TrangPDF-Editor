/** The picture the Image tool places next, and how images are resized. View state only. */
import type { ImageFile } from "@pdf-editor/core";
import { create } from "zustand";

/** A picture chosen to place, with its size in pixels. */
export interface PendingImage {
  readonly file: ImageFile;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface ImageToolState {
  readonly pending: PendingImage | null;
  /** Dragging an image's corner keeps its proportions. */
  readonly keepProportions: boolean;
  choose(pending: PendingImage | null): void;
  setKeepProportions(keep: boolean): void;
}

export const useImageTool = create<ImageToolState>((set) => ({
  pending: null,
  keepProportions: true,
  choose: (pending) => set({ pending }),
  setKeepProportions: (keepProportions) => set({ keepProportions }),
}));
