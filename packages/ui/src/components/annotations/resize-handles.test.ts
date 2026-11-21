import { describe, expect, test } from "bun:test";
import { handlePosition, MIN_SIZE, resizeRect } from "./resize-handles";

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
