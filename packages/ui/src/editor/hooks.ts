import type { DocumentState } from "@pdf-editor/core";
import { useContext } from "react";
import { useStore } from "zustand";
import { EditorContext, type EditorServices } from "./context";

/**
 * Reads the editor services.
 * @returns The FileAdapter, session and renderer.
 */
export function useEditorServices(): EditorServices {
  const services = useContext(EditorContext);
  if (!services) throw new Error("useEditorServices must be used inside <EditorProvider>.");
  return services;
}

/**
 * Subscribes to part of the document state; re-renders only when that part changes.
 * @param selector Picks the value the component needs.
 * @returns The selected value.
 */
export function useDocument<T>(selector: (state: DocumentState) => T): T {
  return useStore(useEditorServices().session.store, selector);
}
