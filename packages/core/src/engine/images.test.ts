/** Images end to end: a PNG placed as a stamp, moved, kept through a save, and drawn by PDFium. */
import { beforeAll, describe, expect, it } from "bun:test";
import type { ImageAnnotation } from "../annotations/annotation";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/** An 8 × 8 red PNG. */
const RED_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGO4IyLyHx9mGBkKAFrGgMFixwLpAAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
).buffer;

/**
 * Counts red pixels on page 1 of a document.
 * @param docId An open document.
 * @returns How many pixels are clearly red.
 */
async function redPixels(docId: string): Promise<number> {
  const page = (await engine.call("renderPage", { docId, pageIndex: 0, width: 612, height: 792 }).promise)
    .bitmap as unknown as FakeBitmap;
  let red = 0;
  for (let i = 0; i < page.pixels.length; i += 4) if (page.pixels[i]! > 200 && page.pixels[i + 1]! < 60) red++;
  return red;
}

describe("images", () => {
  it("places a PNG, moves it, and keeps it through a save", async () => {
    const docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
    const image: ImageAnnotation = {
      kind: "image",
      id: "img",
      rect: { x: 100, y: 100, width: 200, height: 100 },
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      image: { bytes: RED_PNG, format: "png" },
    };
    await engine.call("putAnnotation", { docId, pageIndex: 0, annotation: image }).promise;
    expect(await redPixels(docId)).toBe(200 * 100);
    const [read] = await engine.call("getAnnotations", { docId, pageIndex: 0 }).promise;
    expect(read).toMatchObject({ kind: "image", id: "img", rect: image.rect });

    const moved = { ...image, image: undefined, rect: { x: 300, y: 400, width: 100, height: 50 } };
    await engine.call("putAnnotation", { docId, pageIndex: 0, annotation: moved }).promise;
    expect(await redPixels(docId)).toBe(100 * 50);

    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
    expect(await redPixels(reopened)).toBe(100 * 50);
  });
});
