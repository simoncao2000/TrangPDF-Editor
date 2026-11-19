/**
 * Text that is part of the page itself (not an annotation): one PDF text object, as the editor sees
 * it, and the rules for choosing a font when the original cannot write the new text.
 */
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import type { Rgb } from "../annotations/annotation";

export type FontFamilyKind = "serif" | "sans" | "mono";

/** How a font looks, worked out from its name and flags. */
export interface FontStyle {
  readonly family: FontFamilyKind;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** One text object on a page. */
export interface PageTextObject {
  /** Stable id for this object while the document is open; how edits find it. */
  readonly id: string;
  readonly text: string;
  /** Where the text is drawn, in PDF space. */
  readonly bounds: PdfRect;
  /** The size the text appears at, in points (font size × the text matrix's scale). */
  readonly fontSize: number;
  readonly color: Rgb;
  readonly style: FontStyle;
}

/** One new line of page text. */
export interface NewTextLine {
  readonly text: string;
  /** Where the line's baseline starts, in PDF space. */
  readonly origin: PdfPoint;
}

/** How new page text looks. */
export interface NewTextStyle {
  readonly fontSize: number;
  readonly color: Rgb;
  /** Counter-clockwise turn in degrees, so the text reads upright on a turned page. */
  readonly angle: number;
}

/** PDF font descriptor flags. */
const FLAG_FIXED_PITCH = 1;
const FLAG_SERIF = 2;
const FLAG_ITALIC = 64;
const FLAG_FORCE_BOLD = 1 << 18;

const MONO_NAMES = /courier|mono|consol|menlo|cmtt|lmmono|inconsolata/i;
const SERIF_NAMES = /times|roman|serif|georgia|garamond|minion|cambria|palatino|book|baskerville|cmr|cmbx|cmti|lmroman|nimbusrom|tinos|caladea/i;
const SANS_NAMES = /sans|helvet|arial|verdana|calibri|segoe|roboto|inter|lato|cmss|arimo|carlito/i;
const BOLD_NAMES = /bold|black|heavy|semibold|demi|cmbx|-bd/i;
const ITALIC_NAMES = /italic|oblique|cmti|-it\b/i;

/**
 * A font's base name without the six-letter subset tag PDF writers add (e.g. "ABCDEF+CMR10").
 * @param baseName The font's /BaseFont.
 * @returns The name without the tag.
 */
export function withoutSubsetTag(baseName: string): string {
  return baseName.replace(/^[A-Z]{6}\+/, "");
}

/**
 * Works out how a font looks from its name, then its flags.
 * @param baseName The font's /BaseFont.
 * @param flags The font descriptor's flags (0 when unknown).
 * @returns Family, bold and italic.
 */
export function fontStyleOf(baseName: string, flags: number): FontStyle {
  const name = withoutSubsetTag(baseName);
  const family: FontFamilyKind =
    MONO_NAMES.test(name) || flags & FLAG_FIXED_PITCH ? "mono" : SANS_NAMES.test(name) ? "sans" : SERIF_NAMES.test(name) || flags & FLAG_SERIF ? "serif" : "sans";
  return { family, bold: BOLD_NAMES.test(name) || (flags & FLAG_FORCE_BOLD) !== 0, italic: ITALIC_NAMES.test(name) || (flags & FLAG_ITALIC) !== 0 };
}

const STANDARD_FONTS: Record<FontFamilyKind, readonly [string, string, string, string]> = {
  // regular, bold, italic, bold italic
  serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

/**
 * The PDF standard font closest to a style; every viewer has these, so they need no embedding.
 * @param style Family, bold and italic.
 * @returns A standard 14 font name.
 */
export function standardFontFor(style: FontStyle): string {
  const variants = STANDARD_FONTS[style.family];
  return variants[(style.bold ? 1 : 0) + (style.italic ? 2 : 0)]!;
}
