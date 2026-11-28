/**
 * The page's own text (PDF text objects) on a loaded PDFium page: finding it, changing it, adding
 * new lines of it.
 *
 * Rich edits exchange detached objects with their exact originals. Added and legacy replacement text
 * use the active flag for undo. The engine holds pages open so their object handles remain valid.
 *
 * A line is usually one text object. A line whose font cannot draw spaces is written one object
 * per word (`pdfium-text-words.ts`); an id then stands for all of its words.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import {
  layoutTextRuns,
  sameRunStyle,
  withoutSubsetTag,
  type FontStyle,
  type PageFont,
  standardFontFor,
  type PageTextObject,
  type PositionedTextRun,
  type TextRun,
  type TextRunFont,
  type TextRunFamily,
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
const MIN_FIT_SCALE = 0.9;
const BASELINE_TOLERANCE = 0.5;
const EXACT_RUN = -1;
const UNDERLINE = -2;
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
  readonly fallbackSlots?: ReadonlySet<number>;
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
  private nextFont = 1;
  private readonly fontIds = new Map<number, { id: string; owners: Set<number> }>();
  private readonly objectFonts = new Map<number, number>();
  private readonly grouped = new Map<number, string>();

  /**
   * Resolves an opaque font id and records the text object that keeps the font alive.
   * @param font A PDFium font handle.
   * @param object A text object that owns the font.
   * @returns The id shared by the font picker and line extraction.
   */
  fontId(font: number, object: number): string {
    let entry = this.fontIds.get(font);
    if (!entry) {
      entry = { id: `font-${this.nextFont++}`, owners: new Set() };
      this.fontIds.set(font, entry);
    }
    entry.owners.add(object);
    this.objectFonts.set(object, font);
    return entry.id;
  }

  /**
   * Forgets the fonts of all held pages before document teardown frees them.
   * @returns Nothing.
   */
  clearFontIds(): void {
    this.fontIds.clear();
    this.objectFonts.clear();
  }

  /**
   * Updates the live grouping after an edit or history transition.
   * @param id The line id.
   * @param before The previously attached text objects.
   * @param after The now attached text objects.
   * @returns Nothing.
   */
  group(id: string, before: readonly number[], after: readonly number[]): void {
    for (const handle of before) this.grouped.delete(handle);
    for (const handle of after) this.grouped.set(handle, id);
    this.register(id, after);
  }

  /**
   * Finds the live group for a run.
   * @param handle The page object.
   * @returns The line id if explicitly grouped.
   */
  groupOf(handle: number): string | undefined {
    return this.grouped.get(handle);
  }

  /**
   * Forgets a destroyed object so a recycled handle gets a fresh id.
   * @param handle The destroyed object.
   * @returns Nothing.
   */
  forget(handle: number): void {
    const id = this.byHandle.get(handle);
    if (id && this.byId.get(id)?.includes(handle)) {
      this.byId.set(
        id,
        this.handlesOf(id).filter((candidate) => candidate !== handle),
      );
    }
    this.byHandle.delete(handle);
    this.grouped.delete(handle);
    this.parked.delete(handle);
    const font = this.objectFonts.get(handle);
    if (font === undefined) return;
    const entry = this.fontIds.get(font)!;
    entry.owners.delete(handle);
    if (!entry.owners.size) this.fontIds.delete(font);
    this.objectFonts.delete(handle);
  }

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

interface LineMember {
  readonly handle: number;
  readonly index: number;
}

/** The source run and any underline that belongs to it. */
interface EditSourceRun extends LineMember {
  readonly underline?: LineMember;
  readonly matrix: readonly number[];
  readonly advance: number;
}

export interface LineEditPlan {
  readonly id: string;
  readonly markId: string;
  readonly original: readonly EditSourceRun[];
  readonly slots: readonly RunSlot[];
}

interface RunSlot {
  source?: number;
  retained?: number;
}

interface RunTranslation {
  readonly handle: number;
  readonly dx: number;
  readonly dy: number;
  readonly originalMatrix: readonly number[];
}

export interface HeldLineEdit {
  readonly id: string;
  readonly before: readonly LineMember[];
  readonly after: readonly LineMember[];
  readonly originalLine: readonly number[];
  readonly editedLine: readonly number[];
  readonly translations: readonly RunTranslation[];
  readonly markId: string;
  readonly markTargets: readonly number[];
  readonly appliedMarks: Map<number, number>;
}

