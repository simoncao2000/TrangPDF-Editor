/** Finding text across pages through the engine. */
import { beforeAll, describe, expect, it } from "bun:test";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;
let docId: string;

beforeAll(async () => {
  engine = await createTestEngine();
  docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
});

describe("findText", () => {
  it("finds every match, case-insensitively, with where it is and the words around it", async () => {
    const hits = await engine.call("findText", { docId, pageIndexes: [0], query: "the", limit: 50 }).promise;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ pageIndex: 0, snippet: { before: "Tide tables for ", match: "the" } });
    expect(hits[0]!.snippet.after.startsWith(" headland")).toBe(true);
    expect(hits[0]!.rects).toHaveLength(1);
    expect(hits[0]!.rects[0]!.y).toBeGreaterThan(690);

    const walk = await engine.call("findText", { docId, pageIndexes: [0], query: "WALK", limit: 50 }).promise;
    expect(walk.map((hit) => hit.snippet.match)).toEqual(["walk"]);
  });

  it("stops at the limit and finds nothing for text that is not there", async () => {
    expect(await engine.call("findText", { docId, pageIndexes: [0], query: "e", limit: 2 }).promise).toHaveLength(2);
    expect(await engine.call("findText", { docId, pageIndexes: [0], query: "harbour", limit: 50 }).promise).toEqual([]);
    expect(await engine.call("findText", { docId, pageIndexes: [0], query: "  ", limit: 50 }).promise).toEqual([]);
  });
});
