import { describe, expect, it } from "bun:test";
import { signatureCanvasLayout, signatureInkBounds } from "./typed-signature";

describe("typed signature raster sizing", () => {
  it("scales glyph overhangs and the baseline by four", () => {
    expect(
      signatureCanvasLayout({
        actualBoundingBoxLeft: 2.25,
        actualBoundingBoxRight: 60,
        actualBoundingBoxAscent: 35,
        actualBoundingBoxDescent: 8.125,
      }),
    ).toEqual({ width: 251, height: 175, x: 10, y: 141, scale: 4 });
  });

  it("scales down unusually long names to fit the canvas", () => {
    const layout = signatureCanvasLayout({
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 4094,
      actualBoundingBoxAscent: 35,
      actualBoundingBoxDescent: 8,
    });
    expect(layout).toEqual({ width: 4096, height: 45, x: 1, y: 36, scale: 1 });
  });

  it("trims transparent pixels and retains even faint antialiasing", () => {
    const data = new Uint8ClampedArray(6 * 5 * 4);
    const pixels = { data, width: 6, height: 5, colorSpace: "srgb" } as const;
    expect(signatureInkBounds(pixels)).toBeNull();
    data[(6 + 2) * 4 + 3] = 1;
    data[(3 * 6 + 4) * 4 + 3] = 255;
    expect(signatureInkBounds(pixels)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });
});
