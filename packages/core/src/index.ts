/**
 * @pdf-editor/core: document model, engine protocol and client, render pipeline, geometry.
 * Imports only from @pdf-editor/shared. Never imports React or a browser file API.
 */
export * from "./document/document-state";
export * from "./document/document-session";
export * from "./document/commands";
export * from "./document/selection";
export { isDirty, type History } from "./document/history";
export * from "./engine/protocol";
export { EngineClient, EngineCallError, spawnEngineWorker, type EngineTransport, type EngineCall } from "./engine/engine-client";
export * from "./render/bitmap-cache";
export * from "./render/render-queue";
export { PageRenderer, type RenderRequest, type RenderTicket, type RenderEngine, type PageRendererOptions } from "./render/page-renderer";
export * from "./geometry/zoom";
export * from "./geometry/page-layout";
export { inspectPdfBytes } from "./validate";
