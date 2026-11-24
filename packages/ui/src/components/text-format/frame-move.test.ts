import { expect, test } from "bun:test";
import { clampFrameMove, pointerDelta } from "./frame-move";

test("Escape restores the initial frame translation while editing stays active", () => {
  const initial = { x: 4, y: 6 };
  const dragged = clampFrameMove(
    initial,
    pointerDelta({ x: 20, y: 20 }, { x: 60, y: 60 }),
    { left: 30, right: 130, top: 30, bottom: 90 },
    { left: 0, right: 200, top: 0, bottom: 120 },
  );
  expect(dragged).toEqual({ x: 44, y: 36 });
  // The drag cancellation path calls update(initial); the editor remains mounted and focused.
  expect(initial).toEqual({ x: 4, y: 6 });
});

test("frame translation is clamped to the page edges", () => {
  expect(
    clampFrameMove(
      { x: 0, y: 0 },
      { x: -80, y: 80 },
      { left: 10, right: 110, top: 10, bottom: 70 },
      { left: 0, right: 120, top: 0, bottom: 80 },
    ),
  ).toEqual({ x: -10, y: 10 });
});
