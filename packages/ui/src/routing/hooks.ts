import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { useViewSearch } from "./router";
import type { ViewerMode, ViewPanel } from "./search";
import { closeViewPanel, openViewPanel, setViewMode } from "./view-history";

/**
 * Reads and changes the editor mode in the URL.
 * @returns The current mode and a setter that pushes a history entry.
 */
export function useViewMode() {
  const { history } = useRouter();
  const { mode } = useViewSearch();
  const setMode = useCallback((next: ViewerMode) => setViewMode(history, next), [history]);
  return { mode, setMode };
}

/**
 * Reads and changes the current URL-backed panel.
 * @returns The current panel and its open and close functions.
 */
export function useOpenPanel() {
  const { history } = useRouter();
  const { panel } = useViewSearch();
  const openPanel = useCallback((next: ViewPanel) => openViewPanel(history, next), [history]);
  const closePanel = useCallback((after?: () => void) => closeViewPanel(history, after), [history]);
  return { panel, openPanel, closePanel };
}
