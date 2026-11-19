/**
 * The page's own text (PDF text objects) on a loaded PDFium page: finding it, changing it, adding
 * new lines of it.
 *
 * Objects are never deleted. An edit switches the original off ("inactive": not drawn, not saved)
 * and inserts a replacement after it; added text is switched off for undo. Undo and redo switch
 * objects on and off by id, so nothing is lost. Ids map to object handles, which only stay valid
 * while the page stays loaded, so the engine keeps such pages open (see `PdfiumEngine`).
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { fontStyleOf, standardFontFor, type NewTextLine, type NewTextStyle, type PageTextObject } from "../page-text/page-text";
import { FLOAT_BYTES, INT_BYTES, PdfiumHeap } from "./pdfium-heap";

/** FPDF_PAGEOBJ_TEXT. */
const TEXT_OBJECT = 1;
/** A point this close to a text object's box (in points) still hits it. */
const HIT_TOLERANCE = 2;
/** FS_MATRIX: a, b, c, d, e, f. */
const MATRIX_BYTES = 6 * FLOAT_BYTES;
const OPAQUE = 255;
/** The font new text is written in; every viewer has it. */
const NEW_TEXT_FONT = "Helvetica";

/** Ids for the text objects of one document's loaded pages. */
export class TextObjectIds {
  private readonly byHandle = new Map<number, string>();
  private readonly byId = new Map<string, number>();
  private next = 1;

  /**
   * The id of an object, giving it one the first time.
   * @param handle A page object handle.
   * @returns Its id.
   */
  idOf(handle: number): string {
    let id = this.byHandle.get(handle);
    if (!id) {
      id = `text-${this.next++}`;
      this.register(id, handle);
    }
    return id;
  }

  /**
   * Records an id chosen by the caller for a new object.
   * @param id The id.
   * @param handle The object's handle.
   */
  register(id: string, handle: number): void {
    this.byHandle.set(handle, id);
    this.byId.set(id, handle);
  }

  /**
   * The object with an id.
   * @param id An id.
   * @returns Its handle, or 0 if unknown.
   */
  handleOf(id: string): number {
    return this.byId.get(id) ?? 0;
  }
}

export class PageTextObjects {
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
   * The text object under a point; the topmost one when they overlap.
   * @param page A loaded page.
   * @param ids The document's id registry.
   * @param point A point in PDF space.
   * @returns The text object, or `null` when there is no visible text there.
   */
  objectAt(page: number, ids: TextObjectIds, point: PdfPoint): PageTextObject | null {
    for (let index = this.pdfium.FPDFPage_CountObjects(page) - 1; index >= 0; index--) {
      const object = this.pdfium.FPDFPage_GetObject(page, index);
      if (!this.isActiveText(object)) continue;
      const bounds = this.boundsOf(object);
      const hit =
        point.x >= bounds.x - HIT_TOLERANCE && point.x <= bounds.x + bounds.width + HIT_TOLERANCE && point.y >= bounds.y - HIT_TOLERANCE && point.y <= bounds.y + bounds.height + HIT_TOLERANCE;
      if (hit) return this.withTextPage(page, (textPage) => this.describe(textPage, object, ids.idOf(object), bounds));
    }
    return null;
  }

  /**
   * Every visible text object on a page, in drawing order. Objects with no text (spacing only) are
   * left out.
   * @param page A loaded page.
   * @param ids The document's id registry.
   * @returns The text objects.
   */
  list(page: number, ids: TextObjectIds): PageTextObject[] {
    return this.withTextPage(page, (textPage) => {
      const result: PageTextObject[] = [];
      const count = this.pdfium.FPDFPage_CountObjects(page);
      for (let index = 0; index < count; index++) {
        const object = this.pdfium.FPDFPage_GetObject(page, index);
        if (!this.isActiveText(object)) continue;
        const described = this.describe(textPage, object, ids.idOf(object), this.boundsOf(object));
        if (described.text.trim()) result.push(described);
      }
      return result;
    });
  }

  /**
   * Replaces a text object's text: switches the original off and inserts a replacement right after
   * it, in the same font when the font can write the new text, otherwise in the closest standard font.
   * @param doc The document handle (new objects belong to it).
   * @param page A loaded page.
   * @param ids The document's id registry.
   * @param id The text object's id.
   * @param newId The id to give the replacement.
   * @param text The new text.
   * @returns False if `id` is not a visible text object on this page or PDFium refused the text.
   */
  replace(doc: number, page: number, ids: TextObjectIds, id: string, newId: string, text: string): boolean {
    const original = ids.handleOf(id);
    const index = original ? this.indexOf(page, original) : -1;
    if (index < 0 || !this.isActiveText(original)) return false;
    const font = this.pdfium.FPDFTextObj_GetFont(original);
    const size = this.fontSizeOf(original);

    // First try the original font; if it lacks a glyph the text reads back differently.
    let replacement = this.insertLike(page, index + 1, original, this.pdfium.FPDFPageObj_CreateTextObj(doc, font, size), text);
    if (replacement && this.withTextPage(page, (textPage) => this.readText(textPage, replacement)) !== text) {
      this.pdfium.FPDFPage_RemoveObject(page, replacement);
      this.pdfium.FPDFPageObj_Destroy(replacement);
      replacement = 0;
    }
    if (!replacement) {
      const fallback = standardFontFor(fontStyleOf(this.fontName(font), this.pdfium.FPDFFont_GetFlags(font)));
      replacement = this.insertLike(page, index + 1, original, this.pdfium.FPDFPageObj_NewTextObj(doc, fallback, size), text);
    }
    if (!replacement) return false;
    this.pdfium.FPDFPageObj_SetIsActive(original, false);
    ids.register(newId, replacement);
    return true;
  }

