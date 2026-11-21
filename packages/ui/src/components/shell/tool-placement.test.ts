import { describe, expect, test } from "bun:test";
import { PLACEMENT_MARGIN, placeInside } from "./tool-placement";

const palette = { width: 48, height: 400 };
const area = { width: 1000, height: 700 };

describe("placeInside", () => {
  test("leaves a position that already fits", () => {
    expect(placeInside({ x: 200, y: 100 }, palette, area)).toEqual({ x: 200, y: 100 });
  });

  test("pulls the palette back inside when the area shrinks", () => {
    expect(placeInside({ x: 950, y: 600 }, palette, area)).toEqual({
      x: 1000 - 48 - PLACEMENT_MARGIN,
      y: 700 - 400 - PLACEMENT_MARGIN,
    });
  });

  test("keeps a margin from the top-left edges", () => {
    expect(placeInside({ x: -40, y: -10 }, palette, area)).toEqual({ x: PLACEMENT_MARGIN, y: PLACEMENT_MARGIN });
  });

  test("prefers the top-left corner when the area is smaller than the palette", () => {
    expect(placeInside({ x: 500, y: 500 }, palette, { width: 30, height: 200 })).toEqual({
      x: PLACEMENT_MARGIN,
      y: PLACEMENT_MARGIN,
    });
  });
});
