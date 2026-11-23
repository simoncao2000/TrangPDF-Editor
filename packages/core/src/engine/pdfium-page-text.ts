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
import {
  layoutTextRuns,
  withoutSubsetTag,
  type FontStyle,
  type PageFont,
  standardFontFor,
  type PageTextObject,
  type PositionedTextRun,
  type TextRun,
  type TextRunFont,
  type TextRunLineLayout,
  type TextRunPlacement,
} from "../page-text/page-text";
import { canSubsetFont, fontTable, missingFontCharacter } from "../page-text/sfnt";
import { PdfiumHeap } from "./pdfium-heap";
import { LineMarks } from "./pdfium-line-marks";
import { MATRIX_BYTES, TextMeasure } from "./pdfium-text-measure";
import { TextObjectAccess, type TextPixels, type TextPlacement } from "./pdfium-text-object";
import { WordWriter } from "./pdfium-text-words";

/** A point this close to a text object's box (in points) still hits it. */
const HIT_TOLERANCE = 2;
const OPAQUE = 255;
const PATH_OBJECT = 2;
const WINDING_FILL = 2;
const RUN_FAMILIES = { Helvetica: "sans", Times: "serif", Courier: "mono" } as const;
/** How far (in points, both ways) switched-off objects are moved: well off any page. */
const PARKING_OFFSET = -100_000;

/**
 * Identifies a static instance of an embedded face.
 * @param font The embedded run font.
 * @returns A subset key for this block.
 */
export function fontRequestKey(font: Extract<TextRunFont, { kind: "embedded" }>): string {
  return JSON.stringify([font.fontId, font.weight, font.italic, font.documentFontId]);
}

/**
 * Identifies the static subset for an original font file at a given weight.
 * @param font The embedded reference with a concrete file id.
 * @returns The subset key shared by runs using the same font instance.
 */
export function subsetKey(font: Extract<TextRunFont, { kind: "embedded" }>): string {
  return JSON.stringify([font.fontId, font.weight]);
}