  /**
   * Adds lines of text to the page, in Helvetica, after everything else on it.
   * @param doc The document handle.
   * @param page A loaded page.
   * @param ids The document's id registry.
   * @param lines The lines, each with where its baseline starts.
   * @param style Size, colour and angle.
   * @param newIds One id per line.
   * @returns False if PDFium refused a line (none are added then).
   */
  add(doc: number, page: number, ids: TextObjectIds, lines: readonly NewTextLine[], style: NewTextStyle, newIds: readonly string[]): boolean {
    const radians = (style.angle * Math.PI) / 180;
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
    const created: number[] = [];
    for (const line of lines) {
      const object = this.pdfium.FPDFPageObj_NewTextObj(doc, NEW_TEXT_FONT, style.fontSize);
      const written = object && this.heap.withWideString(line.text, (ptr) => this.pdfium.FPDFText_SetText(object, ptr));
      if (!written) {
        if (object) this.pdfium.FPDFPageObj_Destroy(object);
        created.forEach((done) => {
          this.pdfium.FPDFPage_RemoveObject(page, done);
          this.pdfium.FPDFPageObj_Destroy(done);
        });
        return false;
      }
      this.pdfium.FPDFPageObj_Transform(object, cos, sin, -sin, cos, line.origin.x, line.origin.y);
      this.pdfium.FPDFPageObj_SetFillColor(object, style.color.r, style.color.g, style.color.b, OPAQUE);
      this.pdfium.FPDFPage_InsertObject(page, object);
      created.push(object);
    }
    created.forEach((object, i) => ids.register(newIds[i]!, object));
    return true;
  }

  /**
   * Switches text objects on and off (undo and redo).
   * @param page A loaded page.
   * @param ids The document's id registry.
   * @param show Ids to switch on.
   * @param hide Ids to switch off.
   * @returns False if an id is not an object on this page.
   */
  show(page: number, ids: TextObjectIds, show: readonly string[], hide: readonly string[]): boolean {
    const handles = [...show, ...hide].map((id) => ids.handleOf(id));
    if (handles.some((handle) => !handle || this.indexOf(page, handle) < 0)) return false;
    hide.forEach((id) => this.pdfium.FPDFPageObj_SetIsActive(ids.handleOf(id), false));
    show.forEach((id) => this.pdfium.FPDFPageObj_SetIsActive(ids.handleOf(id), true));
    return true;
  }

