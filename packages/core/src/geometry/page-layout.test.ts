import { describe, expect, it } from "bun:test";
import { currentPageIndex, layoutPages, sizesAtWidth, visibleRange } from "./page-layout";

const tenPages = layoutPages(
  Array.from({ length: 10 }, () => ({ width: 100, height: 100 })),
  { gap: 10, padding: 20 },
);

describe("layoutPages", () => {
  it("stacks boxes with gaps and padding", () => {
    expect(tenPages.boxes[0]).toEqual({ index: 0, top: 20, width: 100, height: 100 });
    expect(tenPages.boxes[1]!.top).toBe(130);
    expect(tenPages.totalHeight).toBe(20 + 10 * 100 + 9 * 10 + 20);
  });

  it("adds extra height under each box", () => {
    const layout = layoutPages([{ width: 50, height: 60 }], { gap: 0, padding: 0, extraHeight: 20 });
    expect(layout.boxes[0]!.height).toBe(80);
  });
});

describe("visibleRange", () => {
  it("returns the visible pages plus one on each side", () => {
    expect(visibleRange(tenPages, 300, 200)).toEqual({ first: 1, last: 5 });
  });

  it("stays inside the list at the edges", () => {
    expect(visibleRange(tenPages, 0, 100)).toEqual({ first: 0, last: 1 });
    expect(visibleRange(tenPages, 5000, 100)).toEqual({ first: 8, last: 9 });
  });

  it("returns null for an empty document", () => {
    expect(visibleRange(layoutPages([], { gap: 0, padding: 0 }), 0, 100)).toBeNull();
  });
});

describe("currentPageIndex", () => {
  it("picks the page under the 40% line", () => {
    expect(currentPageIndex(tenPages, 0, 500)).toBe(1);
    expect(currentPageIndex(tenPages, 680, 100)).toBe(6);
  });
});

describe("sizesAtWidth", () => {
  it("keeps aspect ratios", () => {
    expect(sizesAtWidth([{ width: 612, height: 792 }], 102)).toEqual([{ width: 102, height: 132 }]);
  });
});