interface EditLayout {
  readonly incoming: { handle: number; anchor: number; retained?: boolean }[];
  readonly inPlace: Set<number>;
  readonly translations: RunTranslation[];
}

export class PageTextObjects {
  private readonly coverage = new WeakMap<
    TextObjectIds,
    Map<
      string,
      {
        bytes?: ArrayBuffer;
        style: FontStyle;
        characters: Map<string, boolean>;
        anchor?: string;
      }
    >
  >();
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
      if (!font) continue;
      const id = page.ids.fontId(font, object);
      if (seen.has(font)) continue;
      seen.add(font);
      const name = withoutSubsetTag(this.objects.fontName(font));
      if (!name) continue;
      const bytes = this.fontData(font);
      fonts.push({ id, name, style: this.pageFontStyle(font, bytes), ...(bytes && { bytes }) });
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
    const font = this.findFont(page, reference.documentFontId);
    if (!font || withoutSubsetTag(this.objects.fontName(font)) !== reference.name) return 0;
    const bytes = this.fontData(font);
    const style = this.pageFontStyle(font, bytes);
    if (style.italic !== reference.italic || style.bold !== (reference.weight === 700)) return 0;
    const sample = [...new Set(text)].join("");
    if (!bytes || !canSubsetFont(bytes) || missingFontCharacter(bytes, sample + " ")) return 0;
    const probe = this.pdfium.FPDFPageObj_CreateTextObj(page.doc, font, 12);
    return this.probeText(page, probe, sample) === sample ? font : 0;
  }

  /**
   * Finds a currently visible font by its document id.
   * @param page The page to read.
   * @param id The font id.
   * @returns The borrowed handle, or zero.
   */
  private findFont(page: PageContext, id: string): number {
    const count = this.pdfium.FPDFPage_CountObjects(page.page);
    for (let index = 0; index < count; index++) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!this.objects.isActiveText(object)) continue;
      const font = this.pdfium.FPDFTextObj_GetFont(object);
      if (font && page.ids.fontId(font, object) === id) return font;
    }
    return 0;
  }

  /**
   * Checks the requested document face against both its glyph program and its PDF encoding.
   * @param page The target page.
   * @param run The run to write.
   * @returns A usable handle or the first missing character.
   */
  checkDocumentFont(
    page: PageContext,
    run: TextRun,
  ): {
    font?: number;
    missingCharacter?: string;
    fallbackFamily?: TextRunFamily;
  } {
    const reference = run.font;
    if (reference?.kind !== "embedded" || !reference.documentFontId || !run.text) return {};
    const characters = [...new Set(run.text)];
    const font = this.findFont(page, reference.documentFontId);
    if (!font || withoutSubsetTag(this.objects.fontName(font)) !== reference.name) {
      return { missingCharacter: characters[0] };
    }
    if (this.pdfium.FPDFFont_GetIsEmbedded(font) !== 1) return {};
    let faces = this.coverage.get(page.ids);
    if (!faces) this.coverage.set(page.ids, (faces = new Map()));
    let face = faces.get(reference.documentFontId);
    if (!face) {
      const bytes = this.fontData(font);
      face = { bytes, style: this.pageFontStyle(font, bytes), characters: new Map() };
      faces.set(reference.documentFontId, face);
    }
    if (face.bytes && !canSubsetFont(face.bytes)) return { missingCharacter: characters[0] };
    for (const char of characters) {
      if (!face.characters.has(char)) {
        const mapped =
          (face.bytes && !missingFontCharacter(face.bytes, char, true)) ||
          this.heap.withBuffer(
            4,
            (ptr) => this.pdfium.FPDFFont_GetGlyphWidth(font, char.codePointAt(0)!, 1, ptr) && this.heap.float(ptr) > 0,
          );
        const sample = char.trim() ? char : (face.anchor ?? "") + char + (face.anchor ?? "");
        const covered = Boolean(mapped && this.fontRoundTrips(page, font, sample));
        face.characters.set(char, covered);
        if (covered && char.trim()) face.anchor = char;
      }
      if (!face.characters.get(char)) {
        const family = face.style.family;
        const fallbackFamily = family === "serif" ? "Times" : family === "mono" ? "Courier" : "Helvetica";
        return { missingCharacter: char, fallbackFamily };
      }
    }
    return face.style.bold === run.bold && face.style.italic === run.italic ? { font } : {};
  }

  /**
   * Tests PDFium's inverse Unicode mapping for an existing font.
   * @param page The target page.
   * @param font The borrowed document font.
   * @param text The probe text.
   * @returns Whether extraction agrees with the requested encoding.
   */
  private fontRoundTrips(page: PageContext, font: number, text: string): boolean {
    const probe = this.pdfium.FPDFPageObj_CreateTextObj(page.doc, font, 12);
    return this.probeText(page, probe, text) === text;
  }

  /**
   * Verifies that a standard face writes the request losslessly.
   * @param page The target page.
   * @param run A standard run.
   * @returns Whether the text can be written with this face.
   */
  standardSupports(page: PageContext, run: TextRun): boolean {
    const probe = this.newRunObject(page, run, new Map());
    const sample = `A${run.text}A`;
    return this.probeText(page, probe, sample) === sample;
  }

  /**
   * Round-trips an encoding using a temporary object.
   * @param page The destination page.
   * @param probe An owned scratch object, or zero.
   * @param text The candidate text.
   * @returns Its extracted text, or undefined on failure.
   */
  private probeText(page: PageContext, probe: number, text: string): string | undefined {
    if (!probe) return;
    let inserted = false;
    try {
      if (!this.heap.withWideString(text, (ptr) => this.pdfium.FPDFText_SetText(probe, ptr))) return;
      this.pdfium.FPDFPage_InsertObject(page.page, probe);
      inserted = true;
      return this.objects.withTextPage(page.page, (textPage) => this.objects.readText(textPage, probe));
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
      const lineId = page.ids.groupOf(object) ?? this.marks.lineOf(object)?.id;
      const members = lineId ? this.membersOf(page, lineId) : [{ handle: object, index }];
      const id = lineId ?? page.ids.idOf(object);
      const context = { ...page, fonts: new Map<number, FontStyle>() };
      return this.objects.withTextPage(page.page, (textPage) => this.describeLine(textPage, context, id, members));
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
    const order: { readonly id: string | null; readonly member: LineMember }[] = [];
    const lines = new Map<string, LineMember[]>();
    for (let index = 0; index < this.pdfium.FPDFPage_CountObjects(page.page); index++) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!this.objects.isActiveText(object)) continue;
      const lineId = page.ids.groupOf(object) ?? this.marks.lineOf(object)?.id ?? null;
      const member = { handle: object, index };
      if (!lineId) order.push({ id: null, member });
      else if (lines.has(lineId)) lines.get(lineId)!.push(member);
      else {
        lines.set(lineId, [member]);
        order.push({ id: lineId, member });
      }
    }
    const context = { ...page, fonts: new Map<number, FontStyle>() };
    return this.objects.withTextPage(page.page, (textPage) =>
      order
        .map(({ id, member }) =>
          this.describeLine(textPage, context, id ?? page.ids.idOf(member.handle), id ? lines.get(id)! : [member]),
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
   * Reads one line and matches its unchanged runs before any font is prepared.
   * @param page The loaded page.
   * @param id The line id.
   * @param runs The requested runs.
   * @returns A plan for staging the edit, or null if the line is stale.
   */
  planEdit(page: PageContext, id: string, runs: readonly TextRun[]): LineEditPlan | null {
    const handles = new Set(page.ids.handlesOf(id));
    if (!handles.size) return null;
    const members: LineMember[] = [];
    const count = this.pdfium.FPDFPage_CountObjects(page.page);
    for (let index = 0; index < count; index++) {
      const handle = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (handles.has(handle) && this.objects.isActiveText(handle)) members.push({ handle, index });
    }
    if (members.length !== handles.size) return null;
    const context = { ...page, fonts: new Map<number, FontStyle>() };
    const line = this.objects.withTextPage(page.page, (textPage) => this.describeLine(textPage, context, id, members));
    const original = members.map((member, index) => this.editSource(page, member, line.runs![index]!));
    const markId = this.marks.lineOf(members[0]!.handle)?.id ?? crypto.randomUUID();
    return { id, markId, original, slots: matchRuns(line.runs!, runs) };
  }

  /**
   * Records the original geometry for a run.
   * @param page The original page.
   * @param member The run object.
   * @param run Its extracted style and text.
   * @returns The run and its baseline geometry.
   */
  private editSource(page: PageContext, member: LineMember, run: TextRun): EditSourceRun {
    const { handle, index } = member;
    const matrix = this.measure.matrixOf(handle);
    const font = this.pdfium.FPDFTextObj_GetFont(handle);
    const size = this.objects.fontSizeOf(handle);
    const width = this.measure.advanceOf({ doc: page.doc, font, size }, run.text);
    const advance = (width ?? this.measure.lengthAlongBaseline(handle)) * Math.hypot(matrix[0]!, matrix[1]!);
    const underline = this.underlineAt(page.page, index + 1);
    return { ...member, matrix, advance, underline };
  }

  /**
   * Stages a new line and applies it only when every replacement is ready.
   * @param page The loaded page and prepared fonts.
   * @param plan The original line and the correspondence between runs.
   * @param runs The resolved runs.
   * @returns The exact objects retained for history, or null on failure.
   */
  commitEdit(page: PageContext, plan: LineEditPlan, runs: readonly TextRun[]): HeldLineEdit | null {
    const fonts = new Map<string, number>();
    const layout: EditLayout = { incoming: [], inPlace: new Set(), translations: [] };
    let committed = false;
    try {
      const editedLine = this.stageEdit({ page, plan, fonts, layout }, runs);
      if (!editedLine) return null;
      const originals = plan.original.flatMap(({ handle, index, underline }) =>
        underline ? [{ handle, index }, underline] : [{ handle, index }],
      );
      const before = originals.filter(({ handle }) => !layout.inPlace.has(handle));
      const after = layout.incoming.map(({ handle, anchor }, offset) => ({
        handle,
        index: anchor - before.filter((object) => object.index < anchor).length + offset,
      }));
      const originalLine = plan.original.map(({ handle }) => handle);
      const sourceHandles = new Set(originalLine);
      const edit = {
        id: plan.id,
        before,
        after,
        originalLine,
        editedLine,
        translations: layout.translations,
        markId: plan.markId,
        markTargets:
          editedLine.length > 1
            ? editedLine.filter((handle) => sourceHandles.has(handle) && !this.marks.lineOf(handle))
            : [],
        appliedMarks: new Map<number, number>(),
      };
      committed = this.toggleEdit(page, edit, true);
      if (committed) {
        for (const handle of editedLine) page.ids.fontId(this.pdfium.FPDFTextObj_GetFont(handle), handle);
      }
      return committed ? edit : null;
    } finally {
      if (!committed) {
        for (const { handle, retained } of layout.incoming) {
          if (!retained) this.pdfium.FPDFPageObj_Destroy(handle);
        }
      }
      for (const font of fonts.values()) this.pdfium.FPDFFont_Close(font);
    }
  }

  /**
   * Places new objects at the original baseline, preserving spacing between corresponding runs.
   * @param context The staging state and original line.
   * @param runs The runs to place.
   * @returns The text handles in the edited line, or null on failure.
   */
  private stageEdit(context: EditStageContext, runs: readonly TextRun[]): number[] | null {
    const { plan, layout } = context;
    const first = plan.original[0]!;
    const [a = 1, b = 0, , , startX = 0, startY = 0] = first.matrix;
    const scale = Math.hypot(a, b) || 1;
    const axis = { x: a / scale, y: b / scale };
    const handles: number[] = [];
    let previousSource: number | undefined;
    let shift = 0;
    for (const [index, run] of runs.entries()) {
      const { source, retained } = plan.slots[index]!;
      const original = source === undefined ? undefined : plan.original[source];
      const previous = previousSource === undefined ? undefined : plan.original[previousSource];
      const model = original ?? previous ?? first;
      if (original && previous && source === previousSource! + 1) {
        const distance =
          (original.matrix[4]! - previous.matrix[4]!) * axis.x + (original.matrix[5]! - previous.matrix[5]!) * axis.y;
        shift += distance - previous.advance;
      }
      const matrix = [...model.matrix];
      const originalOffset = (matrix[4]! - startX) * axis.x + (matrix[5]! - startY) * axis.y;
      if (previous && original) {
        const dx = original.matrix[4]! - previous.matrix[4]!;
        const dy = original.matrix[5]! - previous.matrix[5]!;
        if (Math.abs(dx * axis.y - dy * axis.x) > BASELINE_TOLERANCE) shift = originalOffset;
      }
      matrix[4] = matrix[4]! + axis.x * (shift - originalOffset);
      matrix[5] = matrix[5]! + axis.y * (shift - originalOffset);
      const next = plan.slots.slice(index + 1).find((slot) => slot.source !== undefined)?.source;
      const anchor =
        original?.index ??
        (next === undefined ? (model.underline?.index ?? model.index) + 1 : plan.original[next]!.index);
      const slot = context.page.fallbackSlots?.has(index) ? original : undefined;
      const staged =
        retained === undefined
          ? this.stageEditRun(context, run, matrix, { anchor, slot })
          : this.stageRetainedRun(layout, plan.original[retained]!, matrix, retained === source ? undefined : anchor);
      if (!staged) return null;
      handles.push(staged.handle);
      shift += staged.advance;
      if (original) previousSource = source;
    }
    return handles;
  }

  /**
   * Stages an unchanged object for translation and, if reordered, an indexed reinsert.
   * @param layout The work to apply atomically.
   * @param source The retained object and its underline.
   * @param matrix The target baseline.
   * @param anchor The new drawing slot, or undefined to keep the existing slot.
   * @returns The original text handle and its advance.
   */
  private stageRetainedRun(layout: EditLayout, source: EditSourceRun, matrix: number[], anchor?: number) {
    const dx = matrix[4]! - source.matrix[4]!;
    const dy = matrix[5]! - source.matrix[5]!;
    for (const handle of [source.handle, source.underline?.handle]) {
      if (!handle) continue;
      if (anchor === undefined) layout.inPlace.add(handle);
      else layout.incoming.push({ handle, anchor, retained: true });
      if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
        const originalMatrix = handle === source.handle ? source.matrix : this.measure.matrixOf(handle);
        layout.translations.push({ handle, dx, dy, originalMatrix });
      }
    }
    return { handle: source.handle, advance: source.advance };
  }

  /**
   * Writes one changed run and stages its underline if requested.
   * @param context The destination and owned resources.
   * @param run The run to write.
   * @param model Its baseline transform.
   * @param target Its drawing order and optional original fallback slot.
   * @returns The text handle and advance, or null on failure.
   */
  private stageEditRun(
    context: EditStageContext,
    run: TextRun,
    model: number[],
    target: { anchor: number; slot?: EditSourceRun },
  ) {
    const { page, plan, layout } = context;
    const { anchor, slot } = target;
    const prepared = this.prepareGeometry(context, run, model, slot);
    if (!prepared) return null;
    const { handle, advance, matrix, sized, width } = prepared;
    if (slot && width > slot.advance) this.shiftFollowing(context, slot, width - slot.advance);

    layout.incoming.push({ handle, anchor });
    if (!this.setMatrix(handle, matrix) || !this.marks.tag(page.doc, handle, { id: plan.markId, gap: EXACT_RUN })) {
      return null;
    }
    if (run.underline) {
      const paths: number[] = [];
      const origin = { x: matrix[4]!, y: matrix[5]! };
      const staged = this.stageUnderline({ run: sized, advance, origin }, matrix, paths);
      for (const path of paths) layout.incoming.push({ handle: path, anchor });
      if (!staged || !this.tagUnderline(page, paths[0]!)) return null;
    }
    return { handle, advance: width };
  }

  /**
   * Prepares the detached drawing object and its advance with the same font, size and transform.
   * @param context The staged edit.
   * @param run The resolved font and text.
   * @param model The source transform at the target baseline.
   * @param slot The original slot when substituting a missing face.
   * @returns The drawing geometry, or null if the text could not be written.
   */
  private prepareGeometry(context: EditStageContext, run: TextRun, model: number[], slot?: EditSourceRun) {
    const sized = { ...run, fontSize: run.fontSize / (Math.hypot(model[2]!, model[3]!) || 1) };
    const written = this.writeRun(context.page, sized, context.fonts);
    if (!written) return null;
    const natural = written.advance * Math.hypot(model[0]!, model[1]!);
    const fit = slot && natural > 0 ? Math.max(MIN_FIT_SCALE, Math.min(1, slot.advance / natural)) : 1;
    const matrix = [...model];
    matrix[0] = model[0]! * fit;
    matrix[1] = model[1]! * fit;
    return { ...written, sized, matrix, width: natural * fit };
  }

  /**
   * Records translations for independent text objects following an overflowing slot.
   * @param context The staged page and history record.
   * @param slot The original slot.
   * @param overflow The extra advance in page points.
   * @returns Nothing.
   */
  private shiftFollowing(context: EditStageContext, slot: EditSourceRun, overflow: number): void {
    const { page, plan, layout } = context;
    const [a, b, , , x, y] = slot.matrix as [number, number, number, number, number, number];
    const scale = Math.hypot(a, b);
    if (!scale) return;
    const excluded = new Set(plan.original.map(({ handle }) => handle));
    const count = this.pdfium.FPDFPage_CountObjects(page.page);
    for (let index = 0; index < count; index++) {
      const handle = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (excluded.has(handle) || !this.objects.isActiveText(handle)) continue;
      const matrix = this.measure.matrixOf(handle);
      const dx = matrix[4]! - x;
      const dy = matrix[5]! - y;
      if ((dx * a + dy * b) / scale <= 0) continue;
      if (Math.abs(dx * b - dy * a) / scale > BASELINE_TOLERANCE) continue;
      const direction = Math.hypot(matrix[0]!, matrix[1]!);
      if (!direction || matrix[0]! * a + matrix[1]! * b < 0.999 * scale * direction) continue;
      const existing = layout.translations.find((translation) => translation.handle === handle);
      const translation = { handle, originalMatrix: matrix, dx: (overflow * a) / scale, dy: (overflow * b) / scale };
      if (existing) {
        layout.translations.splice(layout.translations.indexOf(existing), 1, {
          ...translation,
          dx: translation.dx + existing.dx,
          dy: translation.dy + existing.dy,
        });
      } else layout.translations.push(translation);
    }
  }

  /**
   * Exchanges the detached and attached objects, rolling back a rejected exchange.
   * @param page The held page.
   * @param edit The history record.
   * @param apply Whether to attach the edited version.
   * @returns Whether the exchange succeeded.
   */
  toggleEdit(page: PageContext, edit: HeldLineEdit, apply: boolean): boolean {
    const [outgoing, incoming] = apply ? [edit.before, edit.after] : [edit.after, edit.before];
    const count = this.pdfium.FPDFPage_CountObjects(page.page);
    if (count < 0) return false;
    if (outgoing.some(({ handle, index }) => this.pdfium.FPDFPage_GetObject(page.page, index) !== handle)) return false;
    if (incoming.some(({ index }, offset) => index < 0 || index > count - outgoing.length + offset)) return false;

    const removed: LineMember[] = [];
    const inserted: LineMember[] = [];
    for (const object of outgoing) {
      if (!this.pdfium.FPDFPage_RemoveObject(page.page, object.handle)) break;
      removed.push(object);
    }
    if (removed.length === outgoing.length) {
      for (const object of incoming) {
        // Insertion takes ownership even on failure. The page and insertion indices were validated above.
        this.pdfium.FPDFPage_InsertObjectAtIndex(page.page, object.handle, object.index);
        inserted.push(object);
      }
      if (inserted.length === incoming.length && this.toggleEditMarks(page, edit, apply)) {
        this.translateRuns(edit.translations, apply);
        const [oldLine, newLine] = apply ? [edit.originalLine, edit.editedLine] : [edit.editedLine, edit.originalLine];
        page.ids.group(edit.id, oldLine, newLine);
        return true;
      }
    }
    for (const { handle } of inserted) this.pdfium.FPDFPage_RemoveObject(page.page, handle);
    for (const { handle, index } of removed) this.pdfium.FPDFPage_InsertObjectAtIndex(page.page, handle, index);
    return false;
  }

  /**
   * Adds or removes only the private line marks introduced by this edit.
   * @param page The held page.
   * @param edit The history entry.
   * @param apply Whether the new line is attached.
   * @returns Whether the required marks were applied.
   */
  private toggleEditMarks(page: PageContext, edit: HeldLineEdit, apply: boolean): boolean {
    if (apply) {
      for (const handle of edit.markTargets) {
        const mark = this.marks.add(page.doc, handle, { id: edit.markId, gap: EXACT_RUN });
        if (!mark) break;
        edit.appliedMarks.set(handle, mark);
      }
      if (edit.appliedMarks.size === edit.markTargets.length) return true;
    }
    for (const [handle, mark] of edit.appliedMarks) this.pdfium.FPDFPageObj_RemoveMark(handle, mark);
    edit.appliedMarks.clear();
    return !apply;
  }

  /**
   * Moves retained objects and restores their source matrices exactly on undo.
   * @param translations The baseline shifts computed at commit.
   * @param apply Whether to apply the shifts.
   * @returns Nothing.
   */
  private translateRuns(translations: readonly RunTranslation[], apply: boolean): void {
    const sign = apply ? 1 : -1;
    for (const { handle, dx, dy, originalMatrix } of translations) {
      this.pdfium.FPDFPageObj_Transform(handle, 1, 0, 0, 1, dx * sign, dy * sign);
      // PDFium's transforms use floats. Reset the matrix after the inverse translation to avoid drift.
      if (!apply) this.setMatrix(handle, originalMatrix);
    }
  }

  /**
   * Destroys only the objects detached from the page by this history entry.
   * @param ids The document's object registry.
   * @param edit The history record.
   * @param applied Whether the edited version is on the page.
   * @returns Nothing.
   */
  dropEdit(ids: TextObjectIds, edit: HeldLineEdit, applied: boolean): void {
    const [detached, attached] = applied ? [edit.before, edit.after] : [edit.after, edit.before];
    const live = new Set(attached.map(({ handle }) => handle));
    for (const { handle } of detached) {
      if (live.has(handle)) continue;
      ids.forget(handle);
      this.pdfium.FPDFPageObj_Destroy(handle);
    }
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
        const text = run.font?.kind === "embedded" ? run.text.normalize("NFC") : run.text;
        const written = this.writeRun(page, { ...run, text }, fonts);
        if (!written) return null;
        texts.push(written.handle);
        return written.advance;
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
        if (run.run.underline) {
          if (!this.stageUnderline(run, matrix, staged) || !this.tagUnderline(page, staged.at(-1)!)) return false;
        }
      }
      if (ids.length !== staged.length) return false;
      staged.forEach((object, index) => {
        this.pdfium.FPDFPage_InsertObject(page.page, object);
        page.ids.register(ids[index]!, [object]);
      });
      for (const handle of texts) page.ids.fontId(this.pdfium.FPDFTextObj_GetFont(handle), handle);
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
   * Writes and measures a single run using the prepared face.
   * @param page The destination and its prepared fonts.
   * @param run The resolved text and style.
   * @param fonts Font handles owned by this write.
   * @returns The detached run and its measured advance, or null on failure.
   */
  private writeRun(page: PageContext, run: TextRun, fonts: Map<string, number>) {
    const handle = this.newRunObject(page, run, fonts);
    if (!handle) return null;
    let advance: number | null = null;
    try {
      const written = this.heap.withWideString(run.text, (ptr) => this.pdfium.FPDFText_SetText(handle, ptr));
      if (!written || !this.fillRun(handle, run)) return null;
      const font = this.pdfium.FPDFTextObj_GetFont(handle);
      const probe = run.font?.kind === "embedded" ? ([...run.text].find((char) => char.trim()) ?? " ") : "A";
      advance = this.measure.advanceOf({ doc: page.doc, font, size: run.fontSize }, run.text, probe);
      return advance === null ? null : { handle, advance };
    } finally {
      if (advance === null) this.pdfium.FPDFPageObj_Destroy(handle);
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
   * Identifies an underline staged by the run writer.
   * @param page The destination page.
   * @param handle The underline path.
   * @returns Whether the private marker was added.
   */
  private tagUnderline(page: PageContext, handle: number): boolean {
    return this.marks.tag(page.doc, handle, { id: "underline", gap: UNDERLINE });
  }

  /**
   * Reads an underline immediately following its text object.
   * @param page A loaded page.
   * @param index The index after the text.
   * @returns Its underline, if one was written by the run writer.
   */
  private underlineAt(page: number, index: number): LineMember | undefined {
    const handle = this.pdfium.FPDFPage_GetObject(page, index);
    if (this.marks.lineOf(handle)?.gap === UNDERLINE) return { index, handle };
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
    const handles = new Set(page.ids.handlesOf(id));
    for (let index = 0; index < this.pdfium.FPDFPage_CountObjects(page.page); index++) {
      const handle = this.pdfium.FPDFPage_GetObject(page.page, index);
      if (!handles.has(handle)) continue;
      this.pdfium.FPDFPageObj_Transform(handle, 1, 0, 0, 1, dx, dy);
      const underline = this.underlineAt(page.page, index + 1);
      if (underline) this.pdfium.FPDFPageObj_Transform(underline.handle, 1, 0, 0, 1, dx, dy);
    }
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
  private membersOf(page: PageContext, lineId: string): LineMember[] {
    const members: LineMember[] = [];
    for (let index = 0; index < this.pdfium.FPDFPage_CountObjects(page.page); index++) {
      const object = this.pdfium.FPDFPage_GetObject(page.page, index);
      const group = page.ids.groupOf(object) ?? this.marks.lineOf(object)?.id;
      if (this.objects.isActiveText(object) && group === lineId) {
        members.push({ handle: object, index });
      }
    }
    return members;
  }

  /**
   * Describes a line (one object, or a line of words) and registers its handles in the worker.
   * @param textPage The page's loaded text page.
   * @param context The document's id registry and font styles read so far.
   * @param id The line's id.
   * @param members Its objects in drawing order.
   * @returns The line and each member's style.
   */
  private describeLine(
    textPage: number,
    context: PageContext & { fonts: Map<number, FontStyle> },
    id: string,
    members: readonly LineMember[],
  ): PageTextObject {
    const handles = members.map(({ handle }) => handle);
    context.ids.register(id, handles);
    const bounds = unionOf(handles.map((handle) => this.objects.boundsOf(handle)));
    const objects = handles.map((handle) => this.objects.describe(textPage, handle, id, bounds));
    const runs = members.map((member, index) => {
      const object = objects[index]!;
      const mark = this.marks.lineOf(member.handle);
      // Legacy word lines use an implicit space between separately drawn words.
      const text =
        mark && mark.gap >= 0 && members.length > 1
          ? object.text.trim() + (index < members.length - 1 ? " " : "")
          : object.text;
      return this.describeRun(member, object, text, context);
    });
    return { ...objects[0]!, text: runs.map((run) => run.text).join(""), runs };
  }

  /**
   * Resolves a member's text style to a document font reference.
   * @param member The page object and index.
   * @param object Its extracted size and colour.
   * @param text The member's logical text.
   * @param context The document font ids and current style cache.
   * @returns A styled run containing no PDFium handles.
   */
  private describeRun(
    member: LineMember,
    object: PageTextObject,
    text: string,
    context: PageContext & { fonts: Map<number, FontStyle> },
  ): TextRun {
    const { ids, fonts } = context;
    const handle = this.pdfium.FPDFTextObj_GetFont(member.handle);
    const name = withoutSubsetTag(this.objects.fontName(handle));
    const style = fonts.get(handle) ?? this.pageFontStyle(handle, this.fontData(handle));
    fonts.set(handle, style);
    const { family, bold, italic } = style;
    const documentFontId = ids.fontId(handle, member.handle);
    const matrix = this.measure.matrixOf(member.handle);
    return {
      text,
      font: {
        kind: "embedded",
        fontId: `document:${documentFontId}`,
        name,
        documentFontId,
        weight: bold ? 700 : 400,
        italic,
      },
      fontFamily: family === "serif" ? "Times" : family === "mono" ? "Courier" : "Helvetica",
      fontSize: object.fontSize,
      color: object.color,
      bold,
      italic,
      underline: Boolean(this.underlineAt(context.page, member.index + 1)),
      originalWidth: this.measure.lengthAlongBaseline(member.handle) * Math.hypot(...matrix.slice(0, 2)),
      baseline: { x: matrix[4] ?? 0, y: matrix[5] ?? 0 },
    };
  }
}

interface EditStageContext {
  readonly page: PageContext;
  readonly plan: LineEditPlan;
  readonly fonts: Map<string, number>;
  readonly layout: EditLayout;
}

/**
 * Assigns drawing slots between unchanged anchors and matches reordered runs by identity.
 * @param original The extracted runs.
 * @param requested The requested runs.
 * @returns The source slot and retention decision for each requested run.
 */
function matchRuns(original: readonly TextRun[], requested: readonly TextRun[]): LineEditPlan["slots"] {
  /** @param a The original run. @param b The requested run. @returns Whether both runs match exactly. */
  const same = (a: TextRun, b: TextRun) => a.text === b.text && sameRunStyle(a, b);
  const count = Array.from({ length: original.length + 1 }, () => new Uint16Array(requested.length + 1));
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = requested.length - 1; j >= 0; j--) {
      count[i]![j] = same(original[i]!, requested[j]!)
        ? count[i + 1]![j + 1]! + 1
        : Math.max(count[i + 1]![j]!, count[i]![j + 1]!);
    }
  }
  const slots: RunSlot[] = requested.map(() => ({}));
  const used = new Set<number>();
  let source = 0;
  let target = 0;
  for (let i = 0, j = 0; i < original.length && j < requested.length;) {
    if (same(original[i]!, requested[j]!)) {
      for (let k = 0; k < Math.min(i - source, j - target); k++) slots[target + k]!.source = source + k;
      slots[j] = { source: i, retained: i };
      used.add(i);
      source = ++i;
      target = ++j;
    } else if (count[i + 1]![j]! >= count[i]![j + 1]!) i++;
    else j++;
  }
  for (let k = 0; k < Math.min(original.length - source, requested.length - target); k++) {
    slots[target + k]!.source = source + k;
  }
  for (const [index, slot] of slots.entries()) {
    if (slot.retained !== undefined) continue;
    const match = original.findIndex((run, i) => !used.has(i) && same(run, requested[index]!));
    if (match === -1) continue;
    slot.retained = match;
    used.add(match);
  }
  return slots;
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
