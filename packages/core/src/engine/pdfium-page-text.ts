/**
 * The page's own text (PDF text objects) on a loaded PDFium page: finding it, changing it, adding
 * new lines of it.
 *
 * Objects are never deleted. An edit switches the original off ("inactive": not drawn, not saved)
 * and inserts a replacement after it; added text is switched off for undo. Undo and redo switch
 * objects on and off by id, so nothing is lost. Ids map to object handles, which only stay valid
 * while the page stays loaded, so the engine keeps such pages open (see `PdfiumEngine`).
 *
 * A line is usually one text object. A line whose font cannot draw spaces is written one object
 * per word (`pdfium-text-words.ts`); an id then stands for all of its words.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { standardFontFor, type NewTextLine, type NewTextStyle, type PageTextObject } from "../page-text/page-text";
import { PdfiumHeap } from "./pdfium-heap";
import { LineMarks } from "./pdfium-line-marks";
import { MATRIX_BYTES, TextMeasure } from "./pdfium-text-measure";
import { TextObjectAccess, type TextPixels, type TextPlacement } from "./pdfium-text-object";
import { WordWriter } from "./pdfium-text-words";

/** A point this close to a text object's box (in points) still hits it. */
const HIT_TOLERANCE = 2;
const OPAQUE = 255;
/** The font new text is written in; every viewer has it. */
const NEW_TEXT_FONT = "Helvetica";
/** How far (in points, both ways) switched-off objects are moved: well off any page. */
const PARKING_OFFSET = -100_000;

/** The page being edited: its document, the loaded page and the document's text ids. */
export interface PageContext {
  /** The document handle; new objects belong to it. */
  readonly doc: number;
  /** A loaded (held) page handle. */
  readonly page: number;
  readonly ids: TextObjectIds;
}

/**
 * Ids for the text of one document's loaded pages (an id stands for one object or a line of
 * words), and where switched-off objects really belong.
 */
export class TextObjectIds {
  private readonly byHandle = new Map<number, string>();
  private readonly byId = new Map<string, readonly number[]>();
  /** Switched-off objects' own matrices, while they are parked off the page. */
  private readonly parked = new Map<number, readonly number[]>();
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
      this.register(id, [handle]);
    }
    return id;
  }

  /**
   * Records an id for one object or for the words of a line.
   * @param id The id.
   * @param handles The objects it stands for, in drawing order.
   */
  register(id: string, handles: readonly number[]): void {
    for (const handle of handles) this.byHandle.set(handle, id);
    this.byId.set(id, handles);
  }

  /**
   * The objects an id stands for.
   * @param id An id.
   * @returns Their handles; empty if the id is unknown.
   */
  handlesOf(id: string): readonly number[] {
    return this.byId.get(id) ?? [];
  }

  /**
   * Remembers a switched-off object's matrix before it is moved off the page.
   * @param handle The object.
   * @param matrix Its matrix.
   */
  park(handle: number, matrix: readonly number[]): void {
    this.parked.set(handle, matrix);
  }

  /**
   * Takes back a parked object's matrix.
   * @param handle The object.
   * @returns Its own matrix, or `undefined` if it was not parked.
   */
  unpark(handle: number): readonly number[] | undefined {
    const matrix = this.parked.get(handle);
    this.parked.delete(handle);
    return matrix;
  }
}

