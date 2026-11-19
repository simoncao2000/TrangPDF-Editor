/**
 * Repo-wide lint: the web app's rules for every package, plus the dependency rules from the
 * architecture (§5) so a wrong import fails the build:
 *   core     → shared only (never React, never a platform)
 *   platform → shared only
 *   ui       → core and shared (gets the platform through React context)
 *   shared   → nothing
 */
import { globalIgnores } from "eslint/config";
import web from "./apps/web/eslint.config.js";

const restrict = (files, patterns, paths = []) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns, paths }] },
});

const react = { group: ["react", "react-dom", "react/*", "zustand"], message: "This package must not depend on React." };
const reactOk = { group: ["react", "react-dom", "react/*"], message: "This package must not depend on React." };
const platform = { group: ["@pdf-editor/platform", "@pdf-editor/platform/*"], message: "Only apps import a platform; the UI receives it through <EditorProvider>." };
const ui = { group: ["@pdf-editor/ui", "@pdf-editor/ui/*"], message: "Lower layers must not import the UI." };
const core = { group: ["@pdf-editor/core", "@pdf-editor/core/*"], message: "This package must not import the editor core." };

export default [
  globalIgnores(["**/dist", "**/node_modules", "test-corpus"]),
  ...web,
  restrict(["packages/shared/src/**"], [reactOk, platform, ui, core, { group: ["zustand"], message: "shared holds types and constants only." }]),
  restrict(["packages/core/src/**"], [reactOk, platform, ui], [{ name: "zustand", message: "core may use zustand/vanilla only (no React bindings)." }]),
  restrict(["packages/platform/src/**"], [react, ui, core]),
  restrict(["packages/ui/src/**"], [platform]),
];