  /**
   * Fills in a new text object like the original (position, scale, colour) and inserts it.
   * @param page A loaded page.
   * @param at Index to insert at.
   * @param original The object being replaced.
   * @param created A new, empty text object (0 if PDFium could not make one).
   * @param text Its text.
   * @returns The inserted object, or 0.
   */
  private insertLike(page: number, at: number, original: number, created: number, text: string): number {
    if (!created) return 0;
    const set = this.heap.withWideString(text, (ptr) => this.pdfium.FPDFText_SetText(created, ptr));
    this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      if (this.pdfium.FPDFPageObj_GetMatrix(original, ptr)) this.pdfium.FPDFPageObj_SetMatrix(created, ptr);
    });
    this.heap.withBuffer(4 * INT_BYTES, (ptr) => {
      const slot = (n: number) => ptr + n * INT_BYTES;
      if (this.pdfium.FPDFPageObj_GetFillColor(original, slot(0), slot(1), slot(2), slot(3))) {
        this.pdfium.FPDFPageObj_SetFillColor(created, this.heap.int(slot(0)), this.heap.int(slot(1)), this.heap.int(slot(2)), this.heap.int(slot(3)));
      }
    });
    if (!set || !this.pdfium.FPDFPage_InsertObjectAtIndex(page, created, at)) {
      this.pdfium.FPDFPageObj_Destroy(created);
      return 0;
    }
    return created;
  }

  /**
   * Describes a text object for the editor.
   * @param textPage The page's loaded text page.
   * @param object The text object.
   * @param id Its id.
   * @param bounds Its bounds.
   * @returns The record.
   */
  private describe(textPage: number, object: number, id: string, bounds: PdfRect): PageTextObject {
    const font = this.pdfium.FPDFTextObj_GetFont(object);
    // The text matrix may scale the font (LaTeX writes "1 Tf" and scales the matrix).
    const scale = this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      if (!this.pdfium.FPDFPageObj_GetMatrix(object, ptr)) return 1;
      return Math.hypot(this.heap.float(ptr + 2 * FLOAT_BYTES), this.heap.float(ptr + 3 * FLOAT_BYTES)) || 1;
    });
    const color = this.heap.withBuffer(4 * INT_BYTES, (ptr) =>
      this.pdfium.FPDFPageObj_GetFillColor(object, ptr, ptr + INT_BYTES, ptr + 2 * INT_BYTES, ptr + 3 * INT_BYTES)
        ? { r: this.heap.int(ptr), g: this.heap.int(ptr + INT_BYTES), b: this.heap.int(ptr + 2 * INT_BYTES) }
        : { r: 0, g: 0, b: 0 },
    );
    return { id, text: this.readText(textPage, object), bounds, fontSize: this.fontSizeOf(object) * scale, color, style: fontStyleOf(this.fontName(font), this.pdfium.FPDFFont_GetFlags(font)) };
  }

  /**
   * A text object's font size, before the text matrix scales it.
   * @param object A text object.
   * @returns The size in points (12 if PDFium cannot say).
   */
  private fontSizeOf(object: number): number {
    return this.heap.withBuffer(FLOAT_BYTES, (ptr) => (this.pdfium.FPDFTextObj_GetFontSize(object, ptr) ? this.heap.float(ptr) : 12));
  }

  /**
   * Where an object sits in the page's object list.
   * @param page A loaded page.
   * @param object A page object handle.
   * @returns Its index, or -1 if it is not on this page.
   */
  private indexOf(page: number, object: number): number {
    const count = this.pdfium.FPDFPage_CountObjects(page);
    for (let index = 0; index < count; index++) if (this.pdfium.FPDFPage_GetObject(page, index) === object) return index;
    return -1;
  }

  /**
   * Whether an object is a text object that is drawn.
   * @param object A page object handle (0 for none).
   * @returns True for an active text object.
   */
  private isActiveText(object: number): boolean {
    if (!object || this.pdfium.FPDFPageObj_GetType(object) !== TEXT_OBJECT) return false;
    return this.heap.withBuffer(INT_BYTES, (ptr) => {
      this.pdfium.pdfium.setValue(ptr, 1, "i32");
      // If PDFium cannot say, the object counts as active.
      return !this.pdfium.FPDFPageObj_GetIsActive(object, ptr) || this.heap.int(ptr) !== 0;
    });
  }

  /**
   * A page object's bounding box.
   * @param object A page object handle.
   * @returns Its bounds in PDF space.
   */
  private boundsOf(object: number): PdfRect {
    return this.heap.withBuffer(4 * FLOAT_BYTES, (ptr) => {
      const slot = (n: number) => ptr + n * FLOAT_BYTES;
      if (!this.pdfium.FPDFPageObj_GetBounds(object, slot(0), slot(1), slot(2), slot(3))) return { x: 0, y: 0, width: 0, height: 0 };
      // FPDFPageObj_GetBounds writes left, bottom, right, top.
      const [left, bottom, right, top] = [0, 1, 2, 3].map((n) => this.heap.float(slot(n))) as [number, number, number, number];
      return { x: left, y: bottom, width: right - left, height: top - bottom };
    });
  }

  /**
   * The Unicode text of a text object.
   * @param textPage The page's loaded text page.
   * @param object The text object.
   * @returns Its text.
   */
  private readText(textPage: number, object: number): string {
    return this.heap.readWideString((ptr, bytes) => this.pdfium.FPDFTextObj_GetText(object, textPage, ptr, bytes));
  }

  /**
   * Loads a page's text page, runs `work`, and closes it.
   * @param page A loaded page.
   * @param work What to do with the text page.
   * @returns `work`'s result.
   */
  private withTextPage<T>(page: number, work: (textPage: number) => T): T {
    const textPage = this.pdfium.FPDFText_LoadPage(page);
    try {
      return work(textPage);
    } finally {
      this.pdfium.FPDFText_ClosePage(textPage);
    }
  }

  /**
   * A font's /BaseFont name.
   * @param font A font handle.
   * @returns The name (UTF-8), or "" when unknown.
   */
  private fontName(font: number): string {
    if (!font) return "";
    const bytes = this.pdfium.FPDFFont_GetBaseFontName(font, 0, 0);
    if (bytes <= 1) return "";
    return this.heap.withBuffer(bytes, (ptr) => {
      this.pdfium.FPDFFont_GetBaseFontName(font, ptr, bytes);
      return this.pdfium.pdfium.UTF8ToString(ptr);
    });
  }
}
