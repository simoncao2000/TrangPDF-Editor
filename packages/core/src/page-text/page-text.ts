/**
 * Text that is part of the page itself (not an annotation): one PDF text object, as the editor sees
 * it, and the rules for choosing a font when the original cannot write the new text.
 */
import type { PdfPoint, PdfRect, Rgb, TextRun, TextRunFont, TextRunLines } from "@pdf-editor/shared";

export type { TextRun, TextRunFamily, TextRunFont, TextRunLines } from "@pdf-editor/shared";

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
  /** Styles of the individual objects that make up this line. */
  readonly runs?: readonly TextRun[];
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

/** A font used by a text object on one page. The identifier is scoped to the open document. */
export interface PageFont {
  readonly id: string;
  readonly name: string;
  readonly style: FontStyle;
  readonly bytes?: ArrayBuffer;
}

/** A line with an optional explicit baseline for legacy callers. */
export interface TextRunLineLayout {
  readonly runs: readonly TextRun[];
  readonly origin?: PdfPoint;
}

/** Placement of an added text block in PDF space. */
export interface TextRunPlacement {
  readonly origin: PdfPoint;
  readonly angle: number;
  readonly fontSize: number;
}

/** Line height shared by the editor and writer. */
export const TEXT_RUN_LINE_HEIGHT = 1.15;

/**
 * Adapts old explicitly positioned Helvetica lines.
 * @param lines The old lines.
 * @param style The old shared style.
 * @returns A run per line, preserving the baselines.
 */
export function legacyTextRuns(lines: readonly NewTextLine[], style: NewTextStyle) {
  return lines.map(({ text, origin }) => ({
    origin,
    runs: [
      {
        text,
        fontFamily: "Helvetica",
        fontSize: style.fontSize,
        color: style.color,
        bold: false,
        italic: false,
        underline: false,
      },
    ] satisfies TextRun[],
  }));
}

/**
 * Removes trailing whitespace and combines adjacent spans of the same style.
 * @param lines Paragraphs of unprocessed runs.
 * @returns Normalised paragraphs, retaining blank lines.
 */
export function normalizeTextRuns(lines: TextRunLines): TextRunLines {
  return lines.map((line) => {
    const merged: TextRun[] = [];
    for (const run of line) {
      if (!run.text) continue;
      const last = merged.at(-1);
      if (last && sameRunStyle(last, run)) {
        merged[merged.length - 1] = { ...last, text: last.text + run.text };
      } else {
        merged.push(run);
      }
    }
    while (merged.length) {
      const last = merged.pop()!;
      const text = last.text.trimEnd();
      if (!text) continue;
      merged.push({ ...last, text });
      break;
    }
    return merged;
  });
}

/**
 * Reads the explicit face or adapts a legacy standard family.
 * @param run The run's font fields.
 * @returns The explicit font reference.
 */
export function textRunFont(run: Pick<TextRun, "font" | "fontFamily">): TextRunFont {
  return run.font ?? { kind: "standard", family: run.fontFamily ?? "Helvetica" };
}

/**
 * Compares two run fonts by face and instance.
 * @param a The first font.
 * @param b The second font.
 * @returns Whether both references describe the same face.
 */
function sameRunFont(a: TextRunFont, b: TextRunFont): boolean {
  if (a.kind === "standard") return b.kind === "standard" && a.family === b.family;
  return (
    b.kind === "embedded" &&
    a.fontId === b.fontId &&
    a.weight === b.weight &&
    a.italic === b.italic &&
    a.documentFontId === b.documentFontId &&
    a.name === b.name
  );
}

/**
 * Checks whether two runs can share one PDF text object.
 * @param a The first run.
 * @param b The second run.
 * @returns Whether their styles match.
 */
export function sameRunStyle(a: TextRun, b: TextRun): boolean {
  return (
    sameRunFont(textRunFont(a), textRunFont(b)) &&
    a.fontSize === b.fontSize &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.color.r === b.color.r &&
    a.color.g === b.color.g &&
    a.color.b === b.color.b
  );
}

/** A run and its measured placement in PDF space. */
export interface PositionedTextRun {
  readonly run: TextRun;
  readonly origin: PdfPoint;
  readonly advance: number;
}

/**
 * Finds the size controlling the line's pitch.
 * @param runs The runs on one line.
 * @param fallback The pitch size for an empty line.
 * @returns The largest size on the line, or the fallback.
 */
export function textRunLineSize(runs: readonly TextRun[], fallback: number): number {
  return runs.reduce((largest, run) => Math.max(largest, run.fontSize), 0) || fallback;
}

/**
 * Places runs along rotated baselines and uses the largest size for each line's pitch.
 * @param lines The paragraphs, optionally with explicit legacy baselines.
 * @param placement The first baseline, blank line size and page angle.
 * @param measure Returns a run's advance or null on failure.
 * @returns The flattened positioned runs or null on measurement failure.
 */
export function layoutTextRuns(
  lines: readonly TextRunLineLayout[],
  placement: TextRunPlacement,
  measure: (run: TextRun) => number | null,
): PositionedTextRun[] | null {
  const radians = (placement.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const positioned: PositionedTextRun[] = [];
  let down = 0;
  for (const line of lines) {
    const baseline = line.origin ?? {
      x: placement.origin.x + down * sin,
      y: placement.origin.y - down * cos,
    };
    let across = 0;
    for (const run of line.runs) {
      const advance = measure(run);
      if (advance === null) return null;
      positioned.push({
        run,
        advance,
        origin: { x: baseline.x + across * cos, y: baseline.y + across * sin },
      });
      across += advance;
    }
    down += textRunLineSize(line.runs, placement.fontSize) * TEXT_RUN_LINE_HEIGHT;
  }
  return positioned;
}

/** Page text a reader selected. */
export interface TextSelection {
  /** One rectangle per line, top line first, in PDF space. */
  readonly rects: readonly PdfRect[];
  /** What it says, lines ending in "\n". */
  readonly text: string;
}

/** One place a search query was found. */
export interface TextMatch {
  readonly pageIndex: number;
  /** One rectangle per line of the match, in PDF space. */
  readonly rects: readonly PdfRect[];
  /** The match with a few words either side, for a result list. */
  readonly snippet: { readonly before: string; readonly match: string; readonly after: string };
}

/** PDF font descriptor flags. */
const FLAG_FIXED_PITCH = 1;
const FLAG_SERIF = 2;
const FLAG_ITALIC = 64;
const FLAG_FORCE_BOLD = 1 << 18;

const MONO_NAMES = /courier|mono|consol|menlo|cmtt|lmmono|inconsolata/i;
const SERIF_NAMES =
  /times|roman|serif|georgia|garamond|minion|cambria|palatino|book|baskerville|cmr|cmbx|cmti|lmroman|nimbusrom|tinos|caladea/i;
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
    MONO_NAMES.test(name) || flags & FLAG_FIXED_PITCH
      ? "mono"
      : SANS_NAMES.test(name)
        ? "sans"
        : SERIF_NAMES.test(name) || flags & FLAG_SERIF
          ? "serif"
          : "sans";
  return {
    family,
    bold: BOLD_NAMES.test(name) || (flags & FLAG_FORCE_BOLD) !== 0,
    italic: ITALIC_NAMES.test(name) || (flags & FLAG_ITALIC) !== 0,
  };
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
