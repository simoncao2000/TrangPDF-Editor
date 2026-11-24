/** Comments and replies end to end: EngineClient → engine host → real PDFium. */
import { beforeAll, describe, expect, it } from "bun:test";
import { inflateSync } from "node:zlib";
import { isEditable, type Annotation, type HighlightAnnotation } from "../annotations/annotation";
import {
  commentText,
  plainComment,
  PLAIN_COMMENT_STYLE,
  type CommentNote,
  type CommentReply,
} from "../annotations/comment";
import { setComment } from "../annotations/comment-commands";
import type { CommandEngine } from "../document/commands";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import { encodeComment, isRichCommentTooLarge, MAX_COMMENT_XHTML } from "./comment-xhtml";
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
  comment: {
    body: plainComment("Add today's tide times."),
    author: "Simon",
    modified: "2026-11-21T09:05:07.000Z",
  },
};
const REPLY: CommentReply = {
  id: "re-1",
  body: [{ ...PLAIN_COMMENT_STYLE, italic: true, ink: "teal", text: "High tide is 11:42." }],
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
    const edited = { ...REPLY, body: plainComment("High tide is 11:45.") };
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

  it("keeps formatting in the comment and its reply in the saved file", async () => {
    const docId = await openWithHighlight();
    await engine.call("putReply", { docId, pageIndex: 0, parentId: "hl-1", reply: REPLY }).promise;
    const comment = {
      ...HIGHLIGHT.comment!,
      body: [{ ...PLAIN_COMMENT_STYLE, bold: true, underline: true, ink: "moss", text: "Tide times\nToday" }],
    } satisfies CommentNote;
    await engine.call("putAnnotation", {
      docId,
      pageIndex: 0,
      editComment: true,
      annotation: { ...HIGHLIGHT, comment },
    }).promise;
    const [preview] = await engine.call("getAnnotations", { docId, pageIndex: 0, plainOnly: true }).promise;
    expect(preview?.comment?.body).toEqual(plainComment("Tide times\nToday"));
    expect(preview?.replies?.[0]?.body).toEqual(plainComment(commentText(REPLY.body)));
    const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
    const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
    const [highlight, ...rest] = await list(reopened);
    expect(rest).toHaveLength(0);
    expect(highlight).toMatchObject({ comment, replies: [REPLY] });
    const saved = new TextDecoder().decode(bytes);
    expect(saved).toMatch(/\/Contents\s*\(Tide times\\nToday\)/);
    expect(saved).toContain("<b>Tide times<br/>Today</b>");
    expect(saved).toContain("<i>High tide is 11:42.</i>");
  });
});

/**
 * Creates a PDF note with external rich content, including an unsupported style.
 * @param rich A PDF dictionary value or absence of a rich comment.
 * @param stream The XHTML for an indirect rich content stream, when used.
 * @returns A minimal, cross-referenced PDF.
 */
