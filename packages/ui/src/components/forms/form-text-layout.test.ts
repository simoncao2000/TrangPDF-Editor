import { describe, expect, it } from "bun:test";
import { formBaselineOffset, formFontFace, formFontSize, scaleFormPoints } from "./form-text-layout";

const widget = {
  fontSize: 0,
  multiline: false,
  kind: "text",
  rect: { x: 72, y: 690, width: 300, height: 22 },
  textInset: 1,
} as const;

describe("PDF form text layout", () => {
  it("uses the standard face, style and fallback stacks", () => {
    expect(formFontFace("Helvetica").family).toBe("Helvetica, Arial, sans-serif");
    expect(formFontFace("Times-Roman").family).toBe('Times, "Times New Roman", serif');
    expect(formFontFace("ABCDEF+Courier-BoldOblique")).toMatchObject({
      family: 'Courier, "Courier New", monospace',
      weight: 700,
      style: "italic",
    });
    expect(formFontFace("Custom").family).toBe("sans-serif");
  });

  it("preserves an explicit size and uses 12 pt for automatic multiline text", () => {
    const helvetica = formFontFace("Helvetica");
    expect(formFontSize({ ...widget, fontSize: 10.5 }, helvetica, 100)).toBe(10.5);
    expect(formFontSize({ ...widget, multiline: true }, helvetica)).toBe(12);
  });

  it("uses PDFium's font steps to fit single-line height and width", () => {
    const helvetica = formFontFace("Helvetica");
    expect(formFontSize(widget, helvetica)).toBe(14);
    expect(formFontSize(widget, formFontFace("Courier"))).toBe(18);
    expect(formFontSize({ ...widget, textInset: 2, rect: { ...widget.rect, height: 15 } }, helvetica)).toBe(9);
    expect(formFontSize(widget, helvetica, 25)).toBe(10);
    expect(formFontSize({ ...widget, kind: "choice" }, helvetica, 24)).toBe(10);
  });

  it("scales both the printed font size and the text inset with the page", () => {
    expect(scaleFormPoints(12, 1)).toBe(16);
    expect(scaleFormPoints(12, 1.5)).toBe(24);
    expect(scaleFormPoints(2, 0.75)).toBe(2);
  });

  it("corrects the browser baseline by the difference in font metrics", () => {
    const helvetica = formFontFace("Helvetica");
    expect(formBaselineOffset(helvetica, helvetica)).toBe(0);
    expect(formBaselineOffset(helvetica, { ascent: 0.9, descent: 0.2 })).toBeCloseTo(0.0105);
  });
});
