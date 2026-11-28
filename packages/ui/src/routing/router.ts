import {
  createRootRouteWithContext,
  createRouter,
  stripSearchParams,
  type RouterHistory,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DEFAULT_VIEW_SEARCH, validateSearch, type ViewSearch } from "./search";

const rootRoute = createRootRouteWithContext<{ editor: ReactNode }>()({
  validateSearch,
  search: { middlewares: [stripSearchParams<ViewSearch>(DEFAULT_VIEW_SEARCH)] },
  component: EditorRoute,
});

/**
 * Renders the editor at the root URL.
 * @returns The editor supplied by the mounting application.
 */
function EditorRoute(): ReactNode {
  return rootRoute.useRouteContext<EditorViewRouter>().editor;
}

/**
 * Creates the editor router with the application's history implementation.
 * @param history The history supplied by the application.
 * @param editor The editor tree rendered at the root.
 * @returns The single-route editor router.
 */
export function createEditorRouter(history: RouterHistory, editor?: ReactNode) {
  return createRouter({ routeTree: rootRoute, history, context: { editor } });
}

type EditorViewRouter = ReturnType<typeof createEditorRouter>;

/**
 * Reads the validated search for the root route.
 * @returns The current editor view search.
 */
export function useViewSearch(): ViewSearch {
  return rootRoute.useSearch<EditorViewRouter>();
}
