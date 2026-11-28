import { describe, expect, it } from "bun:test";
import { contrastRatio, dominantColor, editorBackground, ringOf } from "./editor-background";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const NAVY = { r: 20, g: 40, b: 90 };

/**
 * An RGBA image filled with one colour, with another colour in its middle.
 * @param size Width and height in pixels.
 * @param fill The colour of the image.
 * @param middle The colour of the pixels not on the edge.
 * @returns The image's pixels.
 */
function image(
  size: number,
  fill: typeof WHITE,
  middle: typeof WHITE,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const { r, g, b } = edge ? fill : middle;
      data.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

describe("editor background", () => {
  it("takes the pixels on the edge of an image, not the text inside it", () => {
    const ring = ringOf(image(4, NAVY, WHITE));
    expect(ring).toHaveLength(12);
    expect(ring.every((color) => color.r === NAVY.r && color.b === NAVY.b)).toBe(true);
  });

  it("finds the colour most of the pixels share, ignoring a few text pixels", () => {
    const pixels = [...Array.from({ length: 9 }, () => NAVY), WHITE, WHITE];
    expect(dominantColor(pixels)).toEqual(NAVY);
  });

  it("measures contrast as WCAG does", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(NAVY, NAVY)).toBeCloseTo(1, 5);
  });

  it("uses the page colour behind the text when the text reads on it", () => {
    expect(editorBackground([NAVY, NAVY, NAVY], WHITE)).toEqual(NAVY);
    expect(editorBackground([WHITE, WHITE], BLACK)).toEqual(WHITE);
  });

  it("falls back to dark behind light text, and white behind dark text, when it would not read", () => {
    const light = editorBackground([WHITE], WHITE);
    expect(contrastRatio(light, WHITE)).toBeGreaterThan(4.5);
    expect(editorBackground([], BLACK)).toEqual(WHITE);
    expect(contrastRatio(editorBackground([], WHITE), WHITE)).toBeGreaterThan(4.5);
  });
});
