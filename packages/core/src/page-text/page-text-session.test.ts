/** Editing page text through a real session and engine: undo, redo, save. */
import { beforeAll, describe, expect, it, spyOn } from "bun:test";
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

  it("discards a rejected line edit even when undo and redo were queued", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const line = (await session.textObjectAt(pageId, FIRST_LINE))!;
    session.dispatch(rotatePages([pageId], 90));
    const undoLabel = session.store.getState().undoLabel;

    session.dispatch((content) => editPageText(content, pageId, { ...line, id: "missing-line" }, "Rejected edit"));
    session.undo();
    session.redo();
    await session.settled();
    const { failedEdit } = session.store.getState();
    expect(failedEdit).toEqual({ label: "Edit text", serial: 1 });
    expect(session.store.getState()).toMatchObject({ undoLabel, redoLabel: null, status: "dirty" });
    expect((await session.readTextObjects(pageId))[0]).toEqual(line);

    session.undo();
    expect(session.store.getState()).toMatchObject({ undoLabel: null, redoLabel: undoLabel, status: "clean" });
    session.redo();
    await session.settled();
    expect(session.store.getState()).toMatchObject({ undoLabel, redoLabel: null, failedEdit });
    await session.close();
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

  it("undoes and redoes all styled runs in a block with one command", async () => {
    const session = createDocumentSession(engine);
    await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
    const pageId = session.store.getState().pages[0]!.id;
    const first = {
      text: "Low ",
      fontFamily: "Helvetica",
      fontSize: 14,
      bold: false,
      italic: false,
      underline: false,
      color: { r: 0, g: 0, b: 0 },
    } as const;
    const second = { ...first, text: "tide  ", fontFamily: "Times", underline: true } as const;
    session.dispatch((content) =>
      addPageText(content, pageId, [[first, second]], { origin: { x: 72, y: 500 }, angle: 0, fontSize: 14 }),
    );

    expect(session.store.getState().undoLabel).toBe("Add text");
    const objects = await session.readTextObjects(pageId);
    expect(objects.at(-1)).toMatchObject({ text: "tide", style: { family: "serif" } });
    expect(objects.slice(-2).map((object) => object.text.trimEnd())).toEqual(["Low", "tide"]);
    session.undo();
    expect(await session.readTextObjects(pageId)).toHaveLength(2);
    session.redo();
    expect((await session.readTextObjects(pageId)).slice(-2)).toEqual(objects.slice(-2));
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

it("refreshes only the edited page and drops the edit when its redo branch is cleared", async () => {
  const session = createDocumentSession(engine);
  await session.load({ name: "Tide.pdf", bytes: corpusFile("three-pages.pdf") });
  const [first, second] = session.store.getState().pages;
  const pageId = first!.id;
  const origin = { x: 72, y: 500 };
  const style = { fontSize: 16, angle: 0, color: { r: 0, g: 0, b: 0 } };
  session.dispatch((content) => addPageText(content, pageId, [{ text: "Original", origin }], style));
  const initial = await session.readTextObjects(pageId);
  const other = await session.readTextObjects(second!.id);
  const line = initial[0]!;
  let refreshed: ReturnType<typeof session.readTextObjects> | undefined;
  const unsubscribe = session.store.subscribe(() => {
    refreshed = session.readTextObjects(pageId);
  });
  session.dispatch((content) => editPageText(content, pageId, line, [{ ...line.runs![0]!, text: "Edited" }]));
  expect((await refreshed)?.[0]?.text).toBe("Edited");
  expect(await session.readTextObjects(second!.id)).toBe(other);
  session.undo();
  const restored = await refreshed;
  expect(restored?.[0]?.text).toBe("Original");
  expect(restored).not.toBe(initial);
  session.dispatch(rotatePages([second!.id], 90));
  await session.settled();
  expect(session.store.getState()).toMatchObject({ redoLabel: null, failedEdit: null });
  expect((await session.readTextObjects(pageId))[0]?.text).toBe("Original");
  unsubscribe();
  await session.close();
});

it("drops every invalidated page text redo entry when a new command executes", async () => {
  const session = createDocumentSession(engine);
  await session.load({ name: "Tide.pdf", bytes: corpusFile("text.pdf") });
  const pageId = session.store.getState().pages[0]!.id;
  const source = (await session.readTextObjects(pageId))[0]!;
  session.dispatch((content) => editPageText(content, pageId, source, "First edit"));
  const first = (await session.readTextObjects(pageId))[0]!;
  session.dispatch((content) => editPageText(content, pageId, first, "Second edit"));
  session.undo();
  session.undo();

  const call = spyOn(engine, "call");
  session.dispatch(rotatePages([pageId], 90));
  const dropped = call.mock.calls
    .filter(([name]) => name === "dropPageTextEdit")
    .map(([, args]) => (args as { editId: string }).editId);
  expect(dropped).toHaveLength(2);
  expect(new Set(dropped).size).toBe(2);
  call.mockRestore();
  await session.close();
});