export class PageTextObjects {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;
  private readonly objects: TextObjectAccess;
  private readonly measure: TextMeasure;
  private readonly marks: LineMarks;
  private readonly words: WordWriter;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
    this.objects = new TextObjectAccess(pdfium);
    this.measure = new TextMeasure(pdfium);
    this.marks = new LineMarks(pdfium);
    this.words = new WordWriter(pdfium);
  }

  /**
   * The line under a point; the topmost one when they overlap.
   * @param page The page.
   * @param point A point in PDF space.
   * @returns The line, or `null` when there is no visible text there.
   */
  objectAt(page: PageContext, point: PdfPoint): PageTextObject | null {
    for (let index = this.pdfium.FPDFPage_CountObjects(page.page) - 1; index >= 0; index--) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!this.objects.isActiveText(object) || !hits(this.objects.boundsOf(object), point)) continue;
      const lineId = this.marks.lineOf(object)?.id;
      const members = lineId ? this.membersOf(page.page, lineId) : [object];
      const id = lineId ?? page.ids.idOf(object);
      return this.objects.withTextPage(page.page, (textPage) => this.describeLine(textPage, page.ids, id, members));
    }
    return null;
  }

  /**
   * Every visible line on a page, in drawing order. Objects with no text (spacing only) are left out.
   * @param page The page.
   * @returns The lines.
   */
  list(page: PageContext): PageTextObject[] {
    // One pass groups marked words into their lines, keeping each line where its first word is.
    const order: { readonly id: string | null; readonly object: number }[] = [];
    const lines = new Map<string, number[]>();
    for (let index = 0; index < this.pdfium.FPDFPage_CountObjects(page.page); index++) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!this.objects.isActiveText(object)) continue;
      const lineId = this.marks.lineOf(object)?.id ?? null;
      if (!lineId) order.push({ id: null, object });
      else if (lines.has(lineId)) lines.get(lineId)!.push(object);
      else {
        lines.set(lineId, [object]);
        order.push({ id: lineId, object });
      }
    }
    return this.objects.withTextPage(page.page, (textPage) =>
      order
        .map(({ id, object }) =>
          this.describeLine(textPage, page.ids, id ?? page.ids.idOf(object), id ? lines.get(id)! : [object]),
        )
        .filter((line) => line.text.trim()),
    );
  }

  /**
   * Replaces a line's text: switches the original off and inserts a replacement right after it.
   * Tries, in order: the original font; the original font one object per word, with the original
   * gaps (for fonts whose space has no width); the closest standard font.
   * @param page The page.
   * @param id The line's id.
   * @param newId The id to give the replacement.
   * @param text The new text.
   * @returns False if `id` is not visible text on this page or PDFium refused the text.
   */
  replace(page: PageContext, id: string, newId: string, text: string): boolean {
    const originals = page.ids.handlesOf(id);
    const indexes = originals.map((handle) => this.objects.indexOf(page.page, handle));
    const visible = originals.every((handle) => this.objects.isActiveText(handle));
    if (originals.length === 0 || indexes.some((index) => index < 0) || !visible) return false;
    // Read while the original still shows: PDFium cannot read the text of a switched-off object,
    // and parking moves it.
    const first = originals[0]!;
    const placement: TextPlacement = {
      at: Math.max(...indexes) + 1,
      model: { object: first, matrix: this.measure.matrixOf(first) },
    };
    const gap = this.words.gapOf(page, originals);
    // Off before writing, so the replacement is read on its own.
    for (const original of originals) this.switchOff(page.ids, original);
    const inFont = this.writeInFont(page, placement, text);
    const made =
      inFont.made ??
      (inFont.lettersFit ? this.words.write(page, placement, { id: newId, gap }, text) : null) ??
      this.writeInStandardFont(page, placement, text);
    if (!made) {
      for (const original of originals) this.switchOn(page.ids, original);
      return false;
    }
    page.ids.register(newId, made);
    return true;
  }

  /**
   * Adds lines of text to the page, in Helvetica, after everything else on it.
   * @param page The page.
   * @param lines The lines, each with where its baseline starts.
   * @param style Size, colour and angle.
   * @param newIds One id per line.
   * @returns False if PDFium refused a line (none are added then).
   */
  add(page: PageContext, lines: readonly NewTextLine[], style: NewTextStyle, newIds: readonly string[]): boolean {
    const radians = (style.angle * Math.PI) / 180;
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
    const created: number[] = [];
    for (const line of lines) {
      const object = this.pdfium.FPDFPageObj_NewTextObj(page.doc, NEW_TEXT_FONT, style.fontSize);
      const written = object && this.heap.withWideString(line.text, (ptr) => this.pdfium.FPDFText_SetText(object, ptr));
      if (!written) {
        if (object) this.pdfium.FPDFPageObj_Destroy(object);
        this.objects.discard(page.page, created);
        return false;
      }
      this.pdfium.FPDFPageObj_Transform(object, cos, sin, -sin, cos, line.origin.x, line.origin.y);
      this.pdfium.FPDFPageObj_SetFillColor(object, style.color.r, style.color.g, style.color.b, OPAQUE);
      this.pdfium.FPDFPage_InsertObject(page.page, object);
      created.push(object);
    }
    created.forEach((object, i) => page.ids.register(newIds[i]!, [object]));
    return true;
  }

  /**
   * Switches lines on and off (undo and redo).
   * @param page The page.
   * @param show Ids to switch on.
   * @param hide Ids to switch off.
   * @returns False if an id is not on this page.
   */
  show(page: PageContext, show: readonly string[], hide: readonly string[]): boolean {
    if (![...show, ...hide].every((id) => this.onPage(page, id))) return false;
    for (const id of hide) for (const handle of page.ids.handlesOf(id)) this.switchOff(page.ids, handle);
    for (const id of show) for (const handle of page.ids.handlesOf(id)) this.switchOn(page.ids, handle);
    return true;
  }

  /**
   * Moves a line.
   * @param page The page.
   * @param id The line's id.
   * @param dx Distance along x, in points.
   * @param dy Distance along y, in points (positive is up).
   * @returns False if `id` is not on this page.
   */
  move(page: PageContext, id: string, dx: number, dy: number): boolean {
    if (!this.onPage(page, id)) return false;
    for (const handle of page.ids.handlesOf(id)) this.pdfium.FPDFPageObj_Transform(handle, 1, 0, 0, 1, dx, dy);
    return true;
  }

  /**
   * Draws a line on its own, on a transparent background, tightly cropped to its bounds.
   * @param page The page.
   * @param id The line's id.
   * @param scale Device pixels per point.
   * @returns RGBA pixels, or `null` if `id` is not on this page.
   */
  render(page: PageContext, id: string, scale: number): TextPixels | null {
    if (!this.onPage(page, id)) return null;
    const handles = page.ids.handlesOf(id);
    if (handles.length === 1) return this.objects.render(page.doc, page.page, handles[0]!, scale);
    // A line of words: draw each word and lay the pictures out where the words are on the page.
    const words = handles.map((handle) => ({
      bounds: this.objects.boundsOf(handle),
      drawn: this.objects.render(page.doc, page.page, handle, scale),
    }));
    if (words.some((word) => !word.drawn)) return null;
    const area = unionOf(words.map((word) => word.bounds));
    const width = Math.ceil(area.width * scale);
    const height = Math.ceil(area.height * scale);
    const line = { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
    for (const { bounds, drawn } of words) {
      const left = Math.round((bounds.x - area.x) * scale);
      const top = Math.round((area.y + area.height - bounds.y - bounds.height) * scale);
      copyInto(line, drawn!, { left, top });
    }
    return line;
  }

  /**
   * Whether an id stands for objects on a page.
   * @param page The page.
   * @param id An id.
   * @returns True when the id is known and all its objects are on the page.
   */
  private onPage(page: PageContext, id: string): boolean {
    const handles = page.ids.handlesOf(id);
    return handles.length > 0 && handles.every((handle) => this.objects.indexOf(page.page, handle) >= 0);
  }

  /**
   * Switches an object off (not drawn, not saved) and parks it off the page. PDFium's text reader
   * still sees switched-off objects when it drops text drawn twice in the same place, so a
   * replacement identical to the original (an unchanged word, a line typed back as it was) would
   * otherwise vanish from search, selection and the line list.
   * @param ids The document's registry, which remembers where the object belongs.
   * @param handle The object.
   */
  private switchOff(ids: TextObjectIds, handle: number): void {
    if (!this.objects.isActiveText(handle)) return;
    const matrix = this.measure.matrixOf(handle);
    ids.park(handle, matrix);
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix;
    this.setMatrix(handle, [a, b, c, d, e + PARKING_OFFSET, f + PARKING_OFFSET]);
    this.pdfium.FPDFPageObj_SetIsActive(handle, false);
  }

  /**
   * Switches an object back on, exactly where it was.
   * @param ids The document's registry.
   * @param handle The object.
   */
  private switchOn(ids: TextObjectIds, handle: number): void {
    const matrix = ids.unpark(handle);
    if (matrix) this.setMatrix(handle, matrix);
    this.pdfium.FPDFPageObj_SetIsActive(handle, true);
  }

  /**
   * Sets a page object's matrix.
   * @param handle The object.
   * @param matrix [a, b, c, d, e, f].
   */
  private setMatrix(handle: number, matrix: readonly number[]): void {
    this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      this.heap.writeFloats(ptr, matrix);
      this.pdfium.FPDFPageObj_SetMatrix(handle, ptr);
    });
  }

  /**
   * Writes text as one object in the model's font.
   * @param page The page.
   * @param placement Where it goes and what it is modelled on.
   * @param text The new text.
   * @returns The new object (`null` if the font lacks a glyph or its spaces have no width), and
   *   whether the font has every letter of the text, so its words could be written one by one.
   */
  private writeInFont(
    page: PageContext,
    placement: TextPlacement,
    text: string,
  ): { made: number[] | null; lettersFit: boolean } {
    const face = this.words.faceOf(page.doc, placement.model.object);
    const created = this.pdfium.FPDFPageObj_CreateTextObj(face.doc, face.font, face.size);
    const made = this.objects.insertLike(page.page, placement, created, text);
    if (!made) return { made: null, lettersFit: false };
    // A missing glyph makes the text read back differently.
    const readBack = this.objects.withTextPage(page.page, (textPage) => this.objects.readText(textPage, made));
    if (readBack === text && !this.measure.spacesCollapse(face, text)) return { made: [made], lettersFit: true };
    this.objects.discard(page.page, [made]);
    return { made: null, lettersFit: withoutSpaces(readBack) === withoutSpaces(text) };
  }

  /**
   * Writes text as one object in the standard font closest to the model's.
   * @param page The page.
   * @param placement Where it goes and what it is modelled on.
   * @param text The new text.
   * @returns The new object, or `null` if PDFium refused the text.
   */
  private writeInStandardFont(page: PageContext, placement: TextPlacement, text: string): number[] | null {
    const original = placement.model.object;
    const fallback = standardFontFor(this.objects.styleOf(this.pdfium.FPDFTextObj_GetFont(original)));
    const created = this.pdfium.FPDFPageObj_NewTextObj(page.doc, fallback, this.objects.fontSizeOf(original));
    const made = this.objects.insertLike(page.page, placement, created, text);
    return made ? [made] : null;
  }

  /**
   * The active words of a line on a page.
   * @param page A loaded page.
   * @param lineId The line's id.
   * @returns Its objects in drawing order.
   */
  private membersOf(page: number, lineId: string): number[] {
    const members: number[] = [];
    for (let index = 0; index < this.pdfium.FPDFPage_CountObjects(page); index++) {
      const object = this.pdfium.FPDFPage_GetObject(page, index);
      if (this.objects.isActiveText(object) && this.marks.lineOf(object)?.id === lineId) members.push(object);
    }
    return members;
  }

  /**
   * Describes a line (one object, or a line of words) for the editor, and records its id.
   * @param textPage The page's loaded text page.
   * @param ids The document's id registry.
   * @param id The line's id.
   * @param members Its objects in drawing order.
   * @returns The record: the first object's look, all the words, the bounds around them.
   */
  private describeLine(textPage: number, ids: TextObjectIds, id: string, members: readonly number[]): PageTextObject {
    ids.register(id, members);
    const bounds = unionOf(members.map((member) => this.objects.boundsOf(member)));
    const first = this.objects.describe(textPage, members[0]!, id, bounds);
    if (members.length === 1) return first;
    // PDFium reads the gap after a word as a space at the end of it.
    return { ...first, text: members.map((member) => this.objects.readText(textPage, member).trim()).join(" ") };
  }
}

