import {
  defaultParseSearch,
  defaultStringifySearch,
  type HistoryState,
  type RouterHistory,
} from "@tanstack/react-router";
import { DEFAULT_VIEW_SEARCH, validateSearch, type ViewerMode, type ViewPanel, type ViewSearch } from "./search";

interface EditorHistoryState extends HistoryState {
  readonly editorPanelEntry?: boolean;
}

const closingPanels = new WeakSet<RouterHistory>();

/**
 * Reads the latest URL, including writes that have yet to reach React.
 * @param history The editor history.
 * @returns The validated view search.
 */
export function readView(history: RouterHistory): ViewSearch {
  return validateSearch(defaultParseSearch(history.location.search));
}

/**
 * Writes a view, omitting default values and unknown parameters.
 * @param history The editor history.
 * @param view The next view.
 * @param replace Whether to update the current entry.
 * @returns Nothing.
 */
export function writeView(history: RouterHistory, view: ViewSearch, replace: boolean): void {
  const { pathname, href, hash, state } = history.location;
  const { mode, page, zoom, panel } = view;
  const search = defaultStringifySearch({
    mode: mode === DEFAULT_VIEW_SEARCH.mode ? undefined : mode,
    page: page === DEFAULT_VIEW_SEARCH.page ? undefined : page,
    zoom: zoom === DEFAULT_VIEW_SEARCH.zoom ? undefined : zoom,
    panel,
  });
  const next = pathname + search + hash;
  if (next === href) return;
  const editorPanelEntry = Boolean(panel) && (!replace || (state as EditorHistoryState).editorPanelEntry);
  if (replace) history.replace(next, { ...state, editorPanelEntry });
  else {
    history.flush();
    history.push(next, { editorPanelEntry });
  }
}

/**
 * Changes reading or organizing mode.
 * @param history The editor history.
 * @param mode The mode to enter.
 * @returns Nothing.
 */
export function setViewMode(history: RouterHistory, mode: ViewerMode): void {
  const view = readView(history);
  if (mode !== view.mode) writeView(history, { ...view, mode }, false);
}

/**
 * Opens a panel above the editor view, replacing any previous panel in the Back sequence.
 * @param history The editor history.
 * @param panel The panel to show.
 * @returns Nothing.
 */
export function openViewPanel(history: RouterHistory, panel: ViewPanel): void {
  const view = readView(history);
  if (panel === view.panel) return;
  if (view.panel) closeViewPanel(history, () => writeView(history, { ...readView(history), panel }, false));
  else writeView(history, { ...view, panel }, false);
}

/**
 * Dismisses a panel and optionally runs an action once history has returned to the editor.
 * @param history The editor history.
 * @param after An action to run after dismissal.
 * @returns Nothing.
 */
export function closeViewPanel(history: RouterHistory, after?: () => void): void {
  const view = readView(history);
  const { editorPanelEntry } = history.location.state as EditorHistoryState;
  if (!view.panel || !editorPanelEntry || !history.canGoBack()) {
    if (view.panel) {
      const { mode, page, zoom } = view;
      writeView(history, { mode, page, zoom }, true);
    }
    after?.();
    return;
  }

  if (closingPanels.has(history)) return;
  closingPanels.add(history);
  const unsubscribe = history.subscribe(({ action }) => {
    if (action.type !== "BACK") return;
    unsubscribe();
    closingPanels.delete(history);
    after?.();
  });
  history.flush();
  history.back();
}
