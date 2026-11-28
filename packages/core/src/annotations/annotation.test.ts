import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  type Annotation,
  boundsOf,
  type InkAnnotation,
  isEditable,
  moveAnnotation,
  resizeAnnotation,
} from "./annotation";

const BLACK = { r: 0, g: 0, b: 0 };

const ink: InkAnnotation = {
  kind: "ink",
  id: "ink-1",
  rect: { x: 100, y: 100, width: 100, height: 50 },
  color: BLACK,
  opacity: 1,
  lineWidth: 2,
  strokes: [
    [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ],
  ],
};

describe("moveAnnotation", () => {
  test("moves the box and every point of an ink drawing", () => {
    const moved = moveAnnotation(ink, 10, -20);
    expect(moved.rect).toEqual({ x: 110, y: 80, width: 100, height: 50 });
    expect(moved.strokes).toEqual([
      [
        { x: 110, y: 80 },
        { x: 210, y: 130 },
      ],
    ]);
  });

  test("moves every line of a highlight", () => {
    const highlight: Annotation = {
      kind: "highlight",
      id: "h",
      rect: { x: 0, y: 0, width: 10, height: 20 },
      color: BLACK,
      opacity: 0.5,
      lines: [{ x: 0, y: 10, width: 10, height: 10 }],
    };
    const moved = moveAnnotation(highlight, 5, 5);
    expect(moved.kind === "highlight" && moved.lines).toEqual([{ x: 5, y: 15, width: 10, height: 10 }]);
  });

  test("does not change the original", () => {
    moveAnnotation(ink, 10, 10);
    expect(ink.rect.x).toBe(100);
  });

  test("moving there and back is a no-op", () => {
    fc.assert(
      fc.property(fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 }), (dx, dy) => {
        expect(moveAnnotation(moveAnnotation(ink, dx, dy), -dx, -dy)).toEqual(ink);
      }),
    );
  });
});

describe("resizeAnnotation", () => {
  test("scales ink strokes into the new box", () => {
    const resized = resizeAnnotation(ink, { x: 0, y: 0, width: 200, height: 100 });
    expect(resized.strokes).toEqual([
      [
        { x: 0, y: 0 },
        { x: 200, y: 100 },
      ],
    ]);
  });

  test("keeps a highlight the size of its text", () => {
    const highlight: Annotation = {
      kind: "highlight",
      id: "h",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      color: BLACK,
      opacity: 0.5,
      lines: [],
    };
    expect(resizeAnnotation(highlight, { x: 0, y: 0, width: 99, height: 99 })).toBe(highlight);
  });
});

describe("boundsOf", () => {
  test("wraps the points with a margin", () => {
    expect(
      boundsOf(
        [
          { x: 10, y: 20 },
          { x: 30, y: 5 },
        ],
        1,
      ),
    ).toEqual({ x: 9, y: 4, width: 22, height: 17 });
  });
});

describe("isEditable", () => {
  test("is false only for annotations made by other apps", () => {
    expect(isEditable(ink)).toBe(true);
    expect(isEditable({ kind: "other", id: "x", subtype: 13, rect: ink.rect, color: BLACK, opacity: 1 })).toBe(false);
  });
});
