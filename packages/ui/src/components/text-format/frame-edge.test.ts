import { expect, test } from "bun:test";
import { onFrameEdge } from "./frame-edge";

test("the frame edge accepts only its line and the outward mouse or pen band", () => {
  const box = { left: 20, right: 120, top: 20, bottom: 80 };
  for (const device of ["mouse", "pen"]) {
    expect(onFrameEdge(box, { x: 40, y: 19 }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 20 }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 21 }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 22 }, device)).toBe(false);
    expect(onFrameEdge(box, { x: 40, y: 20 - 5 }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 20 - 6 }, device)).toBe(false);
    expect(onFrameEdge(box, { x: 120 + 5, y: 40 }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 120 + 6, y: 40 }, device)).toBe(false);
  }
});

test("the touch frame edge extends ten pixels outward without covering the text", () => {
  const box = { left: 20, right: 120, top: 20, bottom: 80 };
  expect(onFrameEdge(box, { x: 40, y: 21 }, "touch")).toBe(true);
  expect(onFrameEdge(box, { x: 40, y: 22 }, "touch")).toBe(false);
  expect(onFrameEdge(box, { x: 40, y: 9 }, "touch")).toBe(false);
  expect(onFrameEdge(box, { x: 40, y: 11 }, "touch")).toBe(true);
  expect(onFrameEdge(box, { x: 120 + 10, y: 40 }, "touch")).toBe(true);
  expect(onFrameEdge(box, { x: 120 + 11, y: 40 }, "touch")).toBe(false);
});
