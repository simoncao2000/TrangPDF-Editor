/** Several open documents, one per tab, sharing one engine. */
import { beforeAll, describe, expect, it } from "bun:test";
import { rotatePages } from "../document/commands";
import { createDocumentSession } from "../document/document-session";
import type { EngineClient } from "../engine/engine-client";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import { createWorkspace, type Workspace } from "./workspace";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/**
 * A workspace on the test engine.
 * @returns The workspace.
 */
function workspace(): Workspace {
  return createWorkspace(() => createDocumentSession(engine));
}

const names = (space: Workspace) => space.store.getState().tabs.map((tab) => tab.session.store.getState().fileName);

describe("Workspace", () => {
  it("starts with no tabs and an idle session", () => {
    const space = workspace();
    expect(space.store.getState()).toMatchObject({ tabs: [], activeId: null });
    expect(space.activeSession().store.getState().status).toBe("empty");
  });

  it("opens each file in its own tab and makes it active", async () => {
    const space = workspace();
    const first = await space.open({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const second = await space.open({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf") });
    expect(names(space)).toEqual(["Tide.pdf", "Three.pdf"]);
    expect(space.store.getState().activeId).toBe(second.id);
    expect(space.activeSession()).toBe(second.session);
    // Each tab keeps its own document.
    expect(first.session.store.getState().pages).toHaveLength(1);
    expect(second.session.store.getState().pages).toHaveLength(3);
  });

  it("switches to the tab that already has a file instead of opening it twice", async () => {
    const space = workspace();
    const first = await space.open({ name: "Tide.pdf", bytes: corpusFile("text.pdf"), fileId: "file-1" });
    await space.open({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf") });
    const again = await space.open({ name: "Tide.pdf", bytes: corpusFile("text.pdf"), fileId: "file-1" });
    expect(again.id).toBe(first.id);
    expect(space.store.getState().tabs).toHaveLength(2);
    expect(space.store.getState().activeId).toBe(first.id);
  });

  it("closes a tab and activates its neighbour", async () => {
    const space = workspace();
    const a = await space.open({ name: "A.pdf", bytes: corpusFile("text.pdf") });
    const b = await space.open({ name: "B.pdf", bytes: corpusFile("text.pdf") });
    const c = await space.open({ name: "C.pdf", bytes: corpusFile("text.pdf") });
    space.activate(b.id);
    await space.close(b.id);
    expect(names(space)).toEqual(["A.pdf", "C.pdf"]);
    expect(space.store.getState().activeId).toBe(c.id);
    await space.close(c.id);
    expect(space.store.getState().activeId).toBe(a.id);
    await space.close(a.id);
    expect(space.store.getState()).toMatchObject({ tabs: [], activeId: null });
  });

  it("keeps a tab whose file failed to open, so its error can be shown", async () => {
    const space = workspace();
    const tab = await space.open({ name: "Broken.pdf", bytes: corpusFile("damaged.pdf") });
    expect(tab.session.store.getState()).toMatchObject({ status: "failed", error: "damaged" });
    expect(space.store.getState().activeId).toBe(tab.id);
  });

  it("knows whether any tab has unsaved changes", async () => {
    const space = workspace();
    const tab = await space.open({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf") });
    expect(space.hasUnsavedChanges()).toBe(false);
    const pageId = tab.session.store.getState().pages[0]!.id;
    tab.session.dispatch(rotatePages([pageId], 90));
    expect(space.hasUnsavedChanges()).toBe(true);
  });
});
