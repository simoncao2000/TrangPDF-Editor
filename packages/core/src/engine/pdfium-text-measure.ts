/**
 * Measuring text in a font without touching the page: how far ink reaches, whether a font's spaces
 * have any width, and how long an existing text object is along its baseline.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { FLOAT_BYTES, PdfiumHeap, QUAD_BYTES } from "./pdfium-heap";

/** A space narrower than this (in em) counts as missing; real fonts' spaces are about 0.25 em. */
export const MIN_SPACE_EM = 0.1;
/** FS_MATRIX: a, b, c, d, e, f. */
export const MATRIX_BYTES = 6 * FLOAT_BYTES;

/** A font at a size, in a document: what text is measured or written in. */
export interface FontFace {
  /** The document handle the font belongs to. */
  readonly doc: number;
  readonly font: number;
  /** Font size in points, before any text matrix scales it. */
  readonly size: number;
}

/** Where a text's ink starts and ends along the baseline, from the text's origin, in text space. */
export interface Ink {
  readonly left: number;
  readonly right: number;
}

export class TextMeasure {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
  }

  /**
   * Where a text's ink would reach in a font, measured on a scratch object that is never inserted.
   * @param face The font, size and document.
   * @param text The text.
   * @returns The ink's extent from the origin, or `null` if PDFium cannot write the text.
   */
  inkOf(face: FontFace, text: string): Ink | null {
    const scratch = this.pdfium.FPDFPageObj_CreateTextObj(face.doc, face.font, face.size);
    if (!scratch) return null;
    try {
      if (!this.heap.withWideString(text, (ptr) => this.pdfium.FPDFText_SetText(scratch, ptr))) return null;
      return this.heap.withBuffer(4 * FLOAT_BYTES, (ptr) => {
        // FPDFPageObj_GetBounds writes left, bottom, right, top.
        if (
          !this.pdfium.FPDFPageObj_GetBounds(
            scratch,
            ptr,
            ptr + FLOAT_BYTES,
            ptr + 2 * FLOAT_BYTES,
            ptr + 3 * FLOAT_BYTES,
          )
        )
          return null;
        return { left: this.heap.float(ptr), right: this.heap.float(ptr + 2 * FLOAT_BYTES) };
      });
    } finally {
      this.pdfium.FPDFPageObj_Destroy(scratch);
    }
  }

  /**
   * Whether a font draws the spaces between words with (almost) no width. pdfTeX makes word gaps by
   * moving the pen, not with a space glyph, and gives unused codes, the space among them, a width of
   * 0; text written with real spaces in such a font runs together.
   * @param face The font, size and document.
   * @param text The text to be written.
   * @returns True when the spaces inside the text would be narrower than `MIN_SPACE_EM` each.
   */
  spacesCollapse(face: FontFace, text: string): boolean {
    const inner = text.trim();
    const spaces = inner.match(/\s/g)?.length ?? 0;
    if (spaces === 0) return false;
    // Leading and trailing spaces have no ink, so only spaces between words change the width.
    const withSpaces = this.inkOf(face, inner);
    const without = this.inkOf(face, inner.replace(/\s/g, ""));
    if (!withSpaces || !without) return true;
    return widthOf(withSpaces) - widthOf(without) < spaces * face.size * MIN_SPACE_EM;
  }

  /**
   * How far the pen moves after a word: where a character written right after it would start.
   * @param face The font, size and document.
   * @param word The word.
   * @returns The advance in text space units, or `null` if the font cannot write the word.
   */
  advanceOf(face: FontFace, word: string): number | null {
    // A probe glyph the font surely has (the word's first) lands one advance after the word starts.
    const probe = word[0]!;
    const withProbe = this.inkOf(face, word + probe);
    const alone = this.inkOf(face, probe);
    return withProbe && alone ? withProbe.right - alone.right : null;
  }

  /**
   * A text object's matrix.
   * @param object A page object.
   * @returns [a, b, c, d, e, f], or the identity if PDFium cannot say.
   */
  matrixOf(object: number): number[] {
    return this.heap.withBuffer(MATRIX_BYTES, (ptr) =>
      this.pdfium.FPDFPageObj_GetMatrix(object, ptr)
        ? Array.from({ length: 6 }, (_, i) => this.heap.float(ptr + i * FLOAT_BYTES))
        : [1, 0, 0, 1, 0, 0],
    );
  }

  /**
   * How long a text object's ink is along its own baseline, in text space units (before its matrix
   * scales it), whatever angle it is drawn at.
   * @param object A text object.
   * @returns The length, or 0 if PDFium cannot say.
   */
  lengthAlongBaseline(object: number): number {
    const [a = 1, b = 0] = this.matrixOf(object);
    const scale = Math.hypot(a, b) || 1;
    const direction = { x: a / scale, y: b / scale };
    return this.heap.withBuffer(QUAD_BYTES, (ptr) => {
      if (!this.pdfium.FPDFPageObj_GetRotatedBounds(object, ptr)) return 0;
      const corners = Array.from({ length: 4 }, (_, i) => ({
        x: this.heap.float(ptr + 2 * i * FLOAT_BYTES),
        y: this.heap.float(ptr + (2 * i + 1) * FLOAT_BYTES),
      }));
      // Of the three sides and diagonals from the first corner, the baseline is the one parallel
      // to the text's x direction.
      const edges = corners.slice(1).map((corner) => ({ x: corner.x - corners[0]!.x, y: corner.y - corners[0]!.y }));
      const along = edges.reduce((best, edge) => (skew(edge, direction) < skew(best, direction) ? edge : best));
      return Math.hypot(along.x, along.y) / scale;
    });
  }
}

/**
 * How wide some ink is.
 * @param ink Where the ink starts and ends.
 * @returns Its width.
 */
export function widthOf(ink: Ink): number {
  return ink.right - ink.left;
}

/**
 * How far a vector is from pointing along a direction (0 when parallel).
 * @param vector Any vector.
 * @param direction A unit vector.
 * @returns |sin| of the angle between them; 1 for a zero vector.
 */
function skew(vector: { x: number; y: number }, direction: { x: number; y: number }): number {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? 1 : Math.abs(vector.x * direction.y - vector.y * direction.x) / length;
}
