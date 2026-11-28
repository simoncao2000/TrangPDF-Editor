import { useCallback } from "react";
import { create } from "zustand";
import { useOpenPanel } from "../routing/hooks";

/** The text to start with when the URL opens the palette. */
export const usePaletteQuery = create<{ readonly initialQuery: string }>(() => ({ initialQuery: "" }));

/**
 * Opens the command palette with an optional starting query.
 * @returns The palette opener.
 */
export function useShowPalette() {
  const { openPanel } = useOpenPanel();

  /**
   * Seeds the next palette and opens its panel.
   * @param initialQuery Text to put in the input.
   * @returns Nothing.
   */
  const show = useCallback(
    (initialQuery = "") => {
      usePaletteQuery.setState({ initialQuery });
      openPanel("search");
    },
    [openPanel],
  );
  return show;
}
