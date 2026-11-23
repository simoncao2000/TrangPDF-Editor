import type { DocumentSession, PageRenderer, Workspace } from "@pdf-editor/core";
import type { FileAdapter, FontFileStore } from "@pdf-editor/shared";
import { createContext } from "react";

/** What every app hands to the shared UI. */
export interface EditorServices {
  readonly files: FileAdapter;
  readonly fontFiles?: FontFileStore;
  /** The open documents, one per tab. */
  readonly workspace: Workspace;
  readonly renderer: PageRenderer;
}

/** The services plus the session of the tab in front, which most components work with. */
export interface EditorContextValue extends EditorServices {
  readonly session: DocumentSession;
}

export const EditorContext = createContext<EditorContextValue | null>(null);
