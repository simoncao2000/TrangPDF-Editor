/**
 * Hands the platform's FileAdapter, the workspace, the active tab's session and the page renderer to
 * every component. The UI gets these from here and never imports `@pdf-editor/platform`
 * (architecture §5).
 */
import { useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { EditorContext, type EditorServices } from "./context";
import { useTabViewMemory } from "./tab-view-memory";

interface EditorProviderProps {
  readonly services: EditorServices;
  readonly children: ReactNode;
}

/**
 * Makes the editor services available below it. Each app (web, desktop, mobile) renders one.
 * Switching tabs swaps the session every component reads, and restores that tab's view.
 * @param props The services and the app tree.
 * @returns The provider.
 */
export function EditorProvider({ services, children }: EditorProviderProps) {
  const activeId = useStore(services.workspace.store, (state) => state.activeId);
  const value = useMemo(() => ({ ...services, session: services.workspace.activeSession() }), [services, activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useTabViewMemory(activeId);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