/**
 * Whether a point is on (or within `HIT_TOLERANCE` of) a box.
 * @param bounds A box in PDF space.
 * @param point A point in PDF space.
 * @returns True on a hit.
 */
function hits(bounds: PdfRect, point: PdfPoint): boolean {
  return (
    point.x >= bounds.x - HIT_TOLERANCE &&
    point.x <= bounds.x + bounds.width + HIT_TOLERANCE &&
    point.y >= bounds.y - HIT_TOLERANCE &&
    point.y <= bounds.y + bounds.height + HIT_TOLERANCE
  );
}

/**
 * A text with its white space taken out.
 * @param text Any text.
 * @returns The text without spaces, tabs or line breaks.
 */
function withoutSpaces(text: string): string {
  return text.replace(/\s/g, "");
}

/**
 * The smallest box around some boxes.
 * @param boxes At least one box.
 * @returns Their union.
 */
function unionOf(boxes: readonly PdfRect[]): PdfRect {
  const left = Math.min(...boxes.map((box) => box.x));
  const bottom = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/**
 * Copies a picture into a larger one, skipping clear pixels and anything that falls outside.
 * @param target The larger picture.
 * @param source The picture to copy.
 * @param at Where the source's top-left corner goes, in the target's pixels.
 */
function copyInto(target: TextPixels, source: TextPixels, at: { readonly left: number; readonly top: number }): void {
  for (let y = 0; y < source.height; y++) {
    const row = at.top + y;
    if (row < 0 || row >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const column = at.left + x;
      const from = (y * source.width + x) * 4;
      if (column < 0 || column >= target.width || source.pixels[from + 3] === 0) continue;
      target.pixels.set(source.pixels.subarray(from, from + 4), (row * target.width + column) * 4);
    }
  }
}
