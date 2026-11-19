import type { DocumentSession, PageRenderer } from "@pdf-editor/core";
import type { FileAdapter } from "@pdf-editor/shared";
import { createContext } from "react";

/** What every app hands to the shared UI. */
export interface EditorServices {
  readonly files: FileAdapter;
  readonly session: DocumentSession;
  readonly renderer: PageRenderer;
}

export const EditorContext = createContext<EditorServices | null>(null);
