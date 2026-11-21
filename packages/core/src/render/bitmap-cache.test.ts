import { describe, expect, it } from "bun:test";
import { BitmapCache, type ClosableBitmap } from "./bitmap-cache";

/**
 * A 10 × 10 bitmap (400 bytes) that records when it is closed.
 * @returns The fake bitmap.
 */
function bitmap(): ClosableBitmap & { closed: boolean } {
  return {
    width: 10,
    height: 10,
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

describe("BitmapCache", () => {
  it("evicts and closes the least recently used bitmap when over budget", () => {
    const cache = new BitmapCache(800);
    const a = bitmap();
    const b = bitmap();
    const c = bitmap();
    cache.set("a", a);
    cache.set("b", b);
    cache.get("a");
    cache.set("c", c);
    expect(b.closed).toBe(true);
    expect(cache.get("a")).toBe(a);
    expect(cache.usedBytes).toBe(800);
  });

  it("keeps the newest entry even if it alone is over budget", () => {
    const cache = new BitmapCache(100);
    const a = bitmap();
    cache.set("a", a);
    expect(cache.get("a")).toBe(a);
  });

  it("removes a whole document by prefix", () => {
    const cache = new BitmapCache(10_000);
    const keep = bitmap();
    cache.set("doc-1#0@10x10", bitmap());
    cache.set("doc-1#1@10x10", bitmap());
    cache.set("doc-2#0@10x10", keep);
    cache.deleteByPrefix("doc-1#");
    expect(cache.usedBytes).toBe(400);
    expect(cache.get("doc-2#0@10x10")).toBe(keep);
  });

  it("finds the sharpest cached copy of a page", () => {
    const cache = new BitmapCache(10_000);
    const big = { width: 20, height: 20, close() {} };
    cache.set("d#0@10x10", bitmap());
    cache.set("d#0@20x20", big);
    expect(cache.largestWithPrefix("d#0@")).toBe(big);
  });
});
