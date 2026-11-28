/**
 * @pdf-editor/platform: one FileAdapter per platform. Imports only from @pdf-editor/shared and knows
 * nothing about PDFs. Tauri and Capacitor adapters arrive in Phases 4 and 5.
 */
export { createWebFileAdapter } from "./web/web-file-adapter";
export { createWebFontFileStore } from "./web/font-files";
