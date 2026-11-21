/** Annotation commands through a real session and a real engine: undo, redo, save. */
import { beforeAll, describe, expect, it } from "bun:test";
import { createDocumentSession, type DocumentSession } from "../document/document-session";
import { pageAddressOf } from "../document/document-state";
import type { EngineClient } from "../engine/engine-client";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import type { SquareAnnotation } from "./annotation";
import { addAnnotation, deleteAnnotations } from "./annotation-commands";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

const square: SquareAnnotation = {
  kind: "square",
  id: "sq",
  rect: { x: 100, y: 100, width: 50, height: 50 },
  color: { r: 0, g: 0, b: 255 },
  opacity: 1,
  lineWidth: 2,
};

/**
 * Ids of the annotations on a page, as the engine has them now.
 * @param session The session.
 * @param pageId The page.
 * @returns Annotation ids.
 */
async function idsOn(session: DocumentSession, pageId: string): Promise<string[]> {
  const at = pageAddressOf(session.store.getState(), pageId)!;
  return (await engine.call("getAnnotations", at).promise).map((annotation) => annotation.id);
}

/**
 * Opens a corpus file in a new session.
 * @param name Corpus file name.
 * @returns The session and its first page id.
 */
async function openSession(name: string): Promise<{ session: DocumentSession; firstPage: string }> {
  const session = createDocumentSession(engine);
  await session.load({ name, bytes: corpusFile(name) });
  return { session, firstPage: session.store.getState().pages[0]!.id };
}

describe("annotations in a session", () => {
  it("adds, undoes and redoes an annotation, with the dirty state following", async () => {
    const { session, firstPage } = await openSession("three-pages.pdf");

    session.dispatch((content) => addAnnotation(content, firstPage, square));
    expect(session.store.getState()).toMatchObject({ status: "dirty", undoLabel: "Add rectangle" });
    expect(await idsOn(session, firstPage)).toEqual(["sq"]);

    session.undo();
    expect(session.store.getState().status).toBe("clean");
    expect(await idsOn(session, firstPage)).toEqual([]);

    session.redo();
    expect(await idsOn(session, firstPage)).toEqual(["sq"]);
  });

  it("undoes deleting an annotation made by another app", async () => {
    const { session, firstPage } = await openSession("annotated.pdf");
    const at = pageAddressOf(session.store.getState(), firstPage)!;
    const before = await engine.call("getAnnotations", at).promise;

    session.dispatch((content) => deleteAnnotations(content, firstPage, before));
    expect(await idsOn(session, firstPage)).toEqual([]);

    session.undo();
    expect(await engine.call("getAnnotations", at).promise).toEqual(before);
  });

  it("saves annotations into the file", async () => {
    const { session, firstPage } = await openSession("three-pages.pdf");
    session.dispatch((content) => addAnnotation(content, firstPage, square));

    let written: ArrayBuffer | null = null;
    const result = await session.save(async (bytes) => {
      written = bytes;
      return { name: "Saved.pdf" };
    });
    expect(result.saved).toBe(true);
    expect(session.store.getState().status).toBe("clean");

    const reopened = await engine.call("open", { source: { bytes: written! } }).promise;
    const saved = await engine.call("getAnnotations", { docId: reopened.docId, pageIndex: 0 }).promise;
    expect(saved).toMatchObject([{ kind: "square", id: "sq", color: { r: 0, g: 0, b: 255 } }]);
  });

  it("reports an edit the engine could not do", async () => {
    const { session, firstPage } = await openSession("three-pages.pdf");
    // Deleting an annotation that does not exist fails in the engine.
    session.dispatch((content) => deleteAnnotations(content, firstPage, [square]));
    await session.settled();
    expect(session.store.getState().failedEdit?.label).toBe("Delete rectangle");
  });

  it("reads a page's annotations, once per revision", async () => {
    const { session, firstPage } = await openSession("three-pages.pdf");
    const first = await session.readAnnotations(firstPage);
    expect(first).toEqual([]);
    expect(await session.readAnnotations(firstPage)).toBe(first); // cached

    session.dispatch((content) => addAnnotation(content, firstPage, square));
    const after = await session.readAnnotations(firstPage);
    expect(after.map((annotation) => annotation.id)).toEqual(["sq"]);

    session.undo();
    expect(await session.readAnnotations(firstPage)).toBe(first); // the old revision is still cached
  });

  it("reads nothing for an unknown page", async () => {
    const { session } = await openSession("three-pages.pdf");
    expect(await session.readAnnotations("nope")).toEqual([]);
  });

  it("finds the text between two points for a highlight", async () => {
    const { session, firstPage } = await openSession("text.pdf");
    const lines = await session.textRects(firstPage, { x: 73, y: 708 }, { x: 150, y: 678 });
    expect(lines).toHaveLength(2);
    expect(await session.textRects("nope", { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
  });
});
