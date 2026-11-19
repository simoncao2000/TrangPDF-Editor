import { describe, expect, test } from "bun:test";
import { extendStroke, newTextLines, rectBetween } from "./drawing-geometry";

describe("rectBetween", () => {
  test("is the same whichever way the drag went", () => {
    expect(rectBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ left: 10, top: 20, width: 40, height: 60 });
  });
});

describe("newTextLines", () => {
  // Letter page at zoom 0.75: one point is one CSS pixel.
  const frame = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 as const, zoom: 0.75 };

  test("puts each line's baseline one line height below the last", () => {
    const { lines, angle } = newTextLines("Low tide\nBring a jacket", { x: 72, y: 92 }, 10, frame);
    expect(angle).toBe(0);
    expect(lines.map((line) => line.text)).toEqual(["Low tide", "Bring a jacket"]);
    expect(lines[0]!.origin.x).toBeCloseTo(72);
    expect(lines[0]!.origin.y - lines[1]!.origin.y).toBeCloseTo(11.5);
    expect(792 - 92 - lines[0]!.origin.y).toBeCloseTo(9.2, 1); // the baseline sits a little below the top
  });

  test("keeps the space of empty lines without making text for them", () => {
    const { lines } = newTextLines("One\n\nThree", { x: 0, y: 0 }, 10, frame);
    expect(lines.map((line) => line.text)).toEqual(["One", "Three"]);
    expect(lines[0]!.origin.y - lines[1]!.origin.y).toBeCloseTo(23);
  });

  test("turns the text against the page's rotation so it reads upright", () => {
    expect(newTextLines("Hi", { x: 0, y: 0 }, 10, { ...frame, rotation: 90 }).angle).toBe(90);
  });
});

describe("extendStroke", () => {
  test("drops points that barely moved", () => {
    const stroke = extendStroke([{ x: 0, y: 0 }], { x: 0.5, y: 0.5 });
    expect(stroke).toHaveLength(1);
    expect(extendStroke(stroke, { x: 3, y: 0 })).toHaveLength(2);
  });
});