/** The page being edited: its document, the loaded page and the document's text ids. */
export interface PageContext {
  readonly borrowed?: ReadonlyMap<string, number>;
  readonly subsets?: ReadonlyMap<string, ArrayBuffer>;
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
   * Lists fonts used by active text objects on this loaded page.
   * @param page The page to inspect.
   * @returns The distinct faces, including their programs when available.
   */
  listFonts(page: PageContext): PageFont[] {
    const seen = new Set<number>();
    const fonts: PageFont[] = [];
    const count = this.pdfium.FPDFPage_CountObjects(page.page);
    for (let index = 0; index < count; index++) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!this.objects.isActiveText(object)) continue;
      const font = this.pdfium.FPDFTextObj_GetFont(object);
      if (!font || seen.has(font)) continue;
      seen.add(font);
      const name = withoutSubsetTag(this.objects.fontName(font));
      if (!name) continue;
      const bytes = this.fontData(font);
      fonts.push({ id: String(index), name, style: this.pageFontStyle(font, bytes), ...(bytes && { bytes }) });
    }
    return fonts;
  }

  /**
   * Reads a borrowed font's program without retaining its PDFium handle.
   * @param font A font owned by a page object.
   * @returns A copy of the font bytes if available.
   */
  private fontData(font: number): ArrayBuffer | undefined {
    return this.heap.withBuffer(4, (sizePtr) => {
      if (!sizePtr || !this.pdfium.FPDFFont_GetFontData(font, 0, 0, sizePtr)) return;
      const length = this.heap.int(sizePtr);
      if (length <= 0) return;
      return this.heap.withBuffer(length, (ptr) => {
        if (!ptr || !this.pdfium.FPDFFont_GetFontData(font, ptr, length, sizePtr)) return;
        return this.pdfium.pdfium.HEAPU8.slice(ptr, ptr + length).buffer;
      });
    });
  }

  /**
   * Uses the font program to identify static instances whose base names are unchanged.
   * @param font The borrowed PDFium font handle.
   * @param bytes Its font program if readable.
   * @returns The face's family and variant.
   */
  private pageFontStyle(font: number, bytes?: ArrayBuffer): FontStyle {
    const style = this.objects.styleOf(font);
    const metrics = bytes && fontTable(bytes, "OS/2");
    if (!metrics || metrics.byteLength < 64) return style;
    return {
      ...style,
      bold: style.bold || metrics.getUint16(4) >= 600,
      italic: style.italic || Boolean(metrics.getUint16(62) & 1),
    };
  }

  /**
   * Resolves a page font only when its outline and PDF encoding cover the entire block.
   * @param page The loaded destination page.
   * @param reference The requested face and style.
   * @param text The normalized block text.
   * @returns A borrowed font handle usable while the page is held, or zero.
   */
  borrowFont(page: PageContext, reference: Extract<TextRunFont, { kind: "embedded" }>, text: string): number {
    if (!reference.documentFontId) return 0;
    const index = Number(reference.documentFontId);
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.pdfium.FPDFPage_CountObjects(page.page)) return 0;
    const object = this.pdfium.FPDFPage_GetObject(page.page, index);
    if (!this.objects.isActiveText(object)) return 0;
    const font = this.pdfium.FPDFTextObj_GetFont(object);
    if (!font || withoutSubsetTag(this.objects.fontName(font)) !== reference.name) return 0;
    const bytes = this.fontData(font);
    const style = this.pageFontStyle(font, bytes);
    if (style.italic !== reference.italic || style.bold !== (reference.weight === 700)) return 0;
    const sample = [...new Set(text)].join("");
    if (!bytes || !canSubsetFont(bytes) || missingFontCharacter(bytes, sample + " ")) return 0;
    const probe = this.pdfium.FPDFPageObj_CreateTextObj(page.doc, font, 12);
    if (!probe) return 0;
    let inserted = false;
    try {
      if (!this.heap.withWideString(sample, (ptr) => this.pdfium.FPDFText_SetText(probe, ptr))) return 0;
      this.pdfium.FPDFPage_InsertObject(page.page, probe);
      inserted = true;
      const read = this.objects.withTextPage(page.page, (textPage) => this.objects.readText(textPage, probe));
      return read === sample ? font : 0;
    } finally {
      if (inserted) this.objects.discard(page.page, [probe]);
      else this.pdfium.FPDFPageObj_Destroy(probe);
    }
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
   * Stages the entire block before adding any of its objects to the page.
   * @param page The destination page.
   * @param lines Styled lines with optional explicit baselines.
   * @param placement The first baseline, blank line size and angle.
   * @param ids One id for each staged object.
   * @returns Whether the full block was inserted.
   */
  add(
    page: PageContext,
    lines: readonly TextRunLineLayout[],
    placement: TextRunPlacement,
    ids: readonly string[],
  ): boolean {
    if (ids.some((id) => page.ids.handlesOf(id).length)) return false;
    const fonts = new Map<string, number>();
    const texts: number[] = [];
    const staged: number[] = [];
    let inserted = false;
    try {
      const positioned = layoutTextRuns(lines, placement, (run) => {
        const object = this.newRunObject(page, run, fonts);
        if (!object) return null;
        texts.push(object);
        const embedded = run.font?.kind === "embedded";
        const text = embedded ? run.text.normalize("NFC") : run.text;
        const written = this.heap.withWideString(text, (ptr) => this.pdfium.FPDFText_SetText(object, ptr));
        if (!written || !this.fillRun(object, run)) return null;
        const font = this.pdfium.FPDFTextObj_GetFont(object);
        return this.measure.advanceOf(
          { doc: page.doc, font, size: run.fontSize },
          text,
          embedded ? ([...text].find((char) => char.trim()) ?? " ") : "A",
        );
      });
      if (!positioned) return false;
      const radians = (placement.angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      for (const [index, run] of positioned.entries()) {
        const matrix = [cos, sin, -sin, cos, run.origin.x, run.origin.y];
        const object = texts[index]!;
        if (!this.setMatrix(object, matrix)) return false;
        staged.push(object);
        if (run.run.underline && !this.stageUnderline(run, matrix, staged)) return false;
      }
      if (ids.length !== staged.length) return false;
      staged.forEach((object, index) => {
        this.pdfium.FPDFPage_InsertObject(page.page, object);
        page.ids.register(ids[index]!, [object]);
      });
      inserted = true;
      return true;
    } finally {
      if (!inserted) {
        for (const object of new Set([...staged, ...texts])) this.pdfium.FPDFPageObj_Destroy(object);
      }
      for (const font of fonts.values()) this.pdfium.FPDFFont_Close(font);
    }
  }

  /**
   * Creates a run object with a standard family or a static embedded font.
   * @param page The destination and prepared subsets.
   * @param run The text and style.
   * @param fonts Font handles owned by this addition.
   * @returns The new object handle, or zero on failure.
   */
  private newRunObject(page: PageContext, run: TextRun, fonts: Map<string, number>): number {
    if (run.font?.kind !== "embedded") {
      const family = run.font?.family ?? run.fontFamily ?? "Helvetica";
      const name = standardFontFor({ ...run, family: RUN_FAMILIES[family] });
      return this.pdfium.FPDFPageObj_NewTextObj(page.doc, name, run.fontSize);
    }
    const borrowed = page.borrowed?.get(fontRequestKey(run.font));
    if (borrowed) return this.pdfium.FPDFPageObj_CreateTextObj(page.doc, borrowed, run.fontSize);
    const key = subsetKey(run.font);
    let handle = fonts.get(key);
    if (!handle) {
      const subset = page.subsets?.get(key);
      if (!subset) return 0;
      handle = this.heap.withBuffer(subset.byteLength, (ptr) => {
        if (!ptr) return 0;
        this.pdfium.pdfium.HEAPU8.set(new Uint8Array(subset), ptr);
        return this.pdfium.FPDFText_LoadFont(page.doc, ptr, subset.byteLength, 2, true);
      });
      if (!handle) return 0;
      fonts.set(key, handle);
    }
    return this.pdfium.FPDFPageObj_CreateTextObj(page.doc, handle, run.fontSize);
  }

  /**
   * Applies the run's colour to a text or path object.
   * @param object The PDFium handle.
   * @param run The run whose colour to use.
   * @returns Whether the colour was set.
   */
  private fillRun(object: number, run: TextRun): boolean {
    const { r, g, b } = run.color;
    return this.pdfium.FPDFPageObj_SetFillColor(object, r, g, b, OPAQUE);
  }

  /**
   * Creates a filled rectangle in baseline coordinates.
   * @param positioned The run and its advance.
   * @param matrix The baseline transform.
   * @param staged Objects to insert or destroy together.
   * @returns Whether the underline is ready.
   */
  private stageUnderline(positioned: PositionedTextRun, matrix: number[], staged: number[]): boolean {
    const { run, advance } = positioned;
    const path = this.pdfium.FPDFPageObj_CreateNewRect(0, -run.fontSize * 0.13, advance, run.fontSize * 0.05);
    if (!path) return false;
    staged.push(path);
    return (
      this.pdfium.FPDFPath_SetDrawMode(path, WINDING_FILL, false) &&
      this.fillRun(path, run) &&
      this.setMatrix(path, matrix)
    );
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
    if (this.pdfium.FPDFPageObj_GetType(handle) === PATH_OBJECT) {
      this.pdfium.FPDFPageObj_SetIsActive(handle, false);
      return;
    }
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
   * @returns Whether PDFium accepted the matrix.
   */
  private setMatrix(handle: number, matrix: readonly number[]): boolean {
    return this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      this.heap.writeFloats(ptr, matrix);
      return this.pdfium.FPDFPageObj_SetMatrix(handle, ptr);
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
