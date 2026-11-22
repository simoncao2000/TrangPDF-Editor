/**
 * Comments on annotations, as Acrobat stores them. A markup's own comment is its /Contents, with
 * the author in /T and the time in /M. A reply is a separate note annotation (/Text) that points
 * at the markup with /IRT ("in reply to") and is flagged NoView, so it is listed in the thread but
 * never drawn on the page.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfRect } from "@pdf-editor/shared";
import { fromPdfDate, toPdfDate, type CommentNote } from "../annotations/comment";
import { PdfiumHeap, RECT_BYTES } from "./pdfium-heap";

/** FPDF_ANNOT_TEXT: a note, which is what a reply is. */
const SUBTYPE_TEXT = 1;
/** FPDF_ANNOT_FLAG_NOVIEW: kept in the file, not drawn on screen. */
const FLAG_NO_VIEW = 32;
const NAME_KEY = "NM";
const CONTENTS_KEY = "Contents";
const AUTHOR_KEY = "T";
const MODIFIED_KEY = "M";
const IN_REPLY_TO_KEY = "IRT";
const UTF16_BYTES = 2;

/** String entries of an annotation's dictionary. */
export class AnnotationStrings {
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
   * Reads a string entry.
   * @param annot The annotation handle.
   * @param key The dictionary key.
   * @returns Its text, or "" when missing.
   */
  get(annot: number, key: string): string {
    return this.heap.readWideString((ptr, bytes) => this.pdfium.FPDFAnnot_GetStringValue(annot, key, ptr, bytes));
  }

  /**
   * Writes a string entry.
   * @param annot The annotation handle.
   * @param key The dictionary key.
   * @param value The text.
   */
  set(annot: number, key: string, value: string): void {
    this.heap.withWideString(value, (ptr) => this.pdfium.FPDFAnnot_SetStringValue(annot, key, ptr));
  }
}

export class AnnotationComments {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;
  private readonly strings: AnnotationStrings;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
    this.strings = new AnnotationStrings(pdfium);
  }

  /**
   * The comment written on an annotation.
   * @param annot The annotation handle.
   * @returns Its text, author and time, or `undefined` when it has neither text nor author.
   */
  read(annot: number): CommentNote | undefined {
    const text = this.strings.get(annot, CONTENTS_KEY);
    const author = this.strings.get(annot, AUTHOR_KEY);
    if (!text && !author) return undefined;
    return { text, author, modified: fromPdfDate(this.strings.get(annot, MODIFIED_KEY)) };
  }

  /**
   * Writes a comment onto an annotation.
   * @param annot The annotation handle.
   * @param comment The text, author and time.
   */
  write(annot: number, comment: CommentNote): void {
    this.strings.set(annot, CONTENTS_KEY, comment.text);
    this.strings.set(annot, AUTHOR_KEY, comment.author);
    if (comment.modified) this.strings.set(annot, MODIFIED_KEY, toPdfDate(comment.modified));
  }

  /**
   * The annotation a reply answers.
   * @param annot An annotation handle.
   * @returns The parent's id, or `null` when the annotation is not a reply.
   */
  parentOf(annot: number): string | null {
    const parent = this.pdfium.FPDFAnnot_GetLinkedAnnot(annot, IN_REPLY_TO_KEY);
    if (!parent) return null;
    try {
      return this.strings.get(parent, NAME_KEY);
    } finally {
      this.pdfium.FPDFPage_CloseAnnot(parent);
    }
  }

  /**
   * Creates an empty reply to an annotation: a note on top of it, never drawn, linked with /IRT.
   * @param page A loaded page.
   * @param parent The annotation it answers.
   * @param id The reply's id.
   * @returns The reply's handle (the caller closes it), or 0 if PDFium refused it.
   */
  createReply(page: number, parent: number, id: string): number {
    const reply = this.pdfium.FPDFPage_CreateAnnot(page, SUBTYPE_TEXT);
    if (!reply) return 0;
    this.strings.set(reply, NAME_KEY, id);
    this.heap.withBuffer(RECT_BYTES, (ptr) => {
      if (this.pdfium.FPDFAnnot_GetRect(parent, ptr)) this.pdfium.FPDFAnnot_SetRect(reply, ptr);
    });
    this.pdfium.FPDFAnnot_SetFlags(reply, FLAG_NO_VIEW);
    this.pdfium.EPDFAnnot_SetLinkedAnnot(reply, IN_REPLY_TO_KEY, parent);
    return reply;
  }

  /**
   * The page text inside some rectangles (what a highlight covers), line by line.
   * @param page A loaded page.
   * @param lines Rectangles in PDF space.
   * @returns The text, lines joined by a space.
   */
  quote(page: number, lines: readonly PdfRect[]): string {
    const textPage = this.pdfium.FPDFText_LoadPage(page);
    if (!textPage) return "";
    try {
      return lines
        .map((line) => this.boundedText(textPage, line).trim())
        .filter(Boolean)
        .join(" ");
    } finally {
      this.pdfium.FPDFText_ClosePage(textPage);
    }
  }

  /**
   * The text inside one rectangle.
   * @param textPage A loaded text page.
   * @param rect A rectangle in PDF space.
   * @returns Its characters.
   */
  private boundedText(textPage: number, rect: PdfRect): string {
    const [left, top, right, bottom] = [rect.x, rect.y + rect.height, rect.x + rect.width, rect.y];
    // Asked with no buffer, PDFium says how many UTF-16 characters there are.
    const count = this.pdfium.FPDFText_GetBoundedText(textPage, left, top, right, bottom, 0, 0);
    if (count <= 0) return "";
    return this.heap.withBuffer((count + 1) * UTF16_BYTES, (ptr) => {
      const written = this.pdfium.FPDFText_GetBoundedText(textPage, left, top, right, bottom, ptr, count);
      let text = "";
      for (let i = 0; i < written; i++) text += String.fromCharCode(this.heap.uint16(ptr + i * UTF16_BYTES));
      return text;
    });
  }
}
