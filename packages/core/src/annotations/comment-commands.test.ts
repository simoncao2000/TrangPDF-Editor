import { describe, expect, it } from "bun:test";
import type { CommandEngine } from "../document/commands";
import type { DocumentContent } from "../document/document-state";
import type { SquareAnnotation } from "./annotation";
import { deleteAnnotations } from "./annotation-commands";
import { commentText, plainComment, type CommentNote, type CommentReply } from "./comment";
import { deleteReply, editReply, replyTo, setComment } from "./comment-commands";

const LETTER = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 as const };
const content: DocumentContent = {
  sources: { a: { id: "a", name: "a.pdf", pageCount: 1, pages: [LETTER], docId: "doc-a" } },
  pages: [{ id: "a:0", source: "a", sourceIndex: 0, rotation: 0 }],
  annotationRevisions: {},
};
const square: SquareAnnotation = {
  kind: "square",
  id: "sq",
  rect: { x: 10, y: 10, width: 50, height: 50 },
  color: { r: 255, g: 0, b: 0 },
  opacity: 1,
  lineWidth: 2,
};
const reply: CommentReply = {
  id: "re",
  body: plainComment("Agreed"),
  author: "Linh",
  modified: "2026-11-21T09:00:00.000Z",
};

/**
 * A fake engine that records each call's method and the part of its parameters that matters here.
 * @returns The call function and the log.
 */
function recordingEngine(): { call: CommandEngine; log: string[] } {
  const log: string[] = [];
  const call: CommandEngine = (method, params) => {
    const p = params as Record<string, unknown>;
    const comment = (p.annotation as { comment?: CommentNote } | undefined)?.comment;
    const body = comment?.body ?? (p.reply as CommentReply | undefined)?.body ?? [];
    log.push([method, p.id ?? p.parentId ?? "", commentText(body)].filter(Boolean).join(" "));
    return Promise.resolve(null as never);
  };
  return { call, log };
}

/**
 * Runs a command's engine work forwards then backwards.
 * @param command The command.
 * @param command.applyInEngine Its apply work.
 * @param command.undoInEngine Its undo work.
 * @returns The calls made.
 */
async function applyThenUndo(command: {
  applyInEngine?: (engine: CommandEngine) => Promise<unknown>;
  undoInEngine?: (engine: CommandEngine) => Promise<unknown>;
}): Promise<string[]> {
  const { call, log } = recordingEngine();
  await command.applyInEngine?.(call);
  await command.undoInEngine?.(call);
  return log;
}

describe("comment commands", () => {
  it("writes a comment on a markup, and clears it again on undo when it had none", async () => {
    const command = setComment(content, "a:0", square, {
      body: plainComment("Too wide"),
      author: "Simon",
      modified: null,
    });
    expect(command.label).toBe("Comment");
    expect(await applyThenUndo(command)).toEqual(["putAnnotation Too wide", "putAnnotation"]);
  });

  it("puts back the earlier comment on undo of an edit", async () => {
    const commented = { ...square, comment: { body: plainComment("Old"), author: "Simon", modified: null } };
    const command = setComment(content, "a:0", commented, {
      body: plainComment("New"),
      author: "Simon",
      modified: null,
    });
    expect(command.label).toBe("Edit comment");
    expect(await applyThenUndo(command)).toEqual(["putAnnotation New", "putAnnotation Old"]);
  });

  it("adds, edits and deletes replies, each undoable", async () => {
    expect(await applyThenUndo(replyTo(content, "a:0", "sq", reply))).toEqual([
      "putReply sq Agreed",
      "removeAnnotation re",
    ]);
    const edited = { ...reply, body: plainComment("Agreed!") };
    expect(await applyThenUndo(editReply(content, "a:0", "sq", { before: reply, after: edited }))).toEqual([
      "putReply sq Agreed!",
      "putReply sq Agreed",
    ]);
    expect(await applyThenUndo(deleteReply(content, "a:0", reply))).toEqual([
      "removeAnnotation re",
      "restoreAnnotation re",
    ]);
  });

  it("deletes a markup's replies with it, and brings them back with it", async () => {
    const withReply = { ...square, replies: [reply] };
    expect(await applyThenUndo(deleteAnnotations(content, "a:0", [withReply]))).toEqual([
      "removeAnnotation sq",
      "removeAnnotation re",
      "restoreAnnotation sq",
      "restoreAnnotation re",
    ]);
  });
});
