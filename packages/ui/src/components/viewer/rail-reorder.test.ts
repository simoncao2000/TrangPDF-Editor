import { expect, test } from "bun:test";
import { visibleRange } from "@pdf-editor/core";
import {
  canDeletePage,
  currentAfterMove,
  keyboardMove,
  movePosition,
  pointerGap,
  railLayout,
  startsDrag,
} from "./rail-reorder";

const size = { width: 100, height: 130 };
const layout = railLayout(Array.from({ length: 1000 }, () => size));

test("the add tile follows the final page and only enters the mounted range near the end", () => {
  expect(layout.boxes).toHaveLength(1001);
  expect(layout.boxes[1000]?.height).toBe(layout.boxes[999]?.height);
  expect(visibleRange(layout, 0, 400)!.last).toBeLessThan(10);
  expect(visibleRange(layout, layout.totalHeight - 400, 400)!.last).toBe(1000);
});

test("pointer gaps split variable-height pages at their midpoint and stop before Add pages", () => {
  const { boxes, totalHeight } = railLayout([size, { width: 100, height: 200 }]);
  const second = boxes[1]!;
  expect(pointerGap(boxes, -10)).toBe(0);
  expect(pointerGap(boxes, second.top + second.height / 2 - 1)).toBe(1);
  expect(pointerGap(boxes, second.top + second.height / 2)).toBe(2);
  expect(pointerGap(boxes, totalHeight)).toBe(2);
});

test("threshold uses total pointer travel", () => {
  expect(startsDrag(3, 3)).toBe(false);
  expect(startsDrag(-3, 4)).toBe(true);
});

test("keyboard pickup, bounded movement, drop and cancellation", () => {
  expect(keyboardMove("M", null, 1, 3)).toBe(1);
  expect(keyboardMove("ArrowDown", 1, 1, 3)).toBe(2);
  expect(keyboardMove("ArrowDown", 2, 1, 3)).toBe(2);
  expect(keyboardMove("ArrowUp", 0, 1, 3)).toBe(0);
  for (const key of ["Enter", "m"]) expect(keyboardMove(key, 2, 1, 3)).toBe("drop");
  expect(keyboardMove("Escape", 2, 1, 3)).toBe("cancel");
  expect(keyboardMove("Enter", null, 1, 3)).toBeUndefined();
});

test("delete preserves the only page", () => {
  expect(canDeletePage(1)).toBe(false);
  expect(canDeletePage(2)).toBe(true);
});

test("rail positions refer to the final page number in both directions", () => {
  expect(movePosition("4", 2, 4)).toBe(3);
  expect(movePosition("1", 4, 4)).toBe(0);
  for (const value of ["", "2", "1.5", "2e0", "abc"]) expect(movePosition(value, 2, 4)).toBeNull();
  for (const value of ["0", "-1", "5"]) expect(movePosition(value, 2, 4)).toBe("range");
});

test("the moved page becomes current in either direction", () => {
  expect(currentAfterMove(["b", "c", "a"], "a", 0)).toBe(2);
  expect(currentAfterMove(["c", "a", "b"], "c", 1)).toBe(0);
  expect(currentAfterMove(["a", "b", "c"], null, 1)).toBe(1);
});
