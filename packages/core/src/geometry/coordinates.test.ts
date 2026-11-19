import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import type { Rotation } from "../engine/protocol";
import { displayedSize, type PageFrame, pageFrame, pageSizeOf, pdfRectToScreen, pdfToScreen, screenDeltaToPdf, screenRectToPdf, screenToPdf } from "./coordinates";

const LETTER: PageFrame = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0, zoom: 1 };
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * Rounds every number in a flat object to 2 decimals, so float noise does not fail a comparison.
 * @param value An object of numbers.
 * @returns The same keys with rounded values.
 */
function rounded<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round((number as number) * 100) / 100])) as T;
}

describe("pdfRectToScreen", () => {
  test("matches the plan's worked example: a highlight on a Letter page at 100%", () => {
    // Arrange
    const highlight = { x: 72, y: 648, width: 200, height: 20 };

    // Act
    const screen = pdfRectToScreen(highlight, LETTER);

    // Assert
    expect(rounded(screen)).toEqual({ left: 96, top: 165.33, width: 266.67, height: 26.67 });
  });

  test("scales with zoom", () => {
    const screen = pdfRectToScreen({ x: 0, y: 0, width: 72, height: 72 }, { ...LETTER, zoom: 2 });
    expect(rounded(screen)).toEqual({ left: 0, top: 1920, width: 192, height: 192 });
  });

  test("measures from the crop box, not the media box", () => {
    const cropped: PageFrame = { cropBox: { x: 50, y: 100, width: 500, height: 600 }, rotation: 0, zoom: 0.75 };
    // The crop box's top-left corner is the screen origin.
    expect(rounded(pdfRectToScreen({ x: 50, y: 690, width: 10, height: 10 }, cropped))).toEqual({ left: 0, top: 0, width: 10, height: 10 });
  });

  test.each([
    // A 10 × 20 pt box in the page's top-left corner, on a 100 × 200 pt page, at zoom 0.75 (1 pt = 1 px).
    [0, { left: 0, top: 0, width: 10, height: 20 }],
    [90, { left: 180, top: 0, width: 20, height: 10 }],
    [180, { left: 90, top: 180, width: 10, height: 20 }],
    [270, { left: 0, top: 90, width: 20, height: 10 }],
  ] as const)("turns the page clockwise by %i degrees", (rotation, expected) => {
    const frame: PageFrame = { cropBox: { x: 0, y: 0, width: 100, height: 200 }, rotation, zoom: 0.75 };
    expect(rounded(pdfRectToScreen({ x: 0, y: 180, width: 10, height: 20 }, frame))).toEqual(expected);
  });
});

describe("pdfToScreen", () => {
  test("flips the y axis: the PDF origin is the bottom-left corner of the page", () => {
    expect(rounded(pdfToScreen({ x: 0, y: 0 }, LETTER))).toEqual({ x: 0, y: 1056 });
    expect(rounded(pdfToScreen({ x: 612, y: 792 }, LETTER))).toEqual({ x: 816, y: 0 });
  });

  test.each(ROTATIONS)("keeps every corner of the page inside the displayed page at %i degrees", (rotation) => {
    const frame: PageFrame = { cropBox: { x: 20, y: 30, width: 300, height: 400 }, rotation, zoom: 1 };
    const size = displayedSize(frame);
    const corners = [
      { x: 20, y: 30 },
      { x: 320, y: 30 },
      { x: 20, y: 430 },
      { x: 320, y: 430 },
    ].map((corner) => rounded(pdfToScreen(corner, frame)));
    const xs = corners.map((corner) => corner.x).sort((a, b) => a - b);
    const ys = corners.map((corner) => corner.y).sort((a, b) => a - b);
    expect([xs[0], xs[3], ys[0], ys[3]]).toEqual([0, Math.round(size.width * 100) / 100, 0, Math.round(size.height * 100) / 100]);
  });
});

describe("displayedSize", () => {
  test("swaps width and height for a quarter turn", () => {
    expect(displayedSize(LETTER)).toEqual({ width: 816, height: 1056 });
    expect(displayedSize({ ...LETTER, rotation: 90 })).toEqual({ width: 1056, height: 816 });
    expect(displayedSize({ ...LETTER, rotation: 270 })).toEqual({ width: 1056, height: 816 });
  });
});

describe("round trips", () => {
  const frames = fc.record({
    cropBox: fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
      width: fc.integer({ min: 1, max: 2000 }),
      height: fc.integer({ min: 1, max: 2000 }),
    }),
    rotation: fc.constantFrom<Rotation>(...ROTATIONS),
    zoom: fc.double({ min: 0.1, max: 8, noNaN: true }),
  });

  test("screenToPdf undoes pdfToScreen for any point, rotation, crop box and zoom", () => {
    fc.assert(
      fc.property(frames, fc.double({ min: -3000, max: 3000, noNaN: true }), fc.double({ min: -3000, max: 3000, noNaN: true }), (frame, x, y) => {
        const back = screenToPdf(pdfToScreen({ x, y }, frame), frame);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }),
    );
  });

  test("screenRectToPdf undoes pdfRectToScreen", () => {
    const rects = fc.record({
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
      width: fc.integer({ min: 0, max: 1000 }),
      height: fc.integer({ min: 0, max: 1000 }),
    });
    fc.assert(
      fc.property(frames, rects, (frame, rect) => {
        const back = screenRectToPdf(pdfRectToScreen(rect, frame), frame);
        for (const key of ["x", "y", "width", "height"] as const) expect(back[key]).toBeCloseTo(rect[key], 6);
      }),
    );
  });
});

describe("pageSizeOf", () => {
  test("gives the crop box size, turned by the page's own and the extra rotation", () => {
    const page = { cropBox: { x: 10, y: 10, width: 300, height: 400 }, rotation: 90 as const };
    expect(pageSizeOf(page)).toEqual({ width: 400, height: 300 });
    expect(pageSizeOf(page, 90)).toEqual({ width: 300, height: 400 });
    expect(pageSizeOf(page, 180)).toEqual({ width: 400, height: 300 });
  });
});

describe("pageFrame", () => {
  test("adds the extra rotation to the page's own", () => {
    const page = { cropBox: { x: 0, y: 0, width: 300, height: 400 }, rotation: 270 as const };
    expect(pageFrame(page, 180, 2)).toEqual({ cropBox: page.cropBox, rotation: 90, zoom: 2 });
  });
});

describe("screenDeltaToPdf", () => {
  test.each([
    [0, { x: 10, y: -20 }],
    [90, { x: 20, y: 10 }],
    [180, { x: -10, y: 20 }],
    [270, { x: -20, y: -10 }],
  ] as const)("turns a drag of 10 right, 20 down into PDF space at %i degrees", (rotation, expected) => {
    const frame: PageFrame = { cropBox: { x: 0, y: 0, width: 100, height: 200 }, rotation, zoom: 0.75 };
    const delta = screenDeltaToPdf({ x: 10, y: 20 }, frame);
    expect(rounded(delta)).toEqual(expected);
  });
});
