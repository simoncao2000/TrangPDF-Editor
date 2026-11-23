/**
 * @pdf-editor/ui: React components and hooks. Imports from @pdf-editor/core and @pdf-editor/shared;
 * receives the platform's FileAdapter through <EditorProvider>, never from @pdf-editor/platform.
 */
export { EditorProvider } from "./editor/EditorProvider";
export type { EditorServices } from "./editor/context";
export { useEditorServices, useDocument } from "./editor/hooks";
export { EditorApp } from "./components/EditorApp";
export { EditorRouter } from "./routing/EditorRouter";
export { createBrowserHistory, createHashHistory, createMemoryHistory } from "@tanstack/react-router";
