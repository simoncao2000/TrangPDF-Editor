/** Responsive copy used by the command palette search field. */
export interface PalettePresentation {
  readonly placeholder: string;
  readonly showHint: boolean;
}

/**
 * Chooses placeholder and hint visibility for the available palette width.
 * @param narrow Whether the palette is displayed in its phone layout.
 * @returns The search placeholder and whether to show the desktop hint row.
 */
export function palettePresentation(narrow: boolean): PalettePresentation {
  return {
    placeholder: narrow ? "Search this file" : "Search text and files · > for commands · :page",
    showHint: !narrow,
  };
}
