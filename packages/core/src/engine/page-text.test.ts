/** Editing and adding a page's own text through the engine, on a page with two lines of Helvetica. */
import { beforeAll, describe, expect, it } from "bun:test";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/** Points on the two lines: "Tide tables for the headland" (baseline 700), "Check before you walk" (670). */
const FIRST_LINE = { x: 100, y: 708 };
const SECOND_LINE = { x: 100, y: 678 };
const BLACK = { r: 0, g: 0, b: 0 };

/**
 * Opens text.pdf.
 * @returns Its docId.
 */
async function openText(): Promise<string> {
  return (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
}

/**
 * The text objects on page 1, as text.
 * @param docId An open document.
 * @returns Their texts in drawing order.
 */
async function texts(docId: string): Promise<string[]> {
  return (await engine.call("getTextObjects", { docId, pageIndex: 0 }).promise).map((object) => object.text);
}

/**
 * The text object under a point on page 1.
 * @param docId An open document.
 * @param point The point.
 * @returns The object.
 */
async function objectAt(docId: string, point: { x: number; y: number }) {
  return (await engine.call("getTextObjectAt", { docId, pageIndex: 0, point }).promise)!;
}

/**
 * Saves page 1 and reopens it.
 * @param docId An open document.
 * @returns The reopened document's id.
 */
async function saveAndReopen(docId: string): Promise<string> {
  const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
  return (await engine.call("open", { source: { bytes } }).promise).docId;
}

describe("page text", () => {
  it("finds the text object under a point, with its size, colour and font style", async () => {
    const docId = await openText();
    expect(await objectAt(docId, FIRST_LINE)).toMatchObject({ text: "Tide tables for the headland", fontSize: 24, color: BLACK, style: { family: "sans", bold: false, italic: false } });
    expect(await engine.call("getTextObjectAt", { docId, pageIndex: 0, point: { x: 300, y: 300 } }).promise).toBeNull();
  });

  it("gives each text object the same id every time it is read", async () => {
    const docId = await openText();
    const ids = (await engine.call("getTextObjects", { docId, pageIndex: 0 }).promise).map((object) => object.id);
    expect(new Set(ids).size).toBe(2);
    expect((await objectAt(docId, FIRST_LINE)).id).toBe(ids[0]!);
  });

  it("replaces text, and the saved file has only the new text", async () => {
    const docId = await openText();
    const line = await objectAt(docId, FIRST_LINE);
    await engine.call("replacePageText", { docId, pageIndex: 0, id: line.id, newId: "new-1", text: "Tide tables for the bay" }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the bay", "Check before you walk"]);
    expect(await texts(await saveAndReopen(docId))).toEqual(["Tide tables for the bay", "Check before you walk"]);
  });

  it("switches text on and off by id, in any order, even after a save", async () => {
    const docId = await openText();
    const first = await objectAt(docId, FIRST_LINE);
    const second = await objectAt(docId, SECOND_LINE);
    await engine.call("replacePageText", { docId, pageIndex: 0, id: second.id, newId: "b", text: "Check twice" }).promise;
    await engine.call("replacePageText", { docId, pageIndex: 0, id: first.id, newId: "a", text: "Tides" }).promise;
    await saveAndReopen(docId);

    // Undo the older edit first: ids still find the right objects although indexes have moved.
    await engine.call("showPageText", { docId, pageIndex: 0, show: [second.id], hide: ["b"] }).promise;
    expect(await texts(docId)).toEqual(["Tides", "Check before you walk"]);
    await engine.call("showPageText", { docId, pageIndex: 0, show: [first.id], hide: ["a"] }).promise;
    expect(await texts(await saveAndReopen(docId))).toEqual(["Tide tables for the headland", "Check before you walk"]);
  });

  it("adds new lines of page text that read like any other page text", async () => {
    const docId = await openText();
    await engine.call("addPageText", {
      docId,
      pageIndex: 0,
      ids: ["l1", "l2"],
      lines: [
        { text: "Low tide at noon", origin: { x: 72, y: 500 } },
        { text: "Bring a jacket", origin: { x: 72, y: 480 } },
      ],
      fontSize: 14,
      color: { r: 41, g: 77, b: 119 },
      angle: 0,
    }).promise;
    const added = await objectAt(docId, { x: 90, y: 504 });
    expect(added).toMatchObject({ id: "l1", text: "Low tide at noon", fontSize: 14, color: { r: 41, g: 77, b: 119 } });

    const saved = await saveAndReopen(docId);
    expect(await texts(saved)).toEqual(["Tide tables for the headland", "Check before you walk", "Low tide at noon", "Bring a jacket"]);

    await engine.call("showPageText", { docId, pageIndex: 0, show: [], hide: ["l1", "l2"] }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the headland", "Check before you walk"]);
  });

  it("refuses an unknown id", async () => {
    const docId = await openText();
    const error = await engine.call("replacePageText", { docId, pageIndex: 0, id: "nope", newId: "x", text: "x" }).promise.catch((e: unknown) => e);
    expect((error as { detail: { code: string } }).detail.code).toBe("text-edit-failed");
  });

  it("moves text, and the saved file has it in the new place", async () => {
    const docId = await openText();
    const line = await objectAt(docId, FIRST_LINE);
    await engine.call("movePageText", { docId, pageIndex: 0, id: line.id, dx: 0, dy: -300 }).promise;
    expect((await engine.call("getTextObjectAt", { docId, pageIndex: 0, point: FIRST_LINE }).promise)?.text).toBeUndefined();
    const moved = await objectAt(docId, { x: FIRST_LINE.x, y: FIRST_LINE.y - 300 });
    expect(moved).toMatchObject({ id: line.id, text: "Tide tables for the headland" });
    expect(moved.bounds.y).toBeCloseTo(line.bounds.y - 300, 3);

    const saved = await saveAndReopen(docId);
    expect((await objectAt(saved, { x: FIRST_LINE.x, y: FIRST_LINE.y - 300 })).text).toBe("Tide tables for the headland");

    // Moving back (undo) puts it exactly where it was.
    await engine.call("movePageText", { docId, pageIndex: 0, id: line.id, dx: 0, dy: 300 }).promise;
    expect((await objectAt(docId, FIRST_LINE)).bounds).toEqual(line.bounds);
  });

  it("renders one text object on its own, for dragging it", async () => {
    const docId = await openText();
    const line = await objectAt(docId, FIRST_LINE);
    const rendered = await engine.call("renderTextObject", { docId, pageIndex: 0, id: line.id, scale: 2 }).promise;
    const bitmap = rendered.bitmap as unknown as FakeBitmap;
    expect(bitmap.width).toBeGreaterThan(line.bounds.width * 1.8);
    expect(bitmap.height).toBeGreaterThan(line.bounds.height * 1.5);
    // Some pixels are ink (opaque), some are clear.
    const alphas = new Set(Array.from({ length: bitmap.width * bitmap.height }, (_, i) => bitmap.pixels[i * 4 + 3]));
    expect(alphas.has(0)).toBe(true);
    expect([...alphas].some((alpha) => alpha! > 200)).toBe(true);
  });
});
