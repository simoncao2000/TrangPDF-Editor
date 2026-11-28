import { pdfToScreen, type PageFrame } from "@pdf-editor/core";
import { describe, expect, it } from "bun:test";
import { acceptsDrop, placeSignature, signatureBounds, signatureFrom, startedDrag } from "./signature-geometry";

describe("signatures", () => {
  it("keeps a drawing's shape, cropped to its ink and one unit wide", () => {
    const signature = signatureFrom("s", [
      [
        { x: 10, y: 20 },
        { x: 110, y: 70 },
      ],
    ])!;
    expect(signature.aspect).toBe(0.5);
    expect(signature.strokes).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
      ],
    ]);
    expect(signatureFrom("s", [])).toBeNull();
  });

  it("places a signature as ink at a size, hanging down from its top-left corner", () => {
    const signature = signatureFrom("s", [
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
    ])!;
    const ink = placeSignature(
      signature,
      { x: 100, y: 500 },
      { color: { r: 0, g: 0, b: 0 }, lineWidth: 2, width: 150 },
    );
    expect(ink.strokes).toEqual([
      [
        { x: 100, y: 500 },
        { x: 250, y: 425 },
      ],
    ]);
    expect(ink.rect).toEqual({ x: 99, y: 424, width: 152, height: 77 });
  });
});

describe("signature drops", () => {
  it("centres the ink in PDF space at every rotation and zoom", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const zoom of [0.5, 2]) {
        const frame: PageFrame = { rotation, zoom, cropBox: { x: 10, y: 20, width: 500, height: 700 } };
        const point = pdfToScreen({ x: 220, y: 370 }, frame);
        expect(signatureBounds(point, frame, 0.5, 1)).toEqual({ x: 140, y: 330, width: 160, height: 80 });
      }
    }
  });
  it("fits a narrow page and clamps the stroke inside its crop box", () => {
    const frame: PageFrame = { rotation: 90, zoom: 1, cropBox: { x: 10, y: 20, width: 100, height: 200 } };
    const point = pdfToScreen({ x: 110, y: 220 }, frame);
    expect(signatureBounds(point, frame, 0.5, 1)).toEqual({ x: 11, y: 170, width: 98, height: 49 });
  });
  it("uses six CSS pixels of movement and discards cancelled or off-page drops", () => {
    expect(startedDrag({ x: 3, y: 4 }, { x: 6, y: 8 })).toBe(false);
    expect(startedDrag({ x: 3, y: 4 }, { x: 9, y: 4 })).toBe(true);
    expect(acceptsDrop(true, true)).toBe(false);
    expect(acceptsDrop(false, false)).toBe(false);
    expect(acceptsDrop(false, true)).toBe(true);
  });
});