function externalNote(rich: string, stream?: string, markup = false): ArrayBuffer {
  const subtype = markup ? "Highlight /QuadPoints [10 30 30 30 10 10 30 10]" : "Text";
  const replyReference = markup ? " 6 0 R" : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R${replyReference}] >>`,
    `<< /Type /Annot /Subtype /${subtype} /Rect [10 10 30 30] /T (Pat) /M (D:20261121090507Z)
      /Contents (Plain fallback) ${rich} >>`,
  ];
  if (stream !== undefined) objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  else if (markup) objects.push("null");
  if (markup) {
    objects.push("<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /IRT 4 0 R /F 32 /Contents (External reply) >>");
  }
  let pdf = "%PDF-1.7\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, "0") + " 00000 n \n";
  });
  const xref = pdf.length;
  const size = objects.length + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size ${size} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf).buffer;
}

it("preserves foreign comment strings and streams, and reply links, when markup quad counts change", async () => {
  const rich = '<body><p><b>External</b><span style="font-size:32pt"> note</span></p></body>';
  for (const streamed of [false, true]) {
    const bytes = externalNote(streamed ? "/RC 5 0 R" : `/RC (${rich})`, streamed ? rich : undefined, true);
    const { docId } = await engine.call("open", { source: { bytes } }).promise;
    const at = { docId, pageIndex: 0 };
    const [before] = await list(docId);
    if (before?.kind !== "highlight") throw new Error("Expected a highlight.");
    const lines = [...before.lines, { x: 15, y: 35, width: 20, height: 10 }];
    const annotation = { ...before, lines, rect: { x: 10, y: 10, width: 25, height: 35 } };
    await engine.call("putAnnotation", { ...at, annotation }).promise;
    const [grown] = await list(docId);
    expect(grown).toMatchObject({ lines, comment: before.comment, replies: before.replies });
    const shrink = engine.call("putAnnotation", { ...at, annotation: before }).promise;
    await expect(shrink).rejects.toMatchObject({ detail: { code: "annotation-failed" } });
    expect(await list(docId)).toEqual([grown!]);

    const saved = await engine.call("assemble", { parts: [{ ...at, rotation: 0 }] }).promise;
    const pdf = Buffer.from(saved.bytes);
    const raw = pdf.toString("latin1");
    expect(raw).toMatch(/\/Contents\s*\(Plain fallback\)/);
    if (streamed) {
      const streamObject = raw.match(/\/RC\s+(\d+) 0 R/)?.[1];
      expect(streamObject).toBeDefined();
      const streamHeader = "stream\r\n";
      const streamAt = pdf.indexOf(streamHeader, pdf.indexOf(`\r\n${streamObject} 0 obj`));
      expect(streamAt).toBeGreaterThan(0);
      const start = streamAt + streamHeader.length;
      expect(inflateSync(pdf.subarray(start, pdf.indexOf("\r\nendstream", start))).toString()).toBe(rich);
    } else {
      expect(raw).toContain(rich);
    }
    const reopened = (await engine.call("open", { source: { bytes: saved.bytes } }).promise).docId;
    const [highlight] = await list(reopened);
    expect(highlight).toMatchObject({ lines, comment: before.comment });
    expect(highlight?.replies?.map(({ body }) => body)).toEqual([plainComment("External reply")]);
    await engine.call("close", { docId }).promise;
    await engine.call("close", { docId: reopened }).promise;
  }
});

it("recreates markup without comments or replies when removing a quad", async () => {
  const { docId } = await engine.call("open", { source: { bytes: corpusFile("text.pdf") } }).promise;
  const at = { docId, pageIndex: 0 };
  const annotation = { ...HIGHLIGHT, comment: undefined };
  const lines = [...annotation.lines, { x: 72, y: 664, width: 100, height: 26 }];
  await engine.call("putAnnotation", { ...at, annotation: { ...annotation, lines } }).promise;
  await engine.call("putReply", { ...at, parentId: annotation.id, reply: REPLY }).promise;
  await engine.call("removeAnnotation", { ...at, id: REPLY.id }).promise;
  await expect(engine.call("putAnnotation", { ...at, annotation }).promise).rejects.toMatchObject({
    detail: { code: "annotation-failed" },
  });
  const { bytes } = await engine.call("assemble", { parts: [{ ...at, rotation: 0 }] }).promise;
  const reopened = (await engine.call("open", { source: { bytes } }).promise).docId;
  await engine.call("putAnnotation", { docId: reopened, pageIndex: 0, annotation }).promise;
  const annotations = await list(reopened);
  expect(annotations).toHaveLength(1);
  expect(annotations[0]).toMatchObject({ lines: annotation.lines });
  await engine.call("close", { docId }).promise;
  await engine.call("close", { docId: reopened }).promise;
});

it("rejects rich fields over the read limit before changing annotations or replies", async () => {
  const docId = await openWithHighlight();
  const at = { docId, pageIndex: 0 };
  const note = HIGHLIGHT.comment!;
  const style = { ...PLAIN_COMMENT_STYLE, bold: true, underline: true, ink: "teal" } as const;
  const body = [{ ...style, text: "&".repeat(14_000) }];
  expect(isRichCommentTooLarge(body)).toBe(true);
  const failure = { detail: { code: "rich-comment-too-large" } };
  await expect(
    engine.call("putAnnotation", {
      ...at,
      editComment: true,
      annotation: { ...HIGHLIGHT, comment: { ...note, body } },
    }).promise,
  ).rejects.toMatchObject(failure);
  await expect(
    engine.call("putAnnotation", {
      ...at,
      annotation: { ...HIGHLIGHT, id: "oversized", comment: { ...note, body } },
    }).promise,
  ).rejects.toMatchObject(failure);
  await expect(
    engine.call("putReply", {
      ...at,
      parentId: HIGHLIGHT.id,
      reply: { ...REPLY, body },
    }).promise,
  ).rejects.toMatchObject(failure);
  const [unchanged, ...extra] = await list(docId);
  expect(extra).toHaveLength(0);
  expect(unchanged?.comment).toEqual(note);
  expect(unchanged?.replies).toBeUndefined();

  const overhead = encodeComment([{ ...style, text: "x" }]).rich.length - 1;
  const fieldSpace = MAX_COMMENT_XHTML - overhead;
  const text = "&".repeat(Math.floor(fieldSpace / 5)) + "x".repeat(fieldSpace % 5);
  const boundary = [{ ...style, text }];
  expect(encodeComment(boundary).rich.length).toBe(MAX_COMMENT_XHTML);
  await engine.call("putReply", { ...at, parentId: HIGHLIGHT.id, reply: { ...REPLY, body: boundary } }).promise;
  expect((await list(docId))[0]?.replies?.[0]?.body).toEqual(boundary);
  expect(isRichCommentTooLarge([{ ...style, text: text + "x" }])).toBe(true);

  const plain = plainComment("&".repeat(MAX_COMMENT_XHTML + 1));
  await engine.call("putAnnotation", {
    ...at,
    editComment: true,
    annotation: { ...HIGHLIGHT, comment: { ...note, body: plain } },
  }).promise;
  expect((await list(docId))[0]?.comment?.body).toEqual(plain);
  await engine.call("close", { docId }).promise;
});

it("leaves externally authored /RC and /Contents as stored after list and save", async () => {
  const rich = '<body><p><span style="font-size:23pt"><b>Rich</b> text</span></p></body>';
  const bytes = externalNote(`/RC (${rich})`);
  const { docId } = await engine.call("open", { source: { bytes } }).promise;
  const [note] = await list(docId);
  expect(note?.comment?.body).toEqual([{ ...PLAIN_COMMENT_STYLE, bold: true, text: "Rich" }, ...plainComment(" text")]);
  const parts = [{ docId, pageIndex: 0, rotation: 0 as const }];
  const saved = await engine.call("assemble", { parts }).promise;
  const pdf = new TextDecoder().decode(saved.bytes);
  expect(pdf).toContain(rich);
  expect(pdf).not.toMatch(/\/NM\b/);
  expect(pdf).toMatch(/\/Contents\s*\(Plain fallback\)/);
  if (!note || !isEditable(note)) throw new Error("Expected an editable note.");
  await engine.call("putAnnotation", {
    docId,
    pageIndex: 0,
    annotation: { ...note, rect: { ...note.rect, x: 40 } },
  }).promise;
  const moved = await engine.call("assemble", { parts }).promise;
  const movedPdf = new TextDecoder().decode(moved.bytes);
  expect(movedPdf).toContain(rich);
  expect(movedPdf).toMatch(/\/Contents\s*\(Plain fallback\)/);
});

it("preserves third-party rich content streams when PDFium can only read the plain copy", async () => {
  const rich = "<body><p><i>Streamed</i> comment</p></body>";
  const bytes = externalNote("/RC 5 0 R", rich);
  const { docId } = await engine.call("open", { source: { bytes } }).promise;
  const [note] = await list(docId);
  expect(note?.comment?.body).toEqual(plainComment("Plain fallback"));
  const saved = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
  const pdf = Buffer.from(saved.bytes);
  expect(pdf.toString("latin1")).toMatch(/\/RC 5 0 R/);
  const beforeStream = pdf.indexOf("stream\r\n", pdf.indexOf("5 0 obj"));
  expect(beforeStream).toBeGreaterThan(0);
  const start = beforeStream + "stream\r\n".length;
  const end = pdf.indexOf("\r\nendstream", start);
  expect(inflateSync(pdf.subarray(start, end)).toString()).toBe(rich);
  await engine.call("close", { docId }).promise;
});

it("loads external plain comments and falls back for oversized or malformed /RC", async () => {
  for (const rich of ["", "/RC (<b>unclosed)", `/RC (<p>${"X".repeat(65_536)}</p>)`]) {
    const { docId } = await engine.call("open", { source: { bytes: externalNote(rich) } }).promise;
    const [note] = await list(docId);
    expect(note?.comment?.body).toEqual(plainComment("Plain fallback"));
    await engine.call("close", { docId }).promise;
  }
});

it("undoes and redoes a formatting change in both the model and the saved /RC", async () => {
  const docId = await openWithHighlight();
  const pageId = "a:0";
  const geometry = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 as const };
  const content = {
    sources: { a: { id: "a", name: "text.pdf", docId, pages: [geometry], pageCount: 1 } },
    pages: [{ id: pageId, source: "a", sourceIndex: 0, rotation: 0 as const }],
    annotationRevisions: {},
  };
  const call: CommandEngine = (method, params) => engine.call(method, params).promise;
  const original = { ...HIGHLIGHT.comment!, body: [{ ...HIGHLIGHT.comment!.body[0]!, bold: true }] };
  const annotation = { ...HIGHLIGHT, comment: original };
  await engine.call("putAnnotation", { docId, pageIndex: 0, annotation, editComment: true }).promise;
  const edited = { ...original, body: [{ ...original.body[0]!, bold: false, italic: true }] };
  const command = setComment(content, pageId, annotation, edited);
  await command.applyInEngine?.(call);
  expect((await list(docId))[0]?.comment).toEqual(edited);
  await command.undoInEngine?.(call);
  expect((await list(docId))[0]?.comment).toEqual(original);
  const { bytes } = await engine.call("assemble", { parts: [{ docId, pageIndex: 0, rotation: 0 }] }).promise;
  const pdf = new TextDecoder().decode(bytes);
  expect(pdf).toContain("<b>Add today&apos;s tide times.</b>");
  expect(pdf).not.toContain("<i>Add today&apos;s tide times.</i>");
  await command.applyInEngine?.(call);
  expect((await list(docId))[0]?.comment).toEqual(edited);

  await engine.call("putAnnotation", { docId, pageIndex: 0, annotation: HIGHLIGHT, editComment: true }).promise;
  expect((await list(docId))[0]?.comment).toEqual(HIGHLIGHT.comment);
});
