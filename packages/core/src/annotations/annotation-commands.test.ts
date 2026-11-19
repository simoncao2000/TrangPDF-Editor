import { describe, expect, it } from "bun:test";
import type { CommandEngine } from "../document/commands";
import { annotationRevisionOf, type DocumentContent } from "../document/document-state";
import { EMPTY_HISTORY, execute, redo, undo } from "../document/history";
import type { InkAnnotation, OtherAnnotation, SquareAnnotation } from "./annotation";
import { addAnnotation, deleteAnnotations, editAnnotation } from "./annotation-commands";

const LETTER = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 as const };

/** Two pages: page "a:1" is page 2 of document "doc-a". */
const content: DocumentContent = {
  sources: { a: { id: "a", name: "a.pdf", pageCount: 2, pages: [LETTER, LETTER], docId: "doc-a" } },
  pages: [
    { id: "a:0", source: "a", sourceIndex: 0, rotation: 0 },
    { id: "a:1", source: "a", sourceIndex: 1, rotation: 0 },
  ],
  annotationRevisions: {},
};

const square: SquareAnnotation = { kind: "square", id: "sq", rect: { x: 10, y: 10, width: 50, height: 50 }, color: { r: 255, g: 0, b: 0 }, opacity: 1, lineWidth: 2 };

/**
 * A fake engine that records every call.
 * @returns The call function and the log.
 */
function recordingEngine(): { call: CommandEngine; log: string[] } {
  const log: string[] = [];
  const call: CommandEngine = (method, params) => {
    const { pageIndex, docId } = params as { pageIndex: number; docId: string };
    const target = "annotation" in params ? (params.annotation as { id: string; rect: { x: number } }) : null;
    const id = target ? `${target.id}@${target.rect.x}` : (params as { id: string }).id;
    log.push(`${method} ${docId}#${pageIndex} ${id}`);
    return Promise.resolve(null as never);
  };
  return { call, log };
}

describe("addAnnotation", () => {
  it("writes the annotation in the engine, and removes it on undo", async () => {
    const { call, log } = recordingEngine();
    const command = addAnnotation(content, "a:1", square);
    await command.applyInEngine?.(call);
    await command.undoInEngine?.(call);
    expect(log).toEqual(["putAnnotation doc-a#1 sq@10", "removeAnnotation doc-a#1 sq"]);
  });

  it("is labelled by what was added", () => {
    expect(addAnnotation(content, "a:0", square).label).toBe("Add rectangle");
    const ink: InkAnnotation = { ...square, kind: "ink", strokes: [], lineWidth: 1 };
    expect(addAnnotation(content, "a:0", ink).label).toBe("Add drawing");
  });

  it("gives the page a new revision, and the old one back on undo", () => {
    const step = execute({ content, history: EMPTY_HISTORY }, addAnnotation(content, "a:1", square));
    const after = annotationRevisionOf(step.content, "a:1");
    expect(after).not.toBe(annotationRevisionOf(content, "a:1"));
    expect(annotationRevisionOf(step.content, "a:0")).toBe(annotationRevisionOf(content, "a:0"));

    const undone = undo(step);
    expect(annotationRevisionOf(undone.content, "a:1")).toBe(annotationRevisionOf(content, "a:1"));
    expect(annotationRevisionOf(redo(undone).content, "a:1")).toBe(after);
  });

  it("never reuses a revision for a different edit", () => {
    const first = execute({ content, history: EMPTY_HISTORY }, addAnnotation(content, "a:0", square));
    const back = undo(first);
    const other = execute(back, addAnnotation(back.content, "a:0", { ...square, id: "sq-2" }));
    expect(annotationRevisionOf(other.content, "a:0")).not.toBe(annotationRevisionOf(first.content, "a:0"));
  });
});

describe("editAnnotation", () => {
  it("writes the new version, and the old one on undo", async () => {
    const { call, log } = recordingEngine();
    const moved = { ...square, rect: { ...square.rect, x: 99 } };
    const command = editAnnotation(content, "a:0", square, moved);
    await command.applyInEngine?.(call);
    await command.undoInEngine?.(call);
    expect(log).toEqual(["putAnnotation doc-a#0 sq@99", "putAnnotation doc-a#0 sq@10"]);
    expect(command.label).toBe("Edit rectangle");
  });
});

describe("deleteAnnotations", () => {
  it("removes each annotation, and restores each on undo", async () => {
    const { call, log } = recordingEngine();
    const stamp: OtherAnnotation = { kind: "other", id: "stamp", subtype: 13, rect: square.rect, color: square.color, opacity: 1 };
    const command = deleteAnnotations(content, "a:0", [square, stamp]);
    await command.applyInEngine?.(call);
    await command.undoInEngine?.(call);
    expect(log).toEqual(["removeAnnotation doc-a#0 sq", "removeAnnotation doc-a#0 stamp", "restoreAnnotation doc-a#0 sq", "restoreAnnotation doc-a#0 stamp"]);
    expect(command.label).toBe("Delete 2 annotations");
  });
});
