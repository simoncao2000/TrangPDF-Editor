/**
 * Builds the editor services for the web: the browser file adapter, the engine worker, the
 * workspace of open documents and the page renderer. The only place that knows the app runs in a
 * browser.
 */
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { createDocumentSession, createWorkspace, EngineClient, PageRenderer, spawnEngineWorker } from "@pdf-editor/core";
import { createWebFileAdapter } from "@pdf-editor/platform";
import type { EditorServices } from "@pdf-editor/ui";

/**
 * Starts the engine worker and wires everything together.
 * @returns Services for <EditorProvider>. The worker begins loading PDFium immediately; calls made
 *   before it is ready wait in the worker's queue.
 */
export function createWebServices(): EditorServices {
  const engine = new EngineClient(spawnEngineWorker());
  engine.call("init", { wasmUrl: new URL(wasmUrl, window.location.href).href });
  return {
    files: createWebFileAdapter(),
    workspace: createWorkspace(() => createDocumentSession(engine)),
    renderer: new PageRenderer(engine),
  };
}
