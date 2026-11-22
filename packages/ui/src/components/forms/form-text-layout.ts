import { CSS_PIXELS_PER_POINT, fontStyleOf, withoutSubsetTag, type FormField } from "@pdf-editor/core";

interface FormFont {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  /** PDFium's standard face metrics, in ems. */
  readonly ascent: number;
  readonly descent: number;
}

// Match PDFium's discrete single-line auto sizes.
const AUTO_SIZES = [
  4, 6, 8, 9, 10, 12, 14, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 144,
];
export const CHOICE_BUTTON_POINTS = 13;

type FontSizeField = Pick<FormField, "fontSize" | "multiline" | "rect" | "textInset" | "kind">;

/**
 * Maps a PDF standard face to its browser stack and PDFium line metrics.
 * @param name The name reported by PDFium.
 * @returns The browser face and PDFium's ascent and descent ratios.
 */
export function formFontFace(name: string): FormFont {
  const { bold, italic } = fontStyleOf(name, 0);
  const face = { weight: bold ? 700 : 400, style: italic ? ("italic" as const) : ("normal" as const) };
  const base = withoutSubsetTag(name);
  if (/^Times(?:[- ]|$)/i.test(base)) {
    return { ...face, family: 'Times, "Times New Roman", serif', ascent: 0.878, descent: 0.249 };
  }
  if (/^Courier(?:[- ]|$)/i.test(base)) {
    return { ...face, family: 'Courier, "Courier New", monospace', ascent: 0.803, descent: 0.248 };
  }
  const family = /^Helvetica(?:[- ]|$)/i.test(base) ? "Helvetica, Arial, sans-serif" : "sans-serif";
  return { ...face, family, ascent: 0.945, descent: 0.224 };
}

/**
 * Resolves explicit and automatic font sizes in PDF points.
 * @param widget The size, widget bounds and text inset.
 * @param font PDFium's line metrics for the face.
 * @param widthInEms The text width at a font size of one point.
 * @returns The font size in points.
 */
export function formFontSize(widget: FontSizeField, font: FormFont, widthInEms = 0): number {
  if (widget.fontSize > 0) return widget.fontSize;
  if (widget.multiline) return 12;

  const tall = (widget.rect.height - 2 * widget.textInset) / (font.ascent + font.descent);
  const choiceButton = widget.kind === "choice" ? CHOICE_BUTTON_POINTS : 0;
  const wide = widthInEms > 0 ? (widget.rect.width - 2 * widget.textInset - choiceButton) / widthInEms : Infinity;
  return AUTO_SIZES.findLast((size) => size <= Math.min(tall, wide)) ?? AUTO_SIZES[0]!;
}

/**
 * Converts a distance in PDF points to CSS pixels at the current zoom.
 * @param points A font size, inset or other length in points.
 * @param zoom The page zoom, with one for 100 percent.
 * @returns The length in CSS pixels.
 */
export function scaleFormPoints(points: number, zoom: number): number {
  return points * zoom * CSS_PIXELS_PER_POINT;
}

/**
 * Computes the difference between the PDF and browser baselines, in ems.
 * @param font The PDFium face metrics and line height.
 * @param browser The browser face's ascent and descent, in ems.
 * @returns The vertical offset that aligns the browser baseline with PDFium.
 */
export function formBaselineOffset(
  font: Pick<FormFont, "ascent" | "descent">,
  browser: Pick<FormFont, "ascent" | "descent">,
): number {
  return (font.ascent - font.descent - (browser.ascent - browser.descent)) / 2;
}
