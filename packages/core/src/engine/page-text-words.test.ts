/**
 * Editing a line whose font has a zero-width space, as pdfTeX writes them: the line has no space
 * characters, its word gaps are TJ offsets. The edited line is written one object per word, in the
 * original font and with the original gaps, and is still read, moved and undone as one line.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import type { PageTextObject } from "../page-text/page-text";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/** latex-spaces.pdf: 24 pt text whose word gaps are -600 in TJ, i.e. 0.6 em. */
const GAP = 0.6 * 24;
/** Fallback fonts' spaces are about 0.28 em; anything this close to `GAP` keeps the original gaps. */
const TOLERANCE = 1.5;

/**
 * Opens latex-spaces.pdf.
 * @returns Its docId.
 */
async function openLatex(): Promise<string> {
  return (await engine.call("open", { source: { bytes: corpusFile("latex-spaces.pdf") } }).promise).docId;
}

/**
 * The text objects (lines) on page 1.
 * @param docId An open document.
 * @returns The lines in drawing order.
 */
async function lines(docId: string): Promise<PageTextObject[]> {
  return engine.call("getTextObjects", { docId, pageIndex: 0 }).promise;
}

/**
 * Opens the file and replaces its line, deleting the space after "List".
 * @returns The document, the original line and the edited line.
 */
async function editOneSpace(): Promise<{ docId: string; original: PageTextObject; edited: PageTextObject }> {
  const docId = await openLatex();
  const [original] = await lines(docId);
  await engine.call("replacePageText", {
    docId,
    pageIndex: 0,
    id: original!.id,
    newId: "new-1",
    text: "Dean List7 times recipient",
  }).promise;
  const [edited] = await lines(docId);
  return { docId, original: original!, edited: edited! };
}

describe("page text in fonts with a zero-width space", () => {
  it("keeps the original gaps: deleting one space shortens the line by one gap", async () => {
    const { original, edited } = await editOneSpace();
    expect(original.text).toBe("Dean List 7 times recipient");
    expect(edited).toMatchObject({ id: "new-1", text: "Dean List7 times recipient", fontSize: 24 });
    expect(Math.abs(original.bounds.width - GAP - edited.bounds.width)).toBeLessThan(TOLERANCE);
  });

  it("loads a marked word line as separate runs with its logical spaces", async () => {
    const { edited } = await editOneSpace();
    expect(edited.runs?.map((run) => run.text)).toEqual(["Dean ", "List7 ", "times ", "recipient"]);
    expect(edited.runs?.every((run) => run.font?.kind === "embedded")).toBe(true);
  });

  it("reads the words as one line, from any of them", async () => {
    const { docId, edited } = await editOneSpace();
    expect(await lines(docId)).toHaveLength(1);
    const lastWord = { x: edited.bounds.x + edited.bounds.width - 5, y: edited.bounds.y + edited.bounds.height / 2 };
    expect((await engine.call("getTextObjectAt", { docId, pageIndex: 0, point: lastWord }).promise)?.id).toBe("new-1");
  });

  it("keeps the line together after a save", async () => {
    const { docId, edited } = await editOneSpace();
    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
    const [line, ...rest] = await lines(reopened);
    expect(rest).toHaveLength(0);
    expect(line!.text).toBe("Dean List7 times recipient");
    expect(line!.bounds.width).toBeCloseTo(edited.bounds.width, 1);
  });

  it("undoes, redoes and moves the whole line", async () => {
    const { docId, original, edited } = await editOneSpace();
    await engine.call("showPageText", { docId, pageIndex: 0, show: [original.id], hide: ["new-1"] }).promise;
    expect((await lines(docId)).map((line) => line.text)).toEqual(["Dean List 7 times recipient"]);
    await engine.call("showPageText", { docId, pageIndex: 0, show: ["new-1"], hide: [original.id] }).promise;
    await engine.call("movePageText", { docId, pageIndex: 0, id: "new-1", dx: 10, dy: -40 }).promise;
    const [moved] = await lines(docId);
    expect(moved!.bounds.x).toBeCloseTo(edited.bounds.x + 10, 3);
    expect(moved!.bounds.y).toBeCloseTo(edited.bounds.y - 40, 3);
    expect(moved!.bounds.width).toBeCloseTo(edited.bounds.width, 3);
  });

  it("edits the line again with the same gaps", async () => {
    const { docId, edited } = await editOneSpace();
    await engine.call("replacePageText", {
      docId,
      pageIndex: 0,
      id: "new-1",
      newId: "new-2",
      text: "Dean List7 times recipient twice",
    }).promise;
    const [again, ...rest] = await lines(docId);
    expect(rest).toHaveLength(0);
    expect(again!.text).toBe("Dean List7 times recipient twice");
    const twice = again!.bounds.width - edited.bounds.width - GAP;
    expect(twice).toBeGreaterThan(40);
    expect(twice).toBeLessThan(60);
    // Words that did not change sit exactly where the switched-off ones were; search still sees them.
    const found = await engine.call("findText", { docId, pageIndexes: [0], query: "times", limit: 5 }).promise;
    expect(found).toHaveLength(1);
  });

  it("draws the whole line for dragging it", async () => {
    const { docId, edited } = await editOneSpace();
    const rendered = await engine.call("renderTextObject", { docId, pageIndex: 0, id: "new-1", scale: 2 }).promise;
    const bitmap = rendered.bitmap as unknown as FakeBitmap;
    expect(Math.abs(bitmap.width - edited.bounds.width * 2)).toBeLessThan(6);
    // Ink near both ends: the first and the last word are in the picture.
    const inkInColumn = (x: number) =>
      Array.from({ length: bitmap.height }, (_, y) => bitmap.pixels[(y * bitmap.width + x) * 4 + 3]!).some(
        (alpha) => alpha > 128,
      );
    expect([0, 1, 2, 3].some((x) => inkInColumn(x))).toBe(true);
    expect([1, 2, 3, 4].some((x) => inkInColumn(bitmap.width - x))).toBe(true);
  });
});
