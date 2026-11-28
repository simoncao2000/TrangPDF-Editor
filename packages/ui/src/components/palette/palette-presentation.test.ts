import { describe, expect, it } from "bun:test";
import { palettePresentation } from "./palette-presentation";

describe("palette presentation", () => {
  it("uses short search copy on narrow screens", () => {
    expect(palettePresentation(true)).toEqual({ placeholder: "Search this file", showHint: false });
  });

  it("keeps the full search copy and hint on wide screens", () => {
    expect(palettePresentation(false)).toEqual({
      placeholder: "Search text and files · > for commands · :page",
      showHint: true,
    });
  });
});
