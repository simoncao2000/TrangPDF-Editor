import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { createEditorRouter } from "./router";

interface EditorRouterProps {
  readonly history: RouterHistory;
  readonly children: ReactNode;
}

/**
 * Mounts the editor against the application's history.
 * @param props The history and editor tree.
 * @returns The routed editor.
 */
export function EditorRouter({ history, children }: EditorRouterProps) {
  const [router] = useState(() => createEditorRouter(history, children));
  return <RouterProvider router={router} context={{ editor: children }} />;
}
