import { describe, expect, test } from "bun:test";
import { matchScore, parseQuery, tidySnippet } from "./query";

describe("parseQuery", () => {
  test.each([
    ["tide", { mode: "search", text: "tide" }],
    ["> rotate ", { mode: "commands", text: "rotate" }],
    [":12", { mode: "page", page: 12 }],
    [":", { mode: "page", page: null }],
    [":abc", { mode: "page", page: null }],
  ] as const)("reads %j", (raw, expected) => {
    expect(parseQuery(raw)).toEqual(expected);
  });
});

describe("matchScore", () => {
  test("matches letters in order, across words", () => {
    expect(matchScore("Rotate page clockwise", "rot cl")).toBeGreaterThan(0);
    expect(matchScore("Rotate page clockwise", "clrot")).toBe(0);
  });

  test("prefers matches at word starts", () => {
    expect(matchScore("Zoom in", "zi")).toBeGreaterThan(matchScore("Organize pages", "zi"));
  });

  test("matches everything when nothing is typed", () => {
    expect(matchScore("Anything", "")).toBe(1);
  });
});

describe("tidySnippet", () => {
  test("drops words cut off at either end and separators at the start", () => {
    expect(tidySnippet({ before: "kout 2.4 km · Benches, water C · ", match: "Tide", after: " marker 4.1 km Low tide only Co" })).toEqual({
      before: "…2.4 km · Benches, water C · ",
      match: "Tide",
      after: " marker 4.1 km Low tide only…",
    });
    expect(tidySnippet({ before: "il · The headland trail Check the ", match: "tide", after: " before" }).before).toBe("…The headland trail Check the ");
  });

  test("keeps a match with no context on one side as it is", () => {
    expect(tidySnippet({ before: "", match: "Tide", after: " tables for the head" })).toEqual({ before: "", match: "Tide", after: " tables for the…" });
  });
});
