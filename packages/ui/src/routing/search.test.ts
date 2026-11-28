import { defaultParseSearch } from "@tanstack/react-router";
import { describe, expect, test } from "bun:test";
import { DEFAULT_VIEW_SEARCH, validateSearch } from "./search";

describe("editor search", () => {
  test("parses mode, the one-based page, numeric zoom, and panel", () => {
    expect(validateSearch(defaultParseSearch("?mode=organize&page=3&zoom=1.5&panel=comments"))).toEqual({
      mode: "organize",
      page: 3,
      zoom: 1.5,
      panel: "comments",
    });
  });

  test("allows both fitted zoom modes and every panel", () => {
    expect(validateSearch(defaultParseSearch("?zoom=fit-page")).zoom).toBe("fit-page");
    expect(validateSearch(defaultParseSearch("?zoom=fit-width")).zoom).toBe("fit-width");
    for (const panel of ["files", "more", "tools", "comments", "fields", "properties", "search"] as const) {
      expect(validateSearch({ panel }).panel).toBe(panel);
    }
  });

  test("uses defaults for missing, malformed, and repeated values", () => {
    expect(validateSearch({})).toEqual(DEFAULT_VIEW_SEARCH);
    expect(validateSearch(defaultParseSearch("?mode=other&page=3.5&zoom=large&panel=other"))).toEqual(
      DEFAULT_VIEW_SEARCH,
    );
    expect(validateSearch(defaultParseSearch("?page=2&page=3&panel=files&panel=more"))).toEqual(DEFAULT_VIEW_SEARCH);
    expect(validateSearch({ page: 0, zoom: Infinity })).toEqual(DEFAULT_VIEW_SEARCH);
  });
});
