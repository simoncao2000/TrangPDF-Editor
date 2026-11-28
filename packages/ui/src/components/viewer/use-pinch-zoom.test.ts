import { expect, test } from "bun:test";
import { focalScroll, pinchZoom, shouldZoomTap, wheelZoom } from "./use-pinch-zoom";

test("pinch scales from the initial span and clamps at both limits", () => {
  expect(pinchZoom(1.5, 40, 80)).toBe(3);
  expect(pinchZoom(1, 100, 0)).toBe(0.1);
  expect(pinchZoom(2, 10, 90)).toBe(8);
});

test("moving the focal point pans while preserving its offset on the resized page", () => {
  expect(focalScroll(2000, 45 * 2, 120)).toBe(1970);
});

test("opposite wheel deltas undo each other within the zoom limits", () => {
  expect(wheelZoom(1, -20)).toBeGreaterThan(1);
  expect(wheelZoom(wheelZoom(1, -20), 20)).toBeCloseTo(1);
  expect(wheelZoom(1, -1000)).toBe(8);
});

test("only a confirmed empty touch hit triggers zoom", () => {
  expect(shouldZoomTap(true, null)).toBe(true);
  for (const hit of [{}, "occupied", undefined]) expect(shouldZoomTap(true, hit)).toBe(false);
  expect(shouldZoomTap(false, null)).toBe(false);
});
