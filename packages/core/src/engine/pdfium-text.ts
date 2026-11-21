/**
 * Text geometry on a loaded PDFium page: which characters lie between two points, and where they are.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { mergeIntoLines } from "../annotations/text-lines";
import type { TextMatch } from "../page-text/page-text";
import { PdfiumHeap } from "./pdfium-heap";

/** Characters of context either side of a search match. */
const SNIPPET_CONTEXT = 32;
const UTF16_BYTES = 2;
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
   * Finds a query on a page, ignoring case.
   * @param page A loaded page.
   * @param pageIndex The page's index (copied into each match).
   * @param query The text to find.
   * @param limit Stop after this many matches.
   * @returns The matches in reading order.
   */
  find(page: number, pageIndex: number, query: string, limit: number): TextMatch[] {
    const textPage = this.pdfium.FPDFText_LoadPage(page);
    if (!textPage) return [];
    const search = this.heap.withWideString(query, (ptr) => this.pdfium.FPDFText_FindStart(textPage, ptr, 0, 0));
    const matches: TextMatch[] = [];
    try {
      const total = this.pdfium.FPDFText_CountChars(textPage);
      while (matches.length < limit && this.pdfium.FPDFText_FindNext(search)) {
        const start = this.pdfium.FPDFText_GetSchResultIndex(search);
        const count = this.pdfium.FPDFText_GetSchCount(search);
        const from = Math.max(0, start - SNIPPET_CONTEXT);
        const to = Math.min(total, start + count + SNIPPET_CONTEXT);
        matches.push({
          pageIndex,
          rects: this.rectsOf(textPage, start, count),
          snippet: {
            before: this.textOf(textPage, from, start - from).replace(/\s+/g, " ").trimStart(),
            match: this.textOf(textPage, start, count),
            after: this.textOf(textPage, start + count, to - start - count).replace(/\s+/g, " ").trimEnd(),
          },
        });
      }
    } finally {
      this.pdfium.FPDFText_FindClose(search);
      this.pdfium.FPDFText_ClosePage(textPage);
    }
    return matches;
  }

  /**
   * The rectangles of a run of characters, one per line.
   * @param textPage A loaded text page.
   * @param start First character index.
   * @param count Number of characters.
   * @returns Line rectangles in PDF space.
   */
  private rectsOf(textPage: number, start: number, count: number): PdfRect[] {
    const rects: PdfRect[] = [];
    this.heap.withBuffer(4 * DOUBLE_BYTES, (ptr) => {
      const at = (slot: number) => this.pdfium.pdfium.getValue(ptr + slot * DOUBLE_BYTES, "double");
      const total = this.pdfium.FPDFText_CountRects(textPage, start, count);
      for (let index = 0; index < total; index++) {
        if (!this.pdfium.FPDFText_GetRect(textPage, index, ptr, ptr + DOUBLE_BYTES, ptr + 2 * DOUBLE_BYTES, ptr + 3 * DOUBLE_BYTES)) continue;
        rects.push({ x: at(0), y: at(3), width: at(2) - at(0), height: at(1) - at(3) });
      }
    });
    return mergeIntoLines(rects);
  }

  /**
   * A run of a text page's characters as a string.
   * @param textPage A loaded text page.
   * @param start First character index.
   * @param count Number of characters.
   * @returns The text.
   */
  private textOf(textPage: number, start: number, count: number): string {
    if (count <= 0) return "";
    // FPDFText_GetText writes `count` UTF-16 characters plus a terminator.
    return this.heap.withBuffer((count + 1) * UTF16_BYTES, (ptr) => {
      const written = this.pdfium.FPDFText_GetText(textPage, start, count, ptr);
      let text = "";
      for (let i = 0; i < Math.max(0, written - 1); i++) text += String.fromCharCode(this.pdfium.pdfium.getValue(ptr + i * UTF16_BYTES, "i16") & 0xffff);
      return text;
    });
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
