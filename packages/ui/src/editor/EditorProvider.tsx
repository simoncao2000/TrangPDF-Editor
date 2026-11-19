/**
 * Hands the platform's FileAdapter, the document session and the page renderer to every component.
 * The UI gets these from here and never imports `@pdf-editor/platform` (architecture §5).
 */
import type { ReactNode } from "react";
import { EditorContext, type EditorServices } from "./context";

interface EditorProviderProps {
  readonly services: EditorServices;
  readonly children: ReactNode;
}

/**
 * Makes the editor services available below it. Each app (web, desktop, mobile) renders one.
 * @param props The services and the app tree.
 * @returns The provider.
 */
export function EditorProvider({ services, children }: EditorProviderProps) {
  return <EditorContext.Provider value={services}>{children}</EditorContext.Provider>;
}
