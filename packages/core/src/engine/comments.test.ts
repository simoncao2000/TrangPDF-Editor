/** Comments and replies end to end: EngineClient → engine host → real PDFium. */
import { beforeAll, describe, expect, it } from "bun:test";
import type { Annotation, HighlightAnnotation } from "../annotations/annotation";
import type { CommentReply } from "../annotations/comment";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/** A highlight over "Tide tables for the headland" in text.pdf, with a comment. */
const HIGHLIGHT: HighlightAnnotation = {
  kind: "highlight",
  id: "hl-1",
  rect: { x: 72, y: 694, width: 330, height: 26 },
  lines: [{ x: 72, y: 694, width: 330, height: 26 }],
  color: { r: 244, g: 217, b: 126 },
  opacity: 0.7,
  comment: { text: "Add today's tide times.", author: "Simon", modified: "2026-11-21T09:05:07.000Z" },
};
const REPLY: CommentReply = {
  id: "re-1",
  text: "High tide is 11:42.",
  author: "Linh",
  modified: "2026-11-21T09:10:00.000Z",
};

/**
 * Opens text.pdf with the commented highlight on page 1.
 * @returns Its docId.
 */
async function openWithHighlight(): Promise<string> {
  const docId = (await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise).docId;
  await engine.call("putAnnotation", { docId, pageIndex: 0, annotation: HIGHLIGHT }).promise;
  return docId;
}

/**
 * Lists page 1's annotations.
 * @param docId An open document.
 * @returns The annotations.
 */
function list(docId: string): Promise<Annotation[]> {
  return engine.call("getAnnotations", { docId, pageIndex: 0 }).promise;
}

describe("comments", () => {
  it("writes a comment on a markup and reads it back, with the text the highlight covers", async () => {
    const [highlight] = await list(await openWithHighlight());
    expect(highlight).toMatchObject({ id: "hl-1", comment: HIGHLIGHT.comment, quote: "Tide tables for the headland" });
  });

  it("adds a reply to the thread, never as an annotation of its own and never drawn", async () => {
    const docId = await openWithHighlight();
    const before = (await engine.call("renderPage", { docId, pageIndex: 0, width: 306, height: 396 }).promise).bitmap;
    await engine.call("putReply", { docId, pageIndex: 0, parentId: "hl-1", reply: REPLY }).promise;
    const annotations = await list(docId);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]!.replies).toEqual([REPLY]);
    const after = (await engine.call("renderPage", { docId, pageIndex: 0, width: 306, height: 396 }).promise).bitmap;
    expect((after as unknown as FakeBitmap).pixels).toEqual((before as unknown as FakeBitmap).pixels);
  });

  it("edits, removes and restores a reply", async () => {
    const docId = await openWithHighlight();
    await engine.call("putReply", { docId, pageIndex: 0, parentId: "hl-1", reply: REPLY }).promise;
    const edited = { ...REPLY, text: "High tide is 11:45." };
    await engine.call("putReply", { docId, pageIndex: 0, parentId: "hl-1", reply: edited }).promise;
    expect((await list(docId))[0]!.replies).toEqual([edited]);
    await engine.call("removeAnnotation", { docId, pageIndex: 0, id: REPLY.id }).promise;
    expect((await list(docId))[0]!.replies).toBeUndefined();
    await engine.call("restoreAnnotation", { docId, pageIndex: 0, id: REPLY.id }).promise;
    expect((await list(docId))[0]!.replies).toEqual([edited]);
  });

  it("refuses a reply to an annotation that is not there", async () => {
    const docId = await openWithHighlight();
    const reply = engine.call("putReply", { docId, pageIndex: 0, parentId: "nope", reply: REPLY }).promise;
    const error = await reply.catch((e: unknown) => e);
    expect((error as { detail: { code: string } }).detail.code).toBe("unknown-annotation");
  });

  it("keeps the comment and its replies in the saved file", async () => {
    const docId = await openWithHighlight();
    await engine.call("putReply", { docId, pageIndex: 0, parentId: "hl-1", reply: REPLY }).promise;
    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
    const [highlight, ...rest] = await list(reopened);
    expect(rest).toHaveLength(0);
    expect(highlight).toMatchObject({ comment: HIGHLIGHT.comment, replies: [REPLY] });
  });
});
