/** Text selection geometry through the engine, on a page with two lines of Helvetica. */
import { beforeAll, describe, expect, it } from "bun:test";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;
let docId: string;

beforeAll(async () => {
  engine = await createTestEngine();
  docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
});

describe("getTextRects", () => {
  it("gives one rectangle per line between two points", async () => {
    // Line 1 starts at (72, 700), line 2 at (72, 670); both 24 pt Helvetica.
    const lines = await engine.call("getTextRects", {
      docId,
      pageIndex: 0,
      from: { x: 73, y: 708 },
      to: { x: 150, y: 678 },
    }).promise;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.x).toBeCloseTo(72, 0);
    expect(lines[0]!.y).toBeGreaterThan(lines[1]!.y);
    expect(lines[1]!.x + lines[1]!.width).toBeLessThan(160); // stops at the end point
  });

  it("works when dragged backwards", async () => {
    const forwards = await engine.call("getTextRects", {
      docId,
      pageIndex: 0,
      from: { x: 73, y: 708 },
      to: { x: 150, y: 678 },
    }).promise;
    const backwards = await engine.call("getTextRects", {
      docId,
      pageIndex: 0,
      from: { x: 150, y: 678 },
      to: { x: 73, y: 708 },
    }).promise;
    expect(backwards).toEqual(forwards);
  });

  it("finds nothing away from the text", async () => {
    expect(
      await engine.call("getTextRects", { docId, pageIndex: 0, from: { x: 300, y: 300 }, to: { x: 400, y: 200 } })
        .promise,
    ).toEqual([]);
  });
});

describe("getTextSelection", () => {
  it("gives the selected characters with their line rectangles, lines ending in a line break", async () => {
    const engine = await createTestEngine();
    const docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
    const selection = await engine.call("getTextSelection", {
      docId,
      pageIndex: 0,
      from: { x: 74, y: 708 },
      to: { x: 140, y: 678 },
    }).promise;
    expect(selection.rects).toHaveLength(2);
    expect(selection.text.startsWith("Tide tables for the headland\n")).toBe(true);
    expect(selection.text.split("\n")[1]?.startsWith("Che")).toBe(true);
  });
});
