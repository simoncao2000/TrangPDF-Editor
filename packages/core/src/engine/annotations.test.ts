/** Annotation calls end to end: EngineClient → engine host → real PDFium. */
import { beforeAll, describe, expect, it } from "bun:test";
import type { Annotation, EditableAnnotation, HighlightAnnotation } from "../annotations/annotation";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import { EngineCallError, type EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/**
 * Opens a corpus file.
 * @param name Corpus file name.
 * @returns Its docId.
 */
async function open(name: string): Promise<string> {
  return (await engine.call("open", { source: { bytes: corpusFile(name) } }).promise).docId;
}

/**
 * Lists the annotations on a page.
 * @param docId An open document.
 * @param pageIndex The page.
 * @returns The annotations.
 */
function list(docId: string, pageIndex = 0): Promise<Annotation[]> {
  return engine.call("getAnnotations", { docId, pageIndex }).promise;
}

/**
 * Writes an annotation on page 1.
 * @param docId An open document.
 * @param annotation The annotation.
 * @returns It as stored.
 */
function put(docId: string, annotation: EditableAnnotation): Promise<Annotation> {
  return engine.call("putAnnotation", { docId, pageIndex: 0, annotation }).promise;
}

const highlight: HighlightAnnotation = {
  kind: "highlight",
  id: "hl-1",
  rect: { x: 72, y: 648, width: 200, height: 20 },
  color: { r: 255, g: 220, b: 0 },
  opacity: 0.5,
  lines: [{ x: 72, y: 648, width: 200, height: 20 }],
};

describe("annotations", () => {
  it("writes a highlight and reads it back", async () => {
    const docId = await open("three-pages.pdf");
    await put(docId, highlight);
    const [stored] = await list(docId);
    expect(stored).toMatchObject({ kind: "highlight", id: "hl-1", color: { r: 255, g: 220, b: 0 }, lines: [{ x: 72, y: 648, width: 200, height: 20 }] });
    expect(stored!.opacity).toBeCloseTo(0.5, 1);
  });

  it("writes ink, rectangles and text boxes", async () => {
    const docId = await open("three-pages.pdf");
    const black = { r: 0, g: 0, b: 0 };
    await put(docId, {
      kind: "ink",
      id: "ink-1",
      rect: { x: 100, y: 400, width: 100, height: 100 },
      color: black,
      opacity: 1,
      lineWidth: 3,
      strokes: [
        [
          { x: 100, y: 400 },
          { x: 150, y: 500 },
          { x: 200, y: 400 },
        ],
      ],
    });
    await put(docId, { kind: "square", id: "sq-1", rect: { x: 300, y: 200, width: 100, height: 100 }, color: { r: 255, g: 0, b: 0 }, opacity: 1, lineWidth: 2 });
    await put(docId, { kind: "textBox", id: "tb-1", rect: { x: 72, y: 100, width: 228, height: 50 }, color: { r: 0, g: 0, b: 255 }, opacity: 1, text: "Check the tide", fontSize: 14 });

    const byId = new Map((await list(docId)).map((annotation) => [annotation.id, annotation]));
    expect(byId.get("ink-1")).toMatchObject({ kind: "ink", lineWidth: 3, strokes: [[{ x: 100, y: 400 }, { x: 150, y: 500 }, { x: 200, y: 400 }]] });
    expect(byId.get("sq-1")).toMatchObject({ kind: "square", lineWidth: 2, color: { r: 255, g: 0, b: 0 }, rect: { x: 300, y: 200, width: 100, height: 100 } });
    expect(byId.get("tb-1")).toMatchObject({ kind: "textBox", text: "Check the tide", fontSize: 14, color: { r: 0, g: 0, b: 255 } });
  });

  it("updates an annotation in place when its id already exists", async () => {
    const docId = await open("three-pages.pdf");
    await put(docId, highlight);
    const moved: HighlightAnnotation = { ...highlight, rect: { ...highlight.rect, y: 600 }, lines: [{ ...highlight.lines[0]!, y: 600 }], color: { r: 0, g: 200, b: 0 } };
    await put(docId, moved);
    const all = await list(docId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ color: { r: 0, g: 200, b: 0 }, lines: [{ y: 600 }] });
  });

  it("removes and restores an annotation", async () => {
    const docId = await open("three-pages.pdf");
    await put(docId, highlight);
    await engine.call("removeAnnotation", { docId, pageIndex: 0, id: "hl-1" }).promise;
    expect(await list(docId)).toEqual([]);
    await engine.call("restoreAnnotation", { docId, pageIndex: 0, id: "hl-1" }).promise;
    expect((await list(docId)).map((annotation) => annotation.id)).toEqual(["hl-1"]);
  });

  it("reports an unknown annotation id", async () => {
    const docId = await open("three-pages.pdf");
    const error = await engine.call("removeAnnotation", { docId, pageIndex: 0, id: "nope" }).promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineCallError);
    expect((error as EngineCallError).detail.code).toBe("unknown-annotation");
  });

  it("names annotations from other apps once, and keeps the names they have", async () => {
    const docId = await open("annotated.pdf");
    const first = await list(docId);
    expect(first.map((annotation) => annotation.kind)).toEqual(["square", "other"]);
    expect(first[1]!.id).toBe("stamp-from-elsewhere");
    expect(first[0]!.id).not.toBe("");
    expect((await list(docId)).map((annotation) => annotation.id)).toEqual(first.map((annotation) => annotation.id));
  });

  it("saves new annotations and drops removed ones", async () => {
    const docId = await open("annotated.pdf");
    const [square] = await list(docId);
    await put(docId, highlight);
    await engine.call("removeAnnotation", { docId, pageIndex: 0, id: square!.id }).promise;

    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const saved = (await engine.call("open", { source: { bytes } }).promise).docId;
    expect((await list(saved)).map((annotation) => annotation.id)).toEqual(["stamp-from-elsewhere", "hl-1"]);

    // The open document still has the removed square, so undo keeps working after a save.
    await engine.call("restoreAnnotation", { docId, pageIndex: 0, id: square!.id }).promise;
    expect(await list(docId)).toHaveLength(3);
  });

  it("can render a page without the annotations the editor draws itself", async () => {
    const docId = await open("three-pages.pdf");
    await put(docId, { ...highlight, color: { r: 255, g: 0, b: 0 }, opacity: 1 });
    // Letter page at 1 px per point: the highlight's centre is at (172, 792 - 658).
    const pixelAt = async (hideEditable: boolean) => {
      const rendered = await engine.call("renderPage", { docId, pageIndex: 0, width: 612, height: 792, hideEditable }).promise;
      const { pixels } = rendered.bitmap as unknown as FakeBitmap;
      const offset = ((792 - 658) * 612 + 172) * 4;
      return [...pixels.slice(offset, offset + 3)];
    };
    expect(await pixelAt(false)).toEqual([255, 0, 0]);
    expect(await pixelAt(true)).toEqual([255, 255, 255]);
    expect(await pixelAt(false)).toEqual([255, 0, 0]); // hiding is only for that render
  });

  it("draws a text box without a border, as the editor shows it", async () => {
    const docId = await open("three-pages.pdf");
    await put(docId, { kind: "textBox", id: "tb", rect: { x: 72, y: 600, width: 228, height: 50 }, color: { r: 0, g: 0, b: 255 }, opacity: 1, text: "Hi", fontSize: 14 });
    const rendered = await engine.call("renderPage", { docId, pageIndex: 0, width: 612, height: 792 }).promise;
    const { pixels } = rendered.bitmap as unknown as FakeBitmap;
    const pixel = (x: number, y: number) => {
      const offset = ((792 - y) * 612 + x) * 4;
      return [...pixels.slice(offset, offset + 3)];
    };
    // Middle of the right edge and of the bottom edge, above the page's own drawing: only paper.
    expect(pixel(299, 625)).toEqual([255, 255, 255]);
    expect(pixel(186, 600)).toEqual([255, 255, 255]);
  });


});
