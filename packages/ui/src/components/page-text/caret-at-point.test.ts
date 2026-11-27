import { describe, expect, it } from "bun:test";
import { caretAtPoint, collapsedTextSelection, type CaretPointDocument } from "./caret-at-point";

const inside = { textContent: "hello" } as Node;
const outside = { textContent: "outside" } as Node;
const root = {
  contains: (node: Node) => node === inside,
  getBoundingClientRect: () => ({ left: 10, right: 50 }) as DOMRect,
} as HTMLElement;

describe("caretAtPoint", () => {
  it("keeps a click-point text selection collapsed", () => {
    expect(collapsedTextSelection(3, 5)).toEqual({ anchorOffset: 3, focusOffset: 3 });
  });

  it("uses caretPositionFromPoint", () => {
    const source: CaretPointDocument = {
      caretPositionFromPoint: () => ({ offsetNode: inside, offset: 3 }),
    };
    expect(caretAtPoint(source, root, { x: 20, y: 30 })).toEqual({ kind: "point", node: inside, offset: 3 });
  });

  it("falls back to caretRangeFromPoint", () => {
    const source: CaretPointDocument = {
      caretRangeFromPoint: () => ({ startContainer: inside, startOffset: 2 }) as Range,
    };
    expect(caretAtPoint(source, root, { x: 20, y: 30 })).toEqual({ kind: "point", node: inside, offset: 2 });
  });

  it("clamps points outside the root to its start or end", () => {
    const source: CaretPointDocument = {
      caretPositionFromPoint: () => ({ offsetNode: outside, offset: 0 }),
    };
    expect(caretAtPoint(source, root, { x: 5, y: 30 })).toEqual({ kind: "start" });
    expect(caretAtPoint(source, root, { x: 55, y: 30 })).toEqual({ kind: "end" });
  });

  it("returns null when neither caret API exists", () => {
    expect(caretAtPoint({}, root, { x: 20, y: 30 })).toBeNull();
  });
});
