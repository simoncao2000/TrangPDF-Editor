/**
 * Text geometry on a loaded PDFium page: which characters lie between two points, and where they are.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { mergeIntoLines } from "../annotations/text-lines";
import { PdfiumHeap } from "./pdfium-heap";

/** How far from a character a point may be and still hit it, in points. */
const HIT_TOLERANCE = 6;
const DOUBLE_BYTES = 8;

export class PageText {
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
   * The rectangles of the text between two points, as a reader would select it.
   * @param page A loaded page.
   * @param from Where the selection started, in PDF space.
   * @param to Where it ends, in PDF space.
   * @returns One rectangle per line, top line first; empty when either point misses the text.
   */
  rectsBetween(page: number, from: PdfPoint, to: PdfPoint): PdfRect[] {
    const textPage = this.pdfium.FPDFText_LoadPage(page);
    if (!textPage) return [];
    try {
      const a = this.charAt(textPage, from);
      const b = this.charAt(textPage, to);
      if (a < 0 || b < 0) return [];
      const start = Math.min(a, b);
      const count = Math.max(a, b) - start + 1;
      const rects: PdfRect[] = [];
      this.heap.withBuffer(4 * DOUBLE_BYTES, (ptr) => {
        const at = (slot: number) => this.pdfium.pdfium.getValue(ptr + slot * DOUBLE_BYTES, "double");
        const total = this.pdfium.FPDFText_CountRects(textPage, start, count);
        for (let index = 0; index < total; index++) {
          if (!this.pdfium.FPDFText_GetRect(textPage, index, ptr, ptr + DOUBLE_BYTES, ptr + 2 * DOUBLE_BYTES, ptr + 3 * DOUBLE_BYTES)) continue;
          const [left, top, right, bottom] = [at(0), at(1), at(2), at(3)];
          rects.push({ x: left, y: bottom, width: right - left, height: top - bottom });
        }
      });
      return mergeIntoLines(rects);
    } finally {
      this.pdfium.FPDFText_ClosePage(textPage);
    }
  }

  /**
   * The character under a point.
   * @param textPage A loaded text page.
   * @param point A point in PDF space.
   * @returns The character index, or -1 if no character is close enough.
   */
  private charAt(textPage: number, point: PdfPoint): number {
    return this.pdfium.FPDFText_GetCharIndexAtPos(textPage, point.x, point.y, HIT_TOLERANCE, HIT_TOLERANCE);
  }
}
