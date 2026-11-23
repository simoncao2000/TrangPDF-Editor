/**
 * One PDFium text object at a time: reading it (text, bounds, size, colour, font), making a copy of
 * it with new text, and drawing it on its own. `PageTextObjects` builds lines out of these.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfRect } from "@pdf-editor/shared";
import { fontStyleOf, type FontStyle, type PageTextObject } from "../page-text/page-text";
import type { Rgb } from "../annotations/annotation";
import { FLOAT_BYTES, INT_BYTES, PdfiumHeap } from "./pdfium-heap";
import { MATRIX_BYTES, TextMeasure } from "./pdfium-text-measure";

/** FPDF_PAGEOBJ_TEXT. */
const TEXT_OBJECT = 1;
/** Used when PDFium cannot report a font size. */
const DEFAULT_FONT_SIZE = 12;

/** What new text is modelled on: an existing text object, and where it is drawn. */
export interface TextModel {
  /** The object whose colour the new text takes. */
  readonly object: number;
  /** Its matrix, read before it may have been parked off the page. */
  readonly matrix: readonly number[];
}

/** Where new text goes: its place in the page's object list, and what it is modelled on. */
export interface TextPlacement {
  /** Index in the page's object list to insert at. */
  readonly at: number;
  readonly model: TextModel;
  /** How far along the model's baseline to move it, in text space units. */
  readonly shift?: number;
}

/** RGBA pixels of a drawn text object. */
export interface TextPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

