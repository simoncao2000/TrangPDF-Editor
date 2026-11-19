import { describe, expect, it } from "bun:test";
import { clickSelection } from "./selection";

describe("clickSelection", () => {
  it("selects a page on the first click and clears it on the second", () => {
    const selected = clickSelection([], "b");
    expect(selected).toEqual(["b"]);
    expect(clickSelection(selected, "b")).toEqual([]);
  });

  it("toggles pages independently", () => {
    const selected = clickSelection(["d"], "b");
    expect(selected).toEqual(["d", "b"]);
    expect(clickSelection(selected, "d")).toEqual(["b"]);
  });
});
