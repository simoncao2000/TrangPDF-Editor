import { describe, expect, test } from "bun:test";
import { mergeIntoLines } from "./text-lines";

describe("mergeIntoLines", () => {
  test("joins runs on one line and keeps separate lines apart, top line first", () => {
    const lines = mergeIntoLines([
      { x: 72, y: 670, width: 40, height: 20 },
      { x: 72, y: 700, width: 50, height: 22 },
      { x: 125, y: 701, width: 60, height: 20 },
    ]);
    expect(lines).toEqual([
      { x: 72, y: 700, width: 113, height: 22 },
      { x: 72, y: 670, width: 40, height: 20 },
    ]);
  });

  test("drops empty rectangles", () => {
    expect(mergeIntoLines([{ x: 0, y: 0, width: 0, height: 10 }])).toEqual([]);
  });
});