export class TextObjectAccess {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;
  private readonly measure: TextMeasure;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
    this.measure = new TextMeasure(pdfium);
  }

  /**
   * Whether an object is a text object that is drawn.
   * @param object A page object handle (0 for none).
   * @returns True for an active text object.
   */
  isActiveText(object: number): boolean {
    if (!object || this.pdfium.FPDFPageObj_GetType(object) !== TEXT_OBJECT) return false;
    return this.heap.withBuffer(INT_BYTES, (ptr) => {
      this.pdfium.pdfium.setValue(ptr, 1, "i32");
      // If PDFium cannot say, the object counts as active.
      return !this.pdfium.FPDFPageObj_GetIsActive(object, ptr) || this.heap.int(ptr) !== 0;
    });
  }

  /**
   * Where an object sits in the page's object list.
   * @param page A loaded page.
   * @param object A page object handle.
   * @returns Its index, or -1 if it is not on this page.
   */
  indexOf(page: number, object: number): number {
    const count = this.pdfium.FPDFPage_CountObjects(page);
    for (let index = 0; index < count; index++)
      if (this.pdfium.FPDFPage_GetObject(page, index) === object) return index;
    return -1;
  }

  /**
   * A page object's bounding box.
   * @param object A page object handle.
   * @returns Its bounds in PDF space.
   */
  boundsOf(object: number): PdfRect {
    return this.heap.withBuffer(4 * FLOAT_BYTES, (ptr) => {
      const slot = (n: number) => ptr + n * FLOAT_BYTES;
      if (!this.pdfium.FPDFPageObj_GetBounds(object, slot(0), slot(1), slot(2), slot(3)))
        return { x: 0, y: 0, width: 0, height: 0 };
      // FPDFPageObj_GetBounds writes left, bottom, right, top.
      const [left, bottom, right, top] = [0, 1, 2, 3].map((n) => this.heap.float(slot(n))) as [
        number,
        number,
        number,
        number,
      ];
      return { x: left, y: bottom, width: right - left, height: top - bottom };
    });
  }

  /**
   * A text object's font size, before the text matrix scales it.
   * @param object A text object.
   * @returns The size in points (12 if PDFium cannot say).
   */
  fontSizeOf(object: number): number {
    return this.heap.withBuffer(FLOAT_BYTES, (ptr) =>
      this.pdfium.FPDFTextObj_GetFontSize(object, ptr) ? this.heap.float(ptr) : DEFAULT_FONT_SIZE,
    );
  }

  /**
   * How a font looks.
   * @param font A font handle.
   * @returns Its family, weight and slant, from its name and flags.
   */
  styleOf(font: number): FontStyle {
    return fontStyleOf(this.fontName(font), this.pdfium.FPDFFont_GetFlags(font));
  }

  /**
   * The Unicode text of a text object.
   * @param textPage The page's loaded text page.
   * @param object The text object.
   * @returns Its text.
   */
  readText(textPage: number, object: number): string {
    return this.heap.readWideString((ptr, bytes) => this.pdfium.FPDFTextObj_GetText(object, textPage, ptr, bytes));
  }

  /**
   * Loads a page's text page, runs `work`, and closes it.
   * @param page A loaded page.
   * @param work What to do with the text page.
   * @returns `work`'s result.
   */
  withTextPage<T>(page: number, work: (textPage: number) => T): T {
    const textPage = this.pdfium.FPDFText_LoadPage(page);
    try {
      return work(textPage);
    } finally {
      this.pdfium.FPDFText_ClosePage(textPage);
    }
  }

  /**
   * Describes a text object for the editor.
   * @param textPage The page's loaded text page.
   * @param object The text object.
   * @param id Its id.
   * @param bounds Its bounds.
   * @returns The record.
   */
  describe(textPage: number, object: number, id: string, bounds: PdfRect): PageTextObject {
    const font = this.pdfium.FPDFTextObj_GetFont(object);
    // The text matrix may scale the font (LaTeX writes "1 Tf" and scales the matrix).
    const [, , c = 0, d = 1] = this.measure.matrixOf(object);
    const scale = Math.hypot(c, d) || 1;
    return {
      id,
      text: this.readText(textPage, object),
      bounds,
      fontSize: this.fontSizeOf(object) * scale,
      color: this.fillColorOf(object),
      style: this.styleOf(font),
    };
  }

  /**
   * Fills in a new text object like a model (matrix, colour) and inserts it.
   * @param page A loaded page.
   * @param placement Where it goes and what it is modelled on.
   * @param created A new, empty text object (0 if PDFium could not make one).
   * @param text Its text.
   * @returns The inserted object, or 0 (then `created` is destroyed).
   */
  insertLike(page: number, placement: TextPlacement, created: number, text: string): number {
    if (!created) return 0;
    const { at, model, shift = 0 } = placement;
    const set = this.heap.withWideString(text, (ptr) => this.pdfium.FPDFText_SetText(created, ptr));
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = model.matrix;
    this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      this.heap.writeFloats(ptr, [a, b, c, d, e + a * shift, f + b * shift]);
      this.pdfium.FPDFPageObj_SetMatrix(created, ptr);
    });
    this.heap.withBuffer(4 * INT_BYTES, (ptr) => {
      const slot = (n: number) => ptr + n * INT_BYTES;
      if (this.pdfium.FPDFPageObj_GetFillColor(model.object, slot(0), slot(1), slot(2), slot(3))) {
        this.pdfium.FPDFPageObj_SetFillColor(
          created,
          this.heap.int(slot(0)),
          this.heap.int(slot(1)),
          this.heap.int(slot(2)),
          this.heap.int(slot(3)),
        );
      }
    });
    if (!set || !this.pdfium.FPDFPage_InsertObjectAtIndex(page, created, at)) {
      this.pdfium.FPDFPageObj_Destroy(created);
      return 0;
    }
    return created;
  }

  /**
   * Takes inserted objects off the page and frees them.
   * @param page A loaded page.
   * @param objects Objects on that page.
   */
  discard(page: number, objects: readonly number[]): void {
    for (const object of objects) {
      this.pdfium.FPDFPage_RemoveObject(page, object);
      this.pdfium.FPDFPageObj_Destroy(object);
    }
  }

  /**
   * Draws one text object on its own, on a transparent background, cropped to its bounds.
   * @param doc The document handle.
   * @param page A loaded page.
   * @param object The text object.
   * @param scale Device pixels per point.
   * @returns RGBA pixels, or `null` if PDFium could not draw it.
   */
  render(doc: number, page: number, object: number, scale: number): TextPixels | null {
    const bitmap = this.pdfium.FPDFTextObj_GetRenderedBitmap(doc, page, object, scale);
    if (!bitmap) return null;
    try {
      const width = this.pdfium.FPDFBitmap_GetWidth(bitmap);
      const height = this.pdfium.FPDFBitmap_GetHeight(bitmap);
      const stride = this.pdfium.FPDFBitmap_GetStride(bitmap);
      const start = this.pdfium.FPDFBitmap_GetBuffer(bitmap);
      const source = this.pdfium.pdfium.HEAPU8.subarray(start, start + stride * height);
      // PDFium writes BGRA rows padded to `stride`; the page renderer wants tight RGBA.
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const from = y * stride + x * 4;
          const to = (y * width + x) * 4;
          pixels[to] = source[from + 2]!;
          pixels[to + 1] = source[from + 1]!;
          pixels[to + 2] = source[from]!;
          pixels[to + 3] = source[from + 3]!;
        }
      }
      return { width, height, pixels };
    } finally {
      this.pdfium.FPDFBitmap_Destroy(bitmap);
    }
  }

  /**
   * A page object's fill colour.
   * @param object A page object.
   * @returns The colour; black if PDFium cannot say.
   */
  private fillColorOf(object: number): Rgb {
    return this.heap.withBuffer(4 * INT_BYTES, (ptr) =>
      this.pdfium.FPDFPageObj_GetFillColor(object, ptr, ptr + INT_BYTES, ptr + 2 * INT_BYTES, ptr + 3 * INT_BYTES)
        ? { r: this.heap.int(ptr), g: this.heap.int(ptr + INT_BYTES), b: this.heap.int(ptr + 2 * INT_BYTES) }
        : { r: 0, g: 0, b: 0 },
    );
  }

  /**
   * A font's /BaseFont name.
   * @param font A font handle.
   * @returns The name (UTF-8), or "" when unknown.
   */
  fontName(font: number): string {
    if (!font) return "";
    const bytes = this.pdfium.FPDFFont_GetBaseFontName(font, 0, 0);
    if (bytes <= 1) return "";
    return this.heap.withBuffer(bytes, (ptr) => {
      this.pdfium.FPDFFont_GetBaseFontName(font, ptr, bytes);
      return this.pdfium.pdfium.UTF8ToString(ptr);
    });
  }
}
