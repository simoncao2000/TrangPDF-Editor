import { expect, test } from "bun:test";
import { onFrameEdge } from "./frame-edge";

test("the frame edge extends inward and outward by six pixels, or twelve for touch", () => {
  const box = { left: 20, right: 120, top: 20, bottom: 80 };
  for (const [device, radius] of [
    ["mouse", 6],
    ["touch", 12],
  ] as const) {
    expect(onFrameEdge(box, { x: 40, y: 20 - radius }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 20 + radius }, device)).toBe(true);
    expect(onFrameEdge(box, { x: 40, y: 20 + radius + 1 }, device)).toBe(false);
    expect(onFrameEdge(box, { x: 120 + radius + 1, y: 20 }, device)).toBe(false);
  }
});
