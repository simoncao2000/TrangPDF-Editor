/**
 * The mark that ties page text objects into one line. A line the editor writes one object per word
 * (because its font cannot draw spaces) has every word wrapped in marked content
 * `/TrangPDFLine <</id (…) /gap …>> BDC … EMC`, which PDFium keeps when it writes the page, so the
 * words are read back as one line after a save. Other PDF readers ignore marks they do not know.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { FLOAT_BYTES, INT_BYTES, PdfiumHeap } from "./pdfium-heap";

/** The mark's name. */
export const LINE_MARK = "TrangPDFLine";
const ID_KEY = "id";
/** The gap between words, in text space units (points before the text matrix). */
const GAP_KEY = "gap";
const UTF16_BYTES = 2;

/** What a line mark records. */
export interface LineMark {
  /** The line's id; every word of the line has the same one. */
  readonly id: string;
  /** The space between two words, in text space units. */
  readonly gap: number;
}

export class LineMarks {
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
   * Marks a page object as a word of a line.
   * @param doc The document handle.
   * @param object The page object.
   * @param line The line's id and word gap.
   * @returns False if PDFium could not add the mark.
   */
  tag(doc: number, object: number, line: LineMark): boolean {
    const mark = this.pdfium.FPDFPageObj_AddMark(object, LINE_MARK);
    return (
      mark !== 0 &&
      this.pdfium.FPDFPageObjMark_SetStringParam(doc, object, mark, ID_KEY, line.id) &&
      this.pdfium.FPDFPageObjMark_SetFloatParam(doc, object, mark, GAP_KEY, line.gap)
    );
  }

  /**
   * The line a page object belongs to.
   * @param object A page object.
   * @returns Its line mark, or `null` if it has none.
   */
  lineOf(object: number): LineMark | null {
    const count = this.pdfium.FPDFPageObj_CountMarks(object);
    for (let index = 0; index < count; index++) {
      const mark = this.pdfium.FPDFPageObj_GetMark(object, index);
      if (
        !mark ||
        this.read((ptr, bytes, out) => this.pdfium.FPDFPageObjMark_GetName(mark, ptr, bytes, out)) !== LINE_MARK
      )
        continue;
      const id = this.read((ptr, bytes, out) =>
        this.pdfium.FPDFPageObjMark_GetParamStringValue(mark, ID_KEY, ptr, bytes, out),
      );
      if (!id) return null;
      const gap = this.heap.withBuffer(FLOAT_BYTES, (ptr) =>
        this.pdfium.FPDFPageObjMark_GetParamFloatValue(mark, GAP_KEY, ptr) ? this.heap.float(ptr) : 0,
      );
      return { id, gap };
    }
    return null;
  }

  /**
   * Reads a UTF-16 string from a mark call that reports the length it needs in an out parameter.
   * @param read Calls PDFium with (buffer, byteLength, outLengthPtr) and returns whether it worked.
   * @returns The string, or "" if PDFium has none.
   */
  private read(read: (ptr: number, bytes: number, out: number) => boolean): string {
    return this.heap.withBuffer(INT_BYTES, (out) => {
      if (!read(0, 0, out)) return "";
      const bytes = this.heap.int(out);
      if (bytes <= UTF16_BYTES) return "";
      return this.heap.withBuffer(bytes, (ptr) => {
        if (!read(ptr, bytes, out)) return "";
        let text = "";
        for (let i = 0; i < bytes / UTF16_BYTES - 1; i++)
          text += String.fromCharCode(this.pdfium.pdfium.getValue(ptr + i * UTF16_BYTES, "i16") & 0xffff);
        return text;
      });
    });
  }
}
