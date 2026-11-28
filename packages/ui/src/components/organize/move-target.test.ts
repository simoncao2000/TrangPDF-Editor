import { expect, test } from "bun:test";
import { moveTarget } from "./move-target";

const order = ["a", "b", "c", "d", "e"];

/** Checks targets on both sides of the moved page and at the document boundaries. */
test("maps original page numbers to insertion indices", () => {
  const moving = new Set(["b"]);
  expect(moveTarget(order, moving, 1)).toBe(1);
  expect(moveTarget(order, moving, 4)).toBe(3);
  expect(moveTarget(order, moving, 0)).toBe(0);
  expect(moveTarget(order, moving, 5)).toBe(4);
  expect(moveTarget(order, moving, -3)).toBe(0);
  expect(moveTarget(order, moving, 99)).toBe(4);
});

/** Checks that only moving pages before the destination shift its index. */
test("skips every moving page before the boundary", () => {
  const moving = new Set(["a", "c", "e"]);
  expect(moveTarget(order, moving, 4)).toBe(2);
  expect(moveTarget(order, moving, 3)).toBe(1);
});
