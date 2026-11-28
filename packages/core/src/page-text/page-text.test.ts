import { describe, expect, test } from "bun:test";
import { fontStyleOf, standardFontFor, withoutSubsetTag } from "./page-text";

describe("withoutSubsetTag", () => {
  test("drops the subset tag", () => {
    expect(withoutSubsetTag("ABCDEF+CMR10")).toBe("CMR10");
    expect(withoutSubsetTag("Helvetica")).toBe("Helvetica");
  });
});

describe("fontStyleOf", () => {
  test.each([
    ["ABCDEF+CMR10", 0, { family: "serif", bold: false, italic: false }],
    ["ABCDEF+CMBX12", 0, { family: "serif", bold: true, italic: false }],
    ["ABCDEF+CMTI10", 0, { family: "serif", bold: false, italic: true }],
    ["ArialMT", 2, { family: "serif", bold: false, italic: false }],
    ["ArialMT", 0, { family: "sans", bold: false, italic: false }],
    ["Helvetica-BoldOblique", 0, { family: "sans", bold: true, italic: true }],
    ["CourierNewPSMT", 0, { family: "mono", bold: false, italic: false }],
    ["XYZABC+SomeFont", 2, { family: "serif", bold: false, italic: false }],
    ["XYZABC+SomeFont", 1, { family: "mono", bold: false, italic: false }],
    ["XYZABC+SomeFont", 0, { family: "sans", bold: false, italic: false }],
  ] as const)("reads %s (flags %i)", (name, flags, expected) => {
    expect(fontStyleOf(name, flags)).toEqual(expected);
  });
});

describe("standardFontFor", () => {
  test("picks the matching standard font", () => {
    expect(standardFontFor({ family: "serif", bold: true, italic: true })).toBe("Times-BoldItalic");
    expect(standardFontFor({ family: "sans", bold: false, italic: true })).toBe("Helvetica-Oblique");
    expect(standardFontFor({ family: "mono", bold: false, italic: false })).toBe("Courier");
  });
});
