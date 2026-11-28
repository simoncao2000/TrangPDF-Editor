export type ViewerMode = "read" | "organize";
export type ViewZoom = number | "fit-page" | "fit-width";

const PANELS = ["files", "more", "tools", "comments", "fields", "properties", "search", "move-to"] as const;
export type ViewPanel = (typeof PANELS)[number];

export interface ViewSearch {
  readonly mode: ViewerMode;
  readonly page: number;
  readonly zoom: ViewZoom;
  readonly panel?: ViewPanel;
}

export const DEFAULT_VIEW_SEARCH = { mode: "read", page: 1, zoom: "fit-width" } as const;

/**
 * Checks whether the parsed value names an editor panel.
 * @param value The parsed value.
 * @returns Whether the value is a recognized panel.
 */
function isPanel(value: unknown): value is ViewPanel {
  return PANELS.some((panel) => panel === value);
}

/**
 * Validates the root route's parsed query parameters.
 * @param search The untrusted query parameters.
 * @returns The editor view with defaults for absent or invalid values.
 */
export function validateSearch(search: Record<string, unknown>): ViewSearch {
  const { mode, page, zoom, panel } = search;
  const validZoom =
    zoom === "fit-page" || zoom === "fit-width" || (typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0);
  return {
    mode: mode === "organize" ? mode : DEFAULT_VIEW_SEARCH.mode,
    page: typeof page === "number" && Number.isInteger(page) && page >= 1 ? page : DEFAULT_VIEW_SEARCH.page,
    zoom: validZoom ? zoom : DEFAULT_VIEW_SEARCH.zoom,
    ...(isPanel(panel) ? { panel } : {}),
  };
}
