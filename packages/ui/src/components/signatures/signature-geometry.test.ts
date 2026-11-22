import { describe, expect, it } from "bun:test";
import { placeSignature, signatureFrom } from "./signature-geometry";

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
