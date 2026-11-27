import { expect, test } from "bun:test";
import { plainComment, type Annotation, type CommentNote } from "@pdf-editor/core";
import { countCommentThreads } from "./use-document-threads";

test("comment badge counts only annotations with a nonempty comment body", () => {
  const threads = [
    { pageId: "page", pageIndex: 0, annotation: mark(undefined) },
    { pageId: "page", pageIndex: 0, annotation: mark(plainComment("  ")) },
    { pageId: "page", pageIndex: 0, annotation: mark(plainComment("A comment")) },
  ];

  expect(countCommentThreads(threads)).toBe(1);
});

/** Creates an ink mark with an optional comment body for the count fixture.
 * @param body The annotation comment body.
 * @returns A representative annotation.
 */
function mark(body: CommentNote["body"] | undefined): Annotation {
  return {
    kind: "ink",
    id: "mark",
    rect: { x: 0, y: 0, width: 1, height: 1 },
    color: { r: 0, g: 0, b: 0 },
    opacity: 1,
    lineWidth: 1,
    strokes: [],
    comment: body ? { body, author: "", modified: null } : undefined,
  };
}
