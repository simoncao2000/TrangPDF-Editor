/** Editing and adding a page's own text through the engine, on a page with two lines of Helvetica. */
import { beforeAll, describe, expect, it } from "bun:test";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { TextRun } from "../page-text/page-text";
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

const COURIER_RUN: TextRun = {
  text: "Low ",
  fontFamily: "Courier",
  fontSize: 20,
  bold: true,
  italic: true,
  underline: true,
  color: BLACK,
};
const PLACEMENT = { origin: { x: 72, y: 500 }, angle: 0, fontSize: 14 };

describe("page text", () => {
  it("finds the text object under a point, with its size, colour and font style", async () => {
    const docId = await openText();
    expect(await objectAt(docId, FIRST_LINE)).toMatchObject({
      text: "Tide tables for the headland",
      fontSize: 24,
      color: BLACK,
      style: { family: "sans", bold: false, italic: false },
    });
    expect(await engine.call("getTextObjectAt", { docId, pageIndex: 0, point: { x: 300, y: 300 } }).promise).toBeNull();
  });

  it("loads PDF text as a run with the source font and style", async () => {
    const docId = await openText();
    const at = { docId, pageIndex: 0 };
    const [font] = await engine.call("getPageFonts", at).promise;
    const line = await objectAt(docId, FIRST_LINE);
    expect(line.runs).toEqual([
      {
        text: line.text,
        font: {
          kind: "embedded",
          fontId: `document:${font!.id}`,
          documentFontId: font!.id,
          name: font!.name,
          weight: 400,
          italic: false,
        },
        fontFamily: "Helvetica",
        fontSize: 24,
        color: BLACK,
        bold: false,
        italic: false,
        underline: false,
      },
    ]);
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
    await engine.call("replacePageText", {
      docId,
      pageIndex: 0,
      id: line.id,
      newId: "new-1",
      text: "Tide tables for the bay",
    }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the bay", "Check before you walk"]);
    expect(await texts(await saveAndReopen(docId))).toEqual(["Tide tables for the bay", "Check before you walk"]);
  });

  it("keeps a line typed back as it was readable, and undo puts the original back in place", async () => {
    const docId = await openText();
    const line = await objectAt(docId, FIRST_LINE);
    await engine.call("replacePageText", {
      docId,
      pageIndex: 0,
      id: line.id,
      newId: "same",
      text: "Tide tables for the headland",
    }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the headland", "Check before you walk"]);
    expect(
      await engine.call("findText", { docId, pageIndexes: [0], query: "headland", limit: 5 }).promise,
    ).toHaveLength(1);

    await engine.call("showPageText", { docId, pageIndex: 0, show: [line.id], hide: ["same"] }).promise;
    expect((await objectAt(docId, FIRST_LINE)).bounds).toEqual(line.bounds);
  });

  it("switches text on and off by id, in any order, even after a save", async () => {
    const docId = await openText();
    const first = await objectAt(docId, FIRST_LINE);
    const second = await objectAt(docId, SECOND_LINE);
    await engine.call("replacePageText", { docId, pageIndex: 0, id: second.id, newId: "b", text: "Check twice" })
      .promise;
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
    expect(await texts(saved)).toEqual([
      "Tide tables for the headland",
      "Check before you walk",
      "Low tide at noon",
      "Bring a jacket",
    ]);

    await engine.call("showPageText", { docId, pageIndex: 0, show: [], hide: ["l1", "l2"] }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the headland", "Check before you walk"]);
  });

  it("saves and reopens a styled run block with the expected advances and styles", async () => {
    const docId = await openText();
    const ids = ["low", "low-underline", "tide"];
    const tide: TextRun = {
      ...COURIER_RUN,
      text: "tide",
      fontFamily: "Times",
      fontSize: 16,
      bold: false,
      underline: false,
      color: { r: 31, g: 78, b: 121 },
    };
    const at = { docId, pageIndex: 0 };
    await engine.call("addPageText", {
      ...at,
      ...PLACEMENT,
      ids,
      runs: [{ runs: [COURIER_RUN, tide] }],
    }).promise;
    const saved = await saveAndReopen(docId);
    const objects = await engine.call("getTextObjects", { ...at, docId: saved }).promise;
    const [first, second] = objects.slice(-2);
    expect(first).toMatchObject({
      fontSize: 20,
      style: { family: "mono", bold: true, italic: true },
      color: BLACK,
    });
    expect(first?.text.trimEnd()).toBe("Low");
    expect(first?.runs?.[0]).toMatchObject({
      font: { kind: "embedded", weight: 700, italic: true },
      fontSize: 20,
      bold: true,
      italic: true,
      color: BLACK,
    });
    expect(second?.runs?.[0]).toMatchObject({
      font: { kind: "embedded", weight: 400, italic: true },
      fontSize: 16,
      bold: false,
      italic: true,
      color: tide.color,
    });
    expect(second).toMatchObject({
      text: "tide",
      fontSize: 16,
      style: { family: "serif", bold: false, italic: true },
      color: tide.color,
    });
    // Four Courier characters advance 48 pt. The Times italic t starts its ink just past that.
    expect(second!.bounds.x).toBeCloseTo(120.592, 2);
    await engine.call("showPageText", { ...at, show: [], hide: ids }).promise;
    expect(await texts(docId)).toEqual(["Tide tables for the headland", "Check before you walk"]);
    await engine.call("showPageText", { ...at, show: ids, hide: [] }).promise;
    expect((await texts(docId)).slice(-2).map((value) => value.trimEnd())).toEqual(["Low", "tide"]);
  });

  it("preserves the legacy WinAnsi result for Vietnamese text", async () => {
    const oldDoc = await openText();
    const newDoc = await openText();
    const text = "Tiếng Việt có dấu";
    const defaults = { ...COURIER_RUN, text, fontFamily: "Helvetica" } as const;
    const run = { ...defaults, fontSize: 14, bold: false, italic: false, underline: false };
    await engine.call("addPageText", {
      docId: oldDoc,
      pageIndex: 0,
      ids: ["legacy"],
      lines: [{ text, origin: PLACEMENT.origin }],
      fontSize: 14,
      color: BLACK,
      angle: 0,
    }).promise;
    await engine.call("addPageText", {
      docId: newDoc,
      pageIndex: 0,
      ids: ["styled"],
      ...PLACEMENT,
      runs: [{ runs: [run] }],
    }).promise;
    const legacy = (await texts(await saveAndReopen(oldDoc))).at(-1);
    expect(legacy).toBe("Tiÿng Viÿt có dÿu");
    expect((await texts(await saveAndReopen(newDoc))).at(-1)).toBe(legacy);
  });

  it("rejects invalid worker input and clamps valid font sizes", async () => {
    const docId = await openText();
    const at = { docId, pageIndex: 0 };
    const run = { ...COURIER_RUN, text: "Size", underline: false, fontSize: 999 };
    const params = { ...at, ...PLACEMENT, ids: ["test"] };
    for (const bad of [
      { ...run, fontFamily: "Other" },
      { ...run, text: 42 },
      { ...run, text: "x".repeat(65537) },
      { ...run, color: { r: 0, g: 1.5, b: 256 } },
      { ...run, fontSize: Infinity },
    ]) {
      const promise = engine.call("addPageText", {
        ...params,
        runs: [{ runs: [bad as TextRun] }],
      }).promise;
      expect(await promise.catch((error: { detail: unknown }) => error.detail)).toMatchObject({
        code: "invalid-text-runs",
      });
    }
    for (const runs of [
      Array.from({ length: 257 }, () => ({ runs: [run] })),
      [{ runs: Array.from({ length: 257 }, () => run) }],
    ]) {
      const promise = engine.call("addPageText", { ...params, runs }).promise;
      expect(await promise.catch((error: { detail: unknown }) => error.detail)).toMatchObject({
        code: "invalid-text-runs",
      });
    }
    const plain = { ...run, underline: false };
    const underlined = { ...plain, underline: true };
    for (const [ids, mismatchRun] of [
      [["one", "two"], plain],
      [["one"], underlined],
    ] as const) {
      const promise = engine.call("addPageText", { ...params, ids, runs: [{ runs: [mismatchRun] }] }).promise;
      expect(await promise.catch((error: { detail: unknown }) => error.detail)).toMatchObject({
        code: "invalid-text-runs",
      });
    }
    expect(await texts(docId)).toHaveLength(2);
    await engine.call("addPageText", { ...params, runs: [{ runs: [run] }] }).promise;
    expect((await engine.call("getTextObjects", at).promise).at(-1)?.fontSize).toBe(96);
  });

  it("refuses an unknown id", async () => {
    const docId = await openText();
    const error = await engine
      .call("replacePageText", { docId, pageIndex: 0, id: "nope", newId: "x", text: "x" })
      .promise.catch((e: unknown) => e);
    expect((error as { detail: { code: string } }).detail.code).toBe("text-edit-failed");
  });

  it("moves text, and the saved file has it in the new place", async () => {
    const docId = await openText();
    const line = await objectAt(docId, FIRST_LINE);
    await engine.call("movePageText", { docId, pageIndex: 0, id: line.id, dx: 0, dy: -300 }).promise;
    expect(
      (await engine.call("getTextObjectAt", { docId, pageIndex: 0, point: FIRST_LINE }).promise)?.text,
    ).toBeUndefined();
    const moved = await objectAt(docId, { x: FIRST_LINE.x, y: FIRST_LINE.y - 300 });
    expect(moved).toMatchObject({ id: line.id, text: "Tide tables for the headland" });
    expect(moved.bounds.y).toBeCloseTo(line.bounds.y - 300, 3);

    const saved = await saveAndReopen(docId);
    expect((await objectAt(saved, { x: FIRST_LINE.x, y: FIRST_LINE.y - 300 })).text).toBe(
      "Tide tables for the headland",
    );

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

it.each([400, 700] as const)("saves and reopens Vietnamese in embedded Inter %i", async (weight) => {
  const docId = await openText();
  const bytes = await Bun.file(new URL("../../../ui/src/assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const fontId = "test-inter";
  await engine.call("registerTextFont", { docId, fontId, bytes }, [bytes]).promise;
  const text = "Tiếng Việt rất đẹp.";
  const run: TextRun = {
    text: text.normalize("NFD"),
    font: { kind: "embedded", fontId, name: "Inter", weight, italic: false },
    fontSize: 16,
    color: BLACK,
    bold: weight === 700,
    italic: false,
    underline: false,
  };
  await engine.call("addPageText", {
    docId,
    pageIndex: 0,
    ...PLACEMENT,
    ids: ["vietnamese"],
    runs: [{ runs: [run] }],
  }).promise;
  const { bytes: saved } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
  console.info(`Inter ${weight}: ${saved.byteLength} bytes`);
  const reopened = await engine.call("open", { source: { bytes: saved } }).promise;
  expect((await texts(reopened.docId)).at(-1)).toBe(text);

  const target = { docId: reopened.docId, pageIndex: 0 };
  const documentFont = (await engine.call("getPageFonts", target).promise).find(({ name }) => name.includes("Inter"));
  expect(documentFont).toBeDefined();
  if (!documentFont || run.font?.kind !== "embedded") throw new Error("Inter was not embedded.");
  const reference = { ...run.font, name: documentFont.name, documentFontId: documentFont.id };
  // The reopened document has no registered fallback. This commit must borrow its existing font.
  await engine.call("addPageText", {
    ...target,
    ...PLACEMENT,
    origin: { x: 72, y: 450 },
    ids: ["borrowed"],
    runs: [{ runs: [{ ...run, font: reference }] }],
  }).promise;
  const savedAgain = await saveAndReopen(reopened.docId);
  expect((await texts(savedAgain)).slice(-2)).toEqual([text, text]);
  await engine.call("close", { docId: savedAgain }).promise;
  await engine.call("close", { docId: reopened.docId }).promise;
  await engine.call("close", { docId }).promise;
});

it("edits Vietnamese and preserves its combining characters after saving", async () => {
  const docId = await openText();
  const at = { docId, pageIndex: 0 };
  const [line] = await engine.call("getTextObjects", at).promise;
  const bytes = await Bun.file(new URL("../../../ui/src/assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const fontId = "edit-inter";
  await engine.call("registerTextFont", { docId, fontId, bytes }, [bytes]).promise;
  const text = "Tiếng Việt rất đẹp, ở ngoài khơi.".normalize("NFD");
  const font = { kind: "embedded", fontId, name: "Inter", weight: 400, italic: false } as const;
  await engine.call("editPageText", {
    ...at,
    id: line!.id,
    editId: "vietnamese-edit",
    runs: [{ ...line!.runs![0]!, text, font }],
  }).promise;
  const saved = await saveAndReopen(docId);
  expect((await texts(saved))[0]).toBe(text);
  await engine.call("close", { docId: saved }).promise;
  await engine.call("close", { docId }).promise;
});

it("only requests a fallback when the standard face cannot encode the draft", async () => {
  const docId = await openText();
  const at = { docId, pageIndex: 0, includeFallback: true };
  try {
    expect(await engine.call("checkPageTextFont", { ...at, run: { ...COURIER_RUN, text: "ABC" } }).promise).toEqual({});
    expect(
      await engine.call("checkPageTextFont", { ...at, run: { ...COURIER_RUN, text: "Tiếng Việt" } }).promise,
    ).toEqual({ needsFallback: true });
  } finally {
    await engine.call("close", { docId }).promise;
  }
});

it("reports the first missing glyph and falls back from a document subset", async () => {
  const docId = await openText();
  const at = { docId, pageIndex: 0 };
  const bytes = await Bun.file(new URL("../../../ui/src/assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const fontId = "subset-inter";
  await engine.call("registerTextFont", { docId, fontId, bytes }, [bytes]).promise;
  const font = { kind: "embedded", fontId, name: "Inter", weight: 400, italic: false } as const;
  const run = { ...COURIER_RUN, font, text: "ABC", bold: false, italic: false, underline: false };
  await engine.call("addPageText", { ...at, ...PLACEMENT, ids: ["subset"], runs: [{ runs: [run] }] }).promise;
  const saved = await saveAndReopen(docId);
  const target = { docId: saved, pageIndex: 0 };
  const line = (await engine.call("getTextObjects", target).promise).at(-1)!;
  const eligible = { ...line.runs![0]!, text: "CAB" };
  expect(await engine.call("checkPageTextFont", { ...target, run: eligible }).promise).toEqual({});
  const committed = await engine.call("editPageText", {
    ...target,
    id: line.id,
    editId: "borrow-subset",
    runs: [eligible],
  }).promise;
  expect(committed).toEqual({});
  const borrowed = (await engine.call("getTextObjects", target).promise).at(-1)!;
  expect(borrowed.runs?.[0]?.font).toEqual(line.runs![0]!.font);
  await engine.call("togglePageTextEdit", { ...target, editId: "borrow-subset", applied: false }).promise;
  const changed = { ...line.runs![0]!, text: "ABZQ" };
  expect(await engine.call("checkPageTextFont", { ...target, run: changed }).promise).toEqual({
    missingCharacter: "Z",
  });
  const result = await engine.call("editPageText", {
    ...target,
    id: line.id,
    editId: "subset-edit",
    runs: [changed],
  }).promise;
  expect(result.missingCharacter).toBe("Z");
  const [edited] = (await engine.call("getTextObjects", target).promise).slice(-1);
  expect(edited?.text).toBe("ABZQ");
  expect(edited?.runs?.[0]?.font).toMatchObject({ name: "Helvetica" });
  await engine.call("close", { docId: saved }).promise;
  await engine.call("close", { docId }).promise;
});

it("cancels pending renders of the edited page and completes renders of other pages", async () => {
  const { docId } = await engine.call("open", { source: { bytes: corpusFile("three-pages.pdf") } }).promise;
  const at = { docId, pageIndex: 0 };
  await engine.call("addPageText", {
    ...at,
    ...PLACEMENT,
    runs: [{ runs: [{ ...COURIER_RUN, text: "Original", underline: false }] }],
    ids: ["render"],
  }).promise;
  const [line] = await engine.call("getTextObjects", at).promise;
  const render = { ...at, width: 48, height: 64 };
  const stale = engine.call("renderPage", render).promise;
  const separate = engine.call("renderPage", { ...render, pageIndex: 1 }).promise;
  const edit = engine.call("editPageText", {
    ...at,
    id: line!.id,
    editId: "render-edit",
    runs: [{ ...line!.runs![0]!, text: "New tide tables" }],
  }).promise;
  const fresh = engine.call("renderPage", render).promise;
  await expect(stale).rejects.toMatchObject({ detail: { code: "cancelled" } });
  expect((await separate).width).toBe(48);
  await edit;
  expect((await fresh).width).toBe(48);
  expect((await texts(docId))[0]).toBe("New tide tables");
  await engine.call("close", { docId }).promise;
});

it("reopens a line with both its original run and the newly inserted run", async () => {
  const docId = await openText();
  const at = { docId, pageIndex: 0 };
  const line = await objectAt(docId, FIRST_LINE);
  const accent = { ...COURIER_RUN, text: "!", fontSize: 24 };
  await engine.call("editPageText", {
    ...at,
    id: line.id,
    editId: "append",
    runs: [...line.runs!, accent],
  }).promise;
  const saved = await saveAndReopen(docId);
  const reopened = await objectAt(saved, FIRST_LINE);
  expect(reopened.text).toBe(line.text + "!");
  expect(reopened.runs?.map(({ underline }) => underline)).toEqual([false, true]);
  await engine.call("close", { docId: saved }).promise;
  await engine.call("close", { docId }).promise;
});
