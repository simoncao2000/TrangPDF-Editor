import { expect, test } from "bun:test";
import { hasGestureTravel } from "./drawing-geometry";

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
