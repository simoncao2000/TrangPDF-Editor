/** Editing page text through a real session and engine: undo, redo, save. */
import { beforeAll, describe, expect, it } from "bun:test";
import { createDocumentSession } from "../document/document-session";
import type { EngineClient } from "../engine/engine-client";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import { rotatePages } from "../document/commands";
import { addPageText, editPageText, movePageText } from "./page-text-commands";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

const FIRST_LINE = { x: 100, y: 708 };

describe("page text in a session", () => {
  it("edits page text with undo and redo, and saves the new text", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const textNow = async () => (await session.textObjectAt(pageId, FIRST_LINE))?.text;

    const original = (await session.textObjectAt(pageId, FIRST_LINE))!;
    session.dispatch((content) => editPageText(content, pageId, original, "Tide tables for the bay"));
    expect(session.store.getState()).toMatchObject({ status: "dirty", undoLabel: "Edit text" });
    expect(await textNow()).toBe("Tide tables for the bay");

    session.undo();
    expect(await textNow()).toBe("Tide tables for the headland");
    session.redo();
    expect(await textNow()).toBe("Tide tables for the bay");

    let written: ArrayBuffer | null = null;
    await session.save(async (bytes) => {
      written = bytes;
      return { name: "Tide.pdf" };
    });
    const reopened = await engine.call("open", { source: { bytes: written! } }).promise;
    const saved = await engine.call("getTextObjectAt", { docId: reopened.docId, pageIndex: 0, point: FIRST_LINE })
      .promise;
    expect(saved?.text).toBe("Tide tables for the bay");
  });

  it("lists the page's text, once per page revision", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const first = await session.readTextObjects(pageId);
    expect(first.map((object) => object.text)).toEqual(["Tide tables for the headland", "Check before you walk"]);
    expect(await session.readTextObjects(pageId)).toBe(first);

    session.dispatch((content) => editPageText(content, pageId, first[1]!, "Check twice"));
    expect((await session.readTextObjects(pageId)).map((object) => object.text)).toEqual([
      "Tide tables for the headland",
      "Check twice",
    ]);
  });

  it("adds text with undo and redo, and the added text is editable like any other", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const textsNow = async () => (await session.readTextObjects(pageId)).map((object) => object.text);

    session.dispatch((content) =>
      addPageText(content, pageId, [{ text: "Low tide at noon", origin: { x: 72, y: 500 } }], {
        fontSize: 14,
        color: { r: 0, g: 0, b: 0 },
        angle: 0,
      }),
    );
    expect(session.store.getState().undoLabel).toBe("Add text");
    expect(await textsNow()).toEqual(["Tide tables for the headland", "Check before you walk", "Low tide at noon"]);

    const added = (await session.textObjectAt(pageId, { x: 90, y: 504 }))!;
    session.dispatch((content) => editPageText(content, pageId, added, "Low tide at one"));
    expect(await textsNow()).toEqual(["Tide tables for the headland", "Check before you walk", "Low tide at one"]);

    session.undo();
    session.undo();
    expect(await textsNow()).toEqual(["Tide tables for the headland", "Check before you walk"]);
    session.redo();
    expect(await textsNow()).toEqual(["Tide tables for the headland", "Check before you walk", "Low tide at noon"]);
  });

  it("moves page text with undo and redo", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const line = (await session.textObjectAt(pageId, FIRST_LINE))!;

    session.dispatch((content) => movePageText(content, pageId, line, { dx: 20, dy: -100 }));
    expect(session.store.getState().undoLabel).toBe("Move text");
    expect(await session.textObjectAt(pageId, FIRST_LINE)).toBeNull();
    expect((await session.textObjectAt(pageId, { x: FIRST_LINE.x + 20, y: FIRST_LINE.y - 100 }))?.id).toBe(line.id);

    session.undo();
    expect((await session.textObjectAt(pageId, FIRST_LINE))?.bounds).toEqual(line.bounds);
    session.redo();
    expect(await session.textObjectAt(pageId, FIRST_LINE)).toBeNull();
  });

  it("deletes a line when all of its text is removed, with undo", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const line = (await session.textObjectAt(pageId, FIRST_LINE))!;

    session.dispatch((content) => editPageText(content, pageId, line, "   "));
    await session.settled();
    expect(session.store.getState()).toMatchObject({ undoLabel: "Delete text", failedEdit: null });
    expect(await session.textObjectAt(pageId, FIRST_LINE)).toBeNull();

    session.undo();
    expect((await session.textObjectAt(pageId, FIRST_LINE))?.text).toBe("Tide tables for the headland");
  });

  it("finds text in page order, and tells which page each match is on", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const matches = await session.findText("before", 10);
    expect(matches).toMatchObject([{ pageId, pageNumber: 1, snippet: { match: "before" } }]);
    // Searching does not change the document.
    session.dispatch(rotatePages([pageId], 90));
    expect((await session.findText("before", 10))[0]?.pageNumber).toBe(1);
  });
});
