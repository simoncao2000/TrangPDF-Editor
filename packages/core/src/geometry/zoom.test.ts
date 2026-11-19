import { describe, expect, it } from "bun:test";
import { bitmapSize, cssPageSize, MAX_ZOOM, resolveZoom, stepZoom } from "./zoom";

const LETTER = { width: 612, height: 792 };

describe("cssPageSize", () => {
  it("makes a Letter page 816 × 1056 CSS pixels at 100%", () => {
    expect(cssPageSize(LETTER, 1)).toEqual({ width: 816, height: 1056 });
  });
});

describe("resolveZoom", () => {
  it("fits the page width", () => {
    expect(resolveZoom({ kind: "fit-width" }, { width: 408, height: 300 }, LETTER)).toBeCloseTo(0.5);
  });

  it("fits the whole page using the tighter side", () => {
    expect(resolveZoom({ kind: "fit-page" }, { width: 2000, height: 528 }, LETTER)).toBeCloseTo(0.5);
  });

  it("clamps fixed percentages", () => {
    expect(resolveZoom({ kind: "percent", zoom: 50 }, { width: 1, height: 1 }, LETTER)).toBe(MAX_ZOOM);
  });
});

describe("stepZoom", () => {
  it("moves to the next preset", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it("snaps an in-between zoom to the nearest preset in that direction", () => {
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
  });
});

describe("bitmapSize", () => {
  it("multiplies by the device pixel ratio", () => {
    expect(bitmapSize({ width: 100, height: 50 }, 2)).toEqual({ width: 200, height: 100 });
  });

  it("scales down bitmaps over the pixel cap, keeping the aspect ratio", () => {
    const size = bitmapSize({ width: 4000, height: 4000 }, 2, 1_000_000);
    expect(size.width * size.height).toBeLessThanOrEqual(1_000_000);
    expect(size.width).toBe(size.height);
  });
});
