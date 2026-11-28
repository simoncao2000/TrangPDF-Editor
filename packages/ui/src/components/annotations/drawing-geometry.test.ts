import { expect, test } from "bun:test";
import { hasGestureTravel, shouldDiscardGesture } from "./drawing-geometry";

test("discards a tap and keeps a real ink stroke", () => {
  expect(hasGestureTravel([{ x: 10, y: 10 }])).toBe(false);
  expect(
    hasGestureTravel([
      { x: 10, y: 10 },
      { x: 11, y: 10 },
    ]),
  ).toBe(false);
  expect(
    hasGestureTravel([
      { x: 10, y: 10 },
      { x: 14, y: 10 },
    ]),
  ).toBe(true);
});

const start = { x: 10, y: 10 };
const end = { x: 20, y: 10 };

test("keeps clicks and drags for placement tools", () => {
  for (const tool of ["note", "sign", "image", "textBox"] as const) {
    expect(shouldDiscardGesture(tool, [start, start])).toBe(false);
    expect(shouldDiscardGesture(tool, [start, end])).toBe(false);
  }
});

test("discards clicks and keeps drags for ink and drag-drawn shapes", () => {
  for (const tool of ["ink", "square", "circle", "line", "arrow"] as const) {
    expect(shouldDiscardGesture(tool, [start, start])).toBe(true);
    expect(shouldDiscardGesture(tool, [start, end])).toBe(false);
  }
});
