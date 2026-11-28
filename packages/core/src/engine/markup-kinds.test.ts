/** The full markup set end to end: each kind written, read back, and kept through a save. */
import { beforeAll, describe, expect, it } from "bun:test";
import type { EditableAnnotation } from "../annotations/annotation";
import { corpusFile, createTestEngine } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

const RED = { r: 200, g: 0, b: 0 };
const LINE = { x: 72, y: 694, width: 330, height: 26 };
const KINDS: readonly EditableAnnotation[] = [
  { kind: "underline", id: "u", rect: LINE, lines: [LINE], color: RED, opacity: 1 },
  { kind: "strikeout", id: "k", rect: LINE, lines: [LINE], color: RED, opacity: 1 },
  { kind: "squiggly", id: "q", rect: LINE, lines: [LINE], color: RED, opacity: 1 },
  { kind: "circle", id: "o", rect: { x: 100, y: 300, width: 120, height: 80 }, color: RED, opacity: 1, lineWidth: 2 },
  {
    kind: "line",
    id: "l",
    rect: { x: 300, y: 300, width: 100, height: 50 },
    start: { x: 300, y: 300 },
    end: { x: 400, y: 350 },
    color: RED,
    opacity: 1,
    lineWidth: 2,
  },
  {
    kind: "arrow",
    id: "a",
    rect: { x: 300, y: 400, width: 100, height: 50 },
    start: { x: 300, y: 400 },
    end: { x: 400, y: 450 },
    color: RED,
    opacity: 1,
    lineWidth: 2,
  },
  { kind: "note", id: "n", rect: { x: 500, y: 700, width: 24, height: 24 }, color: RED, opacity: 1 },
];

describe("the full markup set", () => {
  it("writes every kind, reads it back as the same kind, and keeps it through a save", async () => {
    const docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
    for (const annotation of KINDS) await engine.call("putAnnotation", { docId, pageIndex: 0, annotation }).promise;
    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
    const read = await engine.call("getAnnotations", { docId: reopened, pageIndex: 0 }).promise;
    expect(read.map((annotation) => [annotation.id, annotation.kind])).toEqual(KINDS.map((a) => [a.id, a.kind]));
    const arrow = read.find((annotation) => annotation.id === "a");
    expect(arrow).toMatchObject({ start: { x: 300, y: 400 }, end: { x: 400, y: 450 } });
    expect(read.find((annotation) => annotation.id === "u")).toMatchObject({ quote: "Tide tables for the headland" });
  });
});
