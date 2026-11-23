import { useRouter, type RouterHistory } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { useEditorServices } from "../editor/hooks";
import { useViewer } from "../state/viewer-store";
import { DEFAULT_VIEW_SEARCH } from "./search";
import { readView, writeView } from "./view-history";

/**
 * Mirrors the active tab's reader state and clears the URL when there is no document.
 * @returns Nothing.
 */
export function useViewUrl(): void {
  const { workspace } = useEditorServices();
  const { history }: { history: RouterHistory } = useRouter();

  useLayoutEffect(() => {
    /**
     * Replaces the current entry using the reader store's page and zoom.
     * @returns Nothing.
     */
    function mirrorReader() {
      if (!workspace.store.getState().activeId) {
        writeView(history, DEFAULT_VIEW_SEARCH, true);
        return;
      }
      const { currentPage, zoomMode } = useViewer.getState();
      const zoom = zoomMode.kind === "percent" ? zoomMode.zoom : zoomMode.kind;
      writeView(history, { ...readView(history), page: currentPage + 1, zoom }, true);
    }

    const stopHistory = history.subscribe(({ action }) => {
      if (action.type !== "REPLACE") mirrorReader();
    });
    const stopViewer = useViewer.subscribe((state, previous) => {
      if (state.currentPage !== previous.currentPage || state.zoomMode !== previous.zoomMode) mirrorReader();
    });
    const stopWorkspace = workspace.store.subscribe((state, previous) => {
      if (!state.activeId) writeView(history, DEFAULT_VIEW_SEARCH, true);
      else if (!previous.tabs.some((tab) => tab.id === state.activeId)) {
        writeView(history, DEFAULT_VIEW_SEARCH, true);
      }
    });
    mirrorReader();

    return () => {
      stopHistory();
      stopViewer();
      stopWorkspace();
    };
  }, [history, workspace]);
}
