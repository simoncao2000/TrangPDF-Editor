import { beforeAll, describe, expect, it } from "bun:test";
import type { EngineClient } from "../engine/engine-client";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import { deletePages, insertPages, movePages, rotatePages } from "./commands";
import { createDocumentSession } from "./document-session";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

describe("DocumentSession", () => {
  it("goes from empty to loading to clean, with one page reference per page", async () => {
    const session = createDocumentSession(engine);
    const statuses: string[] = [];
    session.store.subscribe((state) => statuses.push(state.status));

    await session.load({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf") });

    const state = session.store.getState();
    expect(statuses).toEqual(["loading", "clean"]);
    expect(state.fileName).toBe("Three.pdf");
    expect(state.pages.map((page) => page.sourceIndex)).toEqual([0, 1, 2]);
    expect(new Set(state.pages.map((page) => page.id)).size).toBe(3);
  });

  it("fails without contacting the engine when the file is not a PDF", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "photo.pdf", bytes: corpusFile("not-a-pdf.pdf") });
    expect(session.store.getState()).toMatchObject({ status: "failed", error: "not-pdf" });
  });

  it("fails with damaged for a broken file", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "broken.pdf", bytes: corpusFile("damaged.pdf") });
    expect(session.store.getState()).toMatchObject({ status: "failed", error: "damaged" });
  });

  it("asks for a password, flags a wrong one, then opens", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Locked.pdf", bytes: corpusFile("encrypted-harbour.pdf") });
    expect(session.store.getState()).toMatchObject({ status: "needsPassword", error: null });

    await session.submitPassword("nope");
    expect(session.store.getState()).toMatchObject({ status: "needsPassword", error: "wrong-password" });

    await session.submitPassword("harbour");
    expect(session.store.getState()).toMatchObject({ status: "clean", fileName: "Locked.pdf" });
  });

  it("returns to empty on close", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf") });
    await session.close();
    expect(session.store.getState()).toMatchObject({ status: "empty", pages: [], fileName: null });
  });

  it("keeps only the newest of two overlapping loads", async () => {
    const session = createDocumentSession(engine);
    const slow = session.load({ name: "First.pdf", bytes: corpusFile("three-pages.pdf") });
    const fast = session.load({ name: "Second.pdf", bytes: corpusFile("three-pages.pdf") });
    await Promise.all([slow, fast]);
    expect(session.store.getState().fileName).toBe("Second.pdf");
  });
});

describe("DocumentSession editing and saving", () => {
  /**
   * A session with three-pages.pdf open.
   * @returns The session.
   */
  async function openSession() {
    const session = createDocumentSession(engine);
    await session.load({ name: "Three.pdf", bytes: corpusFile("three-pages.pdf"), fileId: "file-1" });
    return session;
  }

  const ids = (session: Awaited<ReturnType<typeof openSession>>) =>
    session.store.getState().pages.map((page) => page.sourceIndex);

  it("becomes dirty after an edit and clean after undo", async () => {
    const session = await openSession();
    const [first] = session.store.getState().pages;
    session.dispatch(rotatePages([first!.id], 90));
    expect(session.store.getState()).toMatchObject({ status: "dirty", undoLabel: "Rotate 1 page", redoLabel: null });
    session.undo();
    expect(session.store.getState()).toMatchObject({ status: "clean", undoLabel: null, redoLabel: "Rotate 1 page" });
    session.redo();
    expect(session.store.getState().pages[0]!.rotation).toBe(90);
  });

  it("builds commands that need the current content from a function", async () => {
    const session = await openSession();
    const last = session.store.getState().pages[2]!.id;
    session.dispatch((content) => movePages(content, [last], 0));
    expect(ids(session)).toEqual([2, 0, 1]);
  });

  it("drops deleted pages from the selection", async () => {
    const session = await openSession();
    const [a, b] = session.store.getState().pages;
    session.select([b!.id, a!.id]);
    expect(session.store.getState().selection).toEqual([a!.id, b!.id]);
    session.dispatch((content) => deletePages(content, [a!.id]));
    expect(session.store.getState().selection).toEqual([b!.id]);
  });

  it("merges another file's pages", async () => {
    const session = await openSession();
    const imported = await session.importSource({ name: "Other.pdf", bytes: corpusFile("three-pages.pdf") });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    session.dispatch(insertPages(imported.value, 1));
    expect(session.store.getState().pages).toHaveLength(6);
    expect(Object.keys(session.store.getState().sources)).toHaveLength(2);
  });

  it("refuses to import a file that is not a PDF", async () => {
    const session = await openSession();
    const imported = await session.importSource({ name: "photo.pdf", bytes: corpusFile("not-a-pdf.pdf") });
    expect(imported).toEqual({ ok: false, error: "not-pdf" });
  });

  it("saves the edited document, verified, and becomes clean", async () => {
    const session = await openSession();
    session.dispatch((content) => deletePages(content, [content.pages[1]!.id]));
    let written: ArrayBuffer | null = null;
    const result = await session.save(async (bytes) => {
      written = bytes;
      return { name: "Three (edited).pdf", fileId: "file-2" };
    });
    expect(result).toEqual({ saved: true, file: { name: "Three (edited).pdf", fileId: "file-2" } });
    expect(session.store.getState()).toMatchObject({
      status: "clean",
      fileName: "Three (edited).pdf",
      fileId: "file-2",
    });
    const reopened = createDocumentSession(engine);
    await reopened.load({ name: "check.pdf", bytes: written! });
    expect(reopened.store.getState().pages).toHaveLength(2);
  });

  it("stays dirty when the user cancels or the write fails", async () => {
    const session = await openSession();
    session.dispatch(rotatePages([session.store.getState().pages[0]!.id], 90));
    expect(await session.save(async () => null)).toEqual({ saved: false, reason: "cancelled" });
    expect(session.store.getState().status).toBe("dirty");
    expect(
      await session.save(async () => {
        throw new Error("disk full");
      }),
    ).toEqual({ saved: false, reason: "write-failed" });
    expect(session.store.getState().status).toBe("dirty");
  });

  it("builds a PDF of selected pages only (extract)", async () => {
    const session = await openSession();
    const [, second, third] = session.store.getState().pages;
    const bytes = await session.buildPdf([third!.id, second!.id]);
    const check = createDocumentSession(engine);
    await check.load({ name: "extract.pdf", bytes });
    expect(check.store.getState().pages).toHaveLength(2);
    expect(session.store.getState().status).toBe("clean");
  });
});
