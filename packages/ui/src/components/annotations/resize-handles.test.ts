import { describe, expect, test } from "bun:test";
import { handlePosition, MIN_SIZE, resizeRect, keepAspect } from "./resize-handles";

const box = { left: 100, top: 100, width: 50, height: 40 };

describe("resizeRect", () => {
  test("drags the bottom-right corner and keeps the top-left", () => {
    expect(resizeRect(box, "se", 10, 20)).toEqual({ left: 100, top: 100, width: 60, height: 60 });
  });

  test("drags the top-left corner and keeps the bottom-right", () => {
    expect(resizeRect(box, "nw", -10, 5)).toEqual({ left: 90, top: 105, width: 60, height: 35 });
  });

  test("stops at the minimum size instead of flipping", () => {
    expect(resizeRect(box, "ne", -500, 500)).toEqual({
      left: 100,
      top: 140 - MIN_SIZE,
      width: MIN_SIZE,
      height: MIN_SIZE,
    });
  });
});

describe("handlePosition", () => {
  test("puts each handle on its corner", () => {
    expect(handlePosition(box, "nw")).toEqual({ x: 100, y: 100 });
    expect(handlePosition(box, "se")).toEqual({ x: 150, y: 140 });
  });
});

describe("keepAspect", () => {
  test("keeps a box's proportions, stretching by its larger change, the opposite corner fixed", () => {
    const original = { left: 10, top: 10, width: 100, height: 50 };
    expect(keepAspect({ left: 10, top: 10, width: 200, height: 60 }, original, "se")).toEqual({
      left: 10,
      top: 10,
      width: 200,
      height: 100,
    });
    expect(keepAspect({ left: 60, top: 0, width: 50, height: 60 }, original, "nw")).toEqual({
      left: -10,
      top: 0,
      width: 120,
      height: 60,
    });
  });
});
