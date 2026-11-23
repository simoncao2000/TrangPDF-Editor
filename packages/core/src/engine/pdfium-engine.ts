/**
 * PDFium, wrapped. The only file that calls the PDFium C API. It runs anywhere WebAssembly does
 * (the worker in the app, Node in tests) and returns plain pixels, never DOM objects.
 */
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import { err, ok, type PdfPoint, type PdfRect, type Result, type TextRunFontCheck } from "@pdf-editor/shared";
import type { Annotation, EditableAnnotation } from "../annotations/annotation";
import type { CommentReply } from "../annotations/comment";
import type { FormField } from "../forms/form-field";
import type {
  PageFont,
  PageTextObject,
  TextRun,
  TextRunFont,
  TextMatch,
  TextRunLineLayout,
  TextRunPlacement,
  TextSelection,
} from "../page-text/page-text";
import { PageAnnotations } from "./pdfium-annotations";
import { PdfiumForms, type FormEnvironment, type FormFieldWriteError } from "./pdfium-forms";
import {
  fontRequestKey,
  PageTextObjects,
  subsetKey,
  TextObjectIds,
  type HeldLineEdit,
  type PageContext,
} from "./pdfium-page-text";
import { FontSubsetCache, subsetFont } from "./font-subset";
import { missingFontCharacter, validFontBytes } from "../page-text/sfnt";
import { PageText } from "./pdfium-text";
import type {
  AssembleOptions,
  AssemblePart,
  DocId,
  EngineErrorCode,
  PageAddress,
  PageGeometry,
  Rotation,
} from "./protocol";

/** FPDF_GetLastError code for a missing or wrong password. Every other failure is treated as damage. */
const PDFIUM_ERROR_PASSWORD = 4;
/** FPDFBitmap_BGRA. With FPDF_REVERSE_BYTE_ORDER the buffer comes out in RGBA order. */
const BITMAP_FORMAT_BGRA = 4;
const RENDER_FLAGS = 0x01 /* FPDF_ANNOT */ | 0x10; /* FPDF_REVERSE_BYTE_ORDER */
const WHITE = 0xffffffff;
const BYTES_PER_PIXEL = 4;
const FLOAT_BYTES = 4;

/** A bitmap's size in device pixels. */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** Raw RGBA pixels of one rendered page. */
export interface PagePixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

interface OpenDoc {
  readonly handle: number;
  readonly form: FormEnvironment;
  /** PDFium reads the file lazily from this buffer, so it lives until the document closes. */
  readonly bufferPtr: number;
  /** Password the document was opened with, needed to open it a second time when saving. */
  readonly password: string;
  /**
   * Pages kept loaded because their text was edited: switched-off text objects live only in a
   * loaded page, so it must not be closed until the document is. Page index → page handle.
   */
  readonly held: Map<number, number>;
  /** Ids of the text objects on held pages. */
  readonly textIds: TextObjectIds;
  readonly textEdits: Map<string, { pageIndex: number; edit: HeldLineEdit; applied: boolean }>;
}

interface EditFonts {
  readonly borrowed: Map<string, number>;
  readonly sources: Map<string, { bytes: ArrayBuffer; text: string; weight: number }>;
}

const QUARTER_TURN = 90;
/** FLAT_NORMALDISPLAY: flatten annotations as they show on screen (hidden and no-view ones are left out). */
const FLATTEN_AS_SHOWN = 0;
/** Box types for EPDF_GetPageBoxByIndex. */
const BOX_MEDIA = 0;
const BOX_CROP = 1;
/** Fallback page size (US Letter, points) if a page reports no box at all. */
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const INT_BYTES = 4;

export type OpenFailure = Extract<EngineErrorCode, "password-required" | "wrong-password" | "damaged">;

export class PdfiumEngine {
  private readonly docs = new Map<DocId, OpenDoc>();
  private nextDocNumber = 1;
  private readonly pdfium: WrappedPdfiumModule;
  private readonly annotations: PageAnnotations;
  private readonly forms: PdfiumForms;
  private readonly text: PageText;
  private readonly textObjects: PageTextObjects;

  private readonly fontSubsets = new FontSubsetCache();
  private readonly fontBytes = new Map<string, ArrayBuffer>();
  private readonly documentFonts = new Map<DocId, Set<string>>();

  /**
   * Registers a transferred font for an open document.
   * @param docId The document using the font.
   * @param fontId The stable font identifier.
   * @param bytes The original TrueType bytes.
   * @returns Whether registration succeeded.
   */
  registerTextFont(
    docId: DocId,
    fontId: string,
    bytes?: ArrayBuffer,
  ): Result<null, "unknown-document" | "text-edit-failed"> {
    if (!this.docs.has(docId)) return err("unknown-document");
    if (!this.fontBytes.has(fontId)) {
      if (!bytes || !validFontBytes(bytes)) return err("text-edit-failed");
      this.fontBytes.set(fontId, bytes);
    }
    const fonts = this.documentFonts.get(docId) ?? new Set<string>();
    fonts.add(fontId);
    this.documentFonts.set(docId, fonts);
    return ok(null);
  }

  /**
   * Releases a font registration while leaving existing PDF objects intact.
   * @param id The registered font id.
   * @returns Nothing.
   */
  releaseFont(id: string): void {
    const bytes = this.fontBytes.get(id);
    if (bytes) this.fontSubsets.remove(bytes);
    this.fontBytes.delete(id);
    for (const fonts of this.documentFonts.values()) fonts.delete(id);
  }

  /**
   * Use `PdfiumEngine.create()`.
   * @param pdfium An initialised PDFium module.
   */
  private constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.annotations = new PageAnnotations(pdfium);
    this.forms = new PdfiumForms(pdfium);
    this.text = new PageText(pdfium);
    this.textObjects = new PageTextObjects(pdfium);
  }

  /**
   * Starts PDFium from its WebAssembly binary.
   * @param wasmBinary The bytes of `pdfium.wasm`, matching the installed `@embedpdf/pdfium` version.
   * @returns A ready engine.
   */
  static async create(wasmBinary: ArrayBuffer): Promise<PdfiumEngine> {
    const pdfium = await init({ wasmBinary });
    pdfium.PDFiumExt_Init();
    return new PdfiumEngine(pdfium);
  }

  /**
   * Parses a PDF held in memory.
   * @param bytes The whole file.
   * @param password The user password, if the file is encrypted.
   * @returns The new document's id and each page's geometry, or why it could not be opened.
   */
  open(bytes: ArrayBuffer, password?: string): Result<{ docId: DocId; pages: PageGeometry[] }, OpenFailure> {
    const loaded = this.loadCopy(bytes, password ?? "");
    if (!loaded) {
      if (this.pdfium.FPDF_GetLastError() === PDFIUM_ERROR_PASSWORD)
        return err(password ? "wrong-password" : "password-required");
      return err("damaged");
    }
    const { handle, bufferPtr } = loaded;
    const form = this.forms.open(handle);
    if (!form) {
      this.pdfium.FPDF_CloseDocument(handle);
      this.pdfium.pdfium.wasmExports.free(bufferPtr);
      return err("damaged");
    }
    const docId = `doc-${this.nextDocNumber++}`;
    this.docs.set(docId, {
      handle,
      form,
      bufferPtr,
      password: password ?? "",
      held: new Map(),
      textIds: new TextObjectIds(),
      textEdits: new Map(),
    });
    return ok({ docId, pages: this.readPageGeometry(handle) });
  }

  /**
   * Closes a document and frees its memory. Unknown ids are ignored.
   * @param docId The document to close.
   */
  close(docId: DocId): void {
    const doc = this.docs.get(docId);
    if (!doc) return;
    for (const { edit, applied } of doc.textEdits.values()) this.textObjects.dropEdit(doc.textIds, edit, applied);
    for (const page of doc.held.values()) this.closePage(page, doc.form);
    this.forms.close(doc.form);
    this.pdfium.FPDF_CloseDocument(doc.handle);
    this.pdfium.pdfium.wasmExports.free(doc.bufferPtr);
    this.docs.delete(docId);
    const fonts = this.documentFonts.get(docId);
    this.documentFonts.delete(docId);
    for (const id of fonts ?? []) {
      if (![...this.documentFonts.values()].some((registered) => registered.has(id))) this.releaseFont(id);
    }
  }

  /**
   * Draws one page into an RGBA buffer, stretched to exactly `size` pixels on white.
   * @param at An open document's page.
   * @param size Output width and height in device pixels.
   * @param rotation Extra clockwise rotation on top of the page's own (the user's Rotate command).
   * @param hideEditable Leave out the annotations the editor draws itself (the annotation layer
   *   draws them on top); annotations from other apps are still drawn.
   * @returns The pixels, or `unknown-document` if the page is not open.
   */
  renderPage(
    at: PageAddress,
    size: PixelSize,
    rotation: Rotation = 0,
    hideEditable = false,
  ): Result<PagePixels, "unknown-document"> {
    const opened = this.openPage(at);
    if (!opened) return err("unknown-document");
    const { page, form } = opened;
    const { width, height } = size;
    const quarterTurns = rotation / QUARTER_TURN;
    const bitmap = this.pdfium.FPDFBitmap_CreateEx(width, height, BITMAP_FORMAT_BGRA, 0, 0);
    if (hideEditable) this.annotations.setEditableHidden(page, true);
    try {
      this.pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
      this.pdfium.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, quarterTurns, RENDER_FLAGS);
      this.forms.draw(page, form, { bitmap, width, height, quarterTurns, flags: RENDER_FLAGS });
      const start = this.pdfium.FPDFBitmap_GetBuffer(bitmap);
      const length = width * height * BYTES_PER_PIXEL;
      const pixels = new Uint8ClampedArray(this.pdfium.pdfium.HEAPU8.buffer, start, length).slice();
      return ok({ width, height, pixels });
    } finally {
      if (hideEditable) this.annotations.setEditableHidden(page, false);
      this.pdfium.FPDFBitmap_Destroy(bitmap);
      opened.release();
    }
  }

  /**
   * Lists a page's visible annotations.
   * @param at An open document's page.
   * @returns The annotations in drawing order.
   */
  getAnnotations(at: PageAddress): Result<Annotation[], "unknown-document"> {
    return this.withPage(at, (page) => ok(this.annotations.list(page)));
  }

  /**
   * Lists an open page's form widgets.
   * @param at An open document's page.
   * @returns The widgets in page order, or an error if the page or a widget could not be read.
   */
  getFormFields(at: PageAddress): Result<FormField[], "unknown-document" | "engine-failed"> {
    const doc = this.docs.get(at.docId);
    if (!doc) return err("unknown-document");
    return this.withPage(at, (page) => this.forms.list(page, doc.form));
  }

  /**
   * Sets an open page's form field through its widget.
   * @param at An open document's page.
   * @param id The widget id.
   * @param value The new field value.
   * @returns Null on success, or an error if the page or widget is unavailable or the write fails.
   */
  setFormField(at: PageAddress, id: string, value: string): Result<null, "unknown-document" | FormFieldWriteError> {
    const doc = this.docs.get(at.docId);
    if (!doc) return err("unknown-document");
    return this.withPage(at, (page) => this.forms.setValue(page, doc.form, id, value));
  }

  /**
   * Creates or updates an annotation the editor draws itself.
   * @param at An open document's page.
   * @param annotation The annotation; its id decides whether it is new.
   * @returns The annotation as stored (PDFium may grow the box to fit line widths).
   */
  putAnnotation(
    at: PageAddress,
    annotation: EditableAnnotation,
  ): Result<Annotation, "unknown-document" | "annotation-failed"> {
    const doc = this.docs.get(at.docId)?.handle ?? 0;
    return this.withPage(at, (page) => {
      const stored = this.annotations.put(doc, page, annotation);
      return stored ? ok(stored) : err("annotation-failed");
    });
  }

  /**
   * Removes an annotation, in a way `restoreAnnotation` can undo.
   * @param at An open document's page.
   * @param id The annotation's id.
   * @returns `unknown-annotation` if the page has no annotation with that id.
   */
  removeAnnotation(at: PageAddress, id: string): Result<null, "unknown-document" | "unknown-annotation"> {
    return this.withPage(at, (page) => (this.annotations.remove(page, id) ? ok(null) : err("unknown-annotation")));
  }

  /**
   * Creates or updates a reply to an annotation (removing and restoring replies works like
   * annotations: `removeAnnotation` and `restoreAnnotation` with the reply's id).
   * @param at An open document's page.
   * @param parentId The annotation it answers.
   * @param reply The reply.
   * @returns `unknown-annotation` if the page has no annotation `parentId`.
   */
  putReply(
    at: PageAddress,
    parentId: string,
    reply: CommentReply,
  ): Result<null, "unknown-document" | "unknown-annotation"> {
    return this.withPage(at, (page) =>
      this.annotations.putReply(page, parentId, reply) ? ok(null) : err("unknown-annotation"),
    );
  }

  /**
   * Brings back a removed annotation.
   * @param at An open document's page.
   * @param id The annotation's id.
   * @returns `unknown-annotation` if the page has no annotation with that id.
   */
  restoreAnnotation(at: PageAddress, id: string): Result<null, "unknown-document" | "unknown-annotation"> {
    return this.withPage(at, (page) => (this.annotations.restore(page, id) ? ok(null) : err("unknown-annotation")));
  }

  /**
   * The text between two points, one rectangle per line.
   * @param at An open document's page.
   * @param from Where the selection started, in PDF space.
   * @param to Where it ends, in PDF space.
   * @returns The line rectangles; empty when a point misses the text.
   */
  getTextRects(at: PageAddress, from: PdfPoint, to: PdfPoint): Result<PdfRect[], "unknown-document"> {
    return this.withPage(at, (page) => ok(this.text.rectsBetween(page, from, to)));
  }

  /**
   * The text between two points, as a reader selects it.
   * @param at An open document's page.
   * @param from Where the selection started, in PDF space.
   * @param to Where it ends, in PDF space.
   * @returns Its line rectangles and its characters; empty when a point misses the text.
   */
  getTextSelection(at: PageAddress, from: PdfPoint, to: PdfPoint): Result<TextSelection, "unknown-document"> {
    return this.withPage(at, (page) => ok(this.text.selectionBetween(page, from, to)));
  }

  /**
   * Finds a query on some pages of a document, ignoring case.
   * @param docId An open document.
   * @param pageIndexes The pages to search, in the order to search them.
   * @param query The text to find; blank finds nothing.
   * @param limit Stop after this many matches.
   * @returns The matches, page by page.
   */
  findText(
    docId: DocId,
    pageIndexes: readonly number[],
    query: string,
    limit: number,
  ): Result<TextMatch[], "unknown-document"> {
    if (!this.docs.has(docId)) return err("unknown-document");
    if (!query.trim()) return ok([]);
    const matches: TextMatch[] = [];
    for (const pageIndex of pageIndexes) {
      if (matches.length >= limit) break;
      const found = this.withPage({ docId, pageIndex }, (page) =>
        ok(this.text.find(page, pageIndex, query, limit - matches.length)),
      );
      if (found.ok) matches.push(...found.value);
    }
    return ok(matches);
  }

  /**
   * The line of page text under a point.
   * @param at An open document's page.
   * @param point A point in PDF space.
   * @returns The line, or `null` when there is no text there.
   */
  getTextObjectAt(at: PageAddress, point: PdfPoint): Result<PageTextObject | null, "unknown-document"> {
    return this.withHeldPage(at, (page) => ok(this.textObjects.objectAt(page, point)));
  }

  /**
   * Every visible line of page text.
   * @param at An open document's page.
   * @returns The lines in drawing order.
   */
  getTextObjects(at: PageAddress): Result<PageTextObject[], "unknown-document"> {
    return this.withHeldPage(at, (page) => ok(this.textObjects.list(page)));
  }

  /**
   * Lists font programs used by text on the requested page.
   * @param at An open document's page.
   * @returns The page's font choices.
   */
  getPageFonts(at: PageAddress): Result<PageFont[], "unknown-document"> {
    return this.withHeldPage(at, (page) => ok(this.textObjects.listFonts(page)));
  }

  /**
   * Replaces a line's text, keeping the original (switched off) for undo.
   * @param at An open document's page.
   * @param id The line's id.
   * @param newId The id to give the replacement.
   * @param text The new text.
   * @returns `text-edit-failed` if the line is not visible text or PDFium refused the text.
   */
  replacePageText(
    at: PageAddress,
    id: string,
    newId: string,
    text: string,
  ): Result<null, "unknown-document" | "text-edit-failed"> {
    return this.withHeldPage(at, (page) =>
      this.textObjects.replace(page, id, newId, text) ? ok(null) : err("text-edit-failed"),
    );
  }

  /**
   * Checks whether a draft run can use the requested document font.
   * @param at The target page.
   * @param run The draft and its style.
   * @returns The first missing character if the font cannot encode the run.
   */
  checkPageTextFont(at: PageAddress, run: TextRun): Result<TextRunFontCheck, "unknown-document"> {
    return this.withHeldPage(at, (page) => {
      const { missingCharacter } = this.textObjects.checkDocumentFont(page, run);
      return ok(missingCharacter ? { missingCharacter } : {});
    });
  }

  /**
   * Stages and commits one rich line edit, retaining exactly the detached PDF objects.
   * @param at The target page.
   * @param id The current line id.
   * @param editId The history key.
   * @param runs The replacement runs.
   * @returns Any missing glyph from the requested document face, or an engine error.
   */
  async editPageText(
    at: PageAddress,
    id: string,
    editId: string,
    runs: readonly TextRun[],
  ): Promise<Result<TextRunFontCheck, "unknown-document" | "text-edit-failed">> {
    const doc = this.docs.get(at.docId);
    if (!doc) return err("unknown-document");
    if (doc.textEdits.has(editId)) return err("text-edit-failed");
    const source = this.withHeldPage(at, (page) => ok({ page, plan: this.textObjects.planEdit(page, id, runs) }));
    if (!source.ok) return source;
    const { page, plan } = source.value;
    if (!plan) return err("text-edit-failed");
    const fonts: EditFonts = { borrowed: new Map(), sources: new Map() };
    const subsets = new Map<string, ArrayBuffer>();
    const resolved: TextRun[] = [];
    let missingCharacter: string | undefined;
    try {
      for (const [index, run] of runs.entries()) {
        const choice =
          plan.slots[index]!.retained !== undefined ? { run } : this.prepareEditRun({ at, page, fonts }, run);
        if (!choice) return err("text-edit-failed");
        missingCharacter ??= choice.missingCharacter;
        resolved.push(choice.run);
      }
      for (const [key, { bytes, text, weight }] of fonts.sources) {
        subsets.set(key, await subsetFont(bytes, text, weight, true));
      }
    } catch {
      return err("text-edit-failed");
    }
    const edit = this.textObjects.commitEdit({ ...page, subsets, borrowed: fonts.borrowed }, plan, resolved);
    if (!edit) return err("text-edit-failed");
    doc.textEdits.set(editId, { pageIndex: at.pageIndex, edit, applied: true });
    return ok(missingCharacter ? { missingCharacter } : {});
  }

  /**
   * Resolves a changed run through its document font, a standard face or an available bundled face.
   * @param context The destination and the edit's staging resources.
   * @param run The requested run.
   * @returns The resolved run and first missing document glyph, if any.
   */
  private prepareEditRun(
    context: { at: PageAddress; page: PageContext; fonts: EditFonts },
    run: TextRun,
  ): (TextRunFontCheck & { run: TextRun }) | null {
    const { at, page, fonts } = context;
    const { font, missingCharacter } = this.textObjects.checkDocumentFont(page, run);
    const reference = run.font;
    if (font && reference?.kind === "embedded") {
      fonts.borrowed.set(fontRequestKey(reference), font);
      return { run };
    }
    const standard = { ...run, font: reference?.kind === "standard" ? reference : undefined };
    if (reference?.kind !== "embedded" || reference.documentFontId) {
      if (this.textObjects.standardSupports(page, standard)) return { run: standard, missingCharacter };
    }
    const available = this.documentFonts.get(at.docId);
    const bundled = [...(available ?? [])].filter((id) => id.startsWith("bundled:"));
    const candidates = new Set([...(reference?.kind === "embedded" ? [reference.fontId] : []), ...bundled]);
    for (const id of candidates) {
      const bytes = available?.has(id) ? this.fontBytes.get(id) : undefined;
      if (!bytes || missingFontCharacter(bytes, run.text + " ", true)) continue;
      const embedded = {
        kind: "embedded",
        fontId: id,
        name: reference?.kind === "embedded" ? reference.name : (run.fontFamily ?? "Helvetica"),
        weight: run.bold ? 700 : 400,
        italic: run.italic,
      } as const;
      const key = subsetKey(embedded);
      const source = fonts.sources.get(key) ?? { bytes, text: "", weight: embedded.weight };
      source.text += run.text;
      fonts.sources.set(key, source);
      return { run: { ...run, font: embedded }, missingCharacter };
    }
    return null;
  }

  /**
   * Attaches the line version selected by undo or redo.
   * @param at The original page address.
   * @param editId The history key.
   * @param applied Whether to attach the edited version.
   * @returns The result of exchanging objects.
   */
  togglePageTextEdit(
    at: PageAddress,
    editId: string,
    applied: boolean,
  ): Result<null, "unknown-document" | "text-edit-failed"> {
    const record = this.docs.get(at.docId)?.textEdits.get(editId);
    if (!record || record.pageIndex !== at.pageIndex) return err("text-edit-failed");
    if (record.applied === applied) return ok(null);
    return this.withHeldPage(at, (page) => {
      if (!this.textObjects.toggleEdit(page, record.edit, applied)) return err("text-edit-failed");
      record.applied = applied;
      return ok(null);
    });
  }

  /**
   * Releases a history entry and any PDF objects it owns.
   * @param at The original page address.
   * @param editId The history key.
   * @returns Nothing.
   */
  dropPageTextEdit(at: PageAddress, editId: string): void {
    const doc = this.docs.get(at.docId);
    const record = doc?.textEdits.get(editId);
    if (!doc || !record || record.pageIndex !== at.pageIndex) return;
    doc.textEdits.delete(editId);
    this.textObjects.dropEdit(doc.textIds, record.edit, record.applied);
  }

  /**
   * Adds styled runs of page text.
   * @param at An open document's page.
   * @param lines The lines and where each baseline starts.
   * @param style The first baseline, blank line size and angle.
   * @param ids One id per object.
   * @returns `text-edit-failed` if PDFium refused the text.
   */
  async addPageText(
    at: PageAddress,
    lines: readonly TextRunLineLayout[],
    style: TextRunPlacement,
    ids: readonly string[],
  ): Promise<Result<null, "unknown-document" | "text-edit-failed">> {
    const registered = this.documentFonts.get(at.docId);
    const subsets = new Map<string, ArrayBuffer>();
    const borrowed = new Map<string, number>();
    const textByFont = new Map<string, { font: Extract<TextRunFont, { kind: "embedded" }>; text: string }>();
    for (const { runs } of lines) {
      for (const { font, text } of runs) {
        if (font?.kind !== "embedded") continue;
        const key = fontRequestKey(font);
        const block = textByFont.get(key) ?? { font, text: "" };
        block.text += text.normalize("NFC") + " ";
        textByFont.set(key, block);
      }
    }
    const entireBlock = lines.flatMap(({ runs }) => runs.map(({ text }) => text.normalize("NFC"))).join(" ");
    const needed = new Map<string, { font: Extract<TextRunFont, { kind: "embedded" }>; text: string }>();
    try {
      for (const [key, { font, text }] of textByFont) {
        if (font.documentFontId) {
          const existing = this.withHeldPage(at, (page) => ok(this.textObjects.borrowFont(page, font, entireBlock)));
          if (!existing.ok) return existing;
          if (existing.value) {
            borrowed.set(key, existing.value);
            continue;
          }
        }
        const keyForSubset = subsetKey(font);
        const request = needed.get(keyForSubset) ?? { font, text: "" };
        request.text += text;
        needed.set(keyForSubset, request);
      }
      for (const [key, { font, text }] of needed) {
        const bytes = registered?.has(font.fontId) ? this.fontBytes.get(font.fontId) : undefined;
        if (!bytes) return err("text-edit-failed");
        subsets.set(key, await this.fontSubsets.get(font.fontId, bytes, text, font.weight));
      }
    } catch {
      return err("text-edit-failed");
    }
    return this.withHeldPage(at, (page) =>
      this.textObjects.add({ ...page, subsets, borrowed }, lines, style, ids) ? ok(null) : err("text-edit-failed"),
    );
  }

  /**
   * Moves a line (undo moves it back by the opposite distance).
   * @param at An open document's page.
   * @param id The line's id.
   * @param dx Distance along x, in points.
   * @param dy Distance along y, in points (positive is up).
   * @returns `text-edit-failed` if the id is not on the page.
   */
  movePageText(
    at: PageAddress,
    id: string,
    dx: number,
    dy: number,
  ): Result<null, "unknown-document" | "text-edit-failed"> {
    return this.withHeldPage(at, (page) =>
      this.textObjects.move(page, id, dx, dy) ? ok(null) : err("text-edit-failed"),
    );
  }

  /**
   * Draws one line on its own, for dragging it.
   * @param at An open document's page.
   * @param id The line's id.
   * @param scale Device pixels per point.
   * @returns Transparent RGBA pixels cropped to the text, or `text-edit-failed`.
   */
  renderTextObject(
    at: PageAddress,
    id: string,
    scale: number,
  ): Result<PagePixels, "unknown-document" | "text-edit-failed"> {
    return this.withHeldPage(at, (page) => {
      const rendered = this.textObjects.render(page, id, scale);
      return rendered ? ok(rendered) : err("text-edit-failed");
    });
  }

  /**
   * Switches lines of page text on and off: undo and redo of text edits.
   * @param at An open document's page.
   * @param show Ids to switch on.
   * @param hide Ids to switch off.
   * @returns `text-edit-failed` if an id is not on the page.
   */
  showPageText(
    at: PageAddress,
    show: readonly string[],
    hide: readonly string[],
  ): Result<null, "unknown-document" | "text-edit-failed"> {
    return this.withHeldPage(at, (page) =>
      this.textObjects.show(page, show, hide) ? ok(null) : err("text-edit-failed"),
    );
  }

  /**
   * Holds a page (it stays loaded until the document closes) and runs `work` on it.
   * @param at An open document's page.
   * @param work What to do with the page, its document and the document's text ids.
   * @returns `work`'s result, or `unknown-document`.
   */
  private withHeldPage<T, E>(
    at: PageAddress,
    work: (page: PageContext) => Result<T, E>,
  ): Result<T, E | "unknown-document"> {
    const doc = this.docs.get(at.docId);
    const page = this.holdPage(at);
    if (!doc || !page) return err("unknown-document");
    return work({ doc: doc.handle, page, ids: doc.textIds });
  }

  /**
   * A loaded page: the held one if the page is held, otherwise a fresh load.
   * @param at An open document's page.
   * @returns The page and how to let go of it, or `null` if it does not exist.
   */
  private openPage(at: PageAddress): { page: number; form: FormEnvironment; release(): void } | null {
    const doc = this.docs.get(at.docId);
    if (!doc) return null;
    const held = doc.held.get(at.pageIndex);
    if (held) return { page: held, form: doc.form, release: () => {} };
    const page = this.pdfium.FPDF_LoadPage(doc.handle, at.pageIndex);
    return page ? { page, form: doc.form, release: () => this.closePage(page, doc.form) } : null;
  }

  /**
   * Closes a loaded page and releases any form state for it first.
   * @param page The loaded page handle.
   * @param form Its document's form environment.
   * @returns Nothing.
   */
  private closePage(page: number, form: FormEnvironment): void {
    this.forms.beforeClosePage(page, form);
    this.pdfium.FPDF_ClosePage(page);
  }

  /**
   * Keeps a page loaded until its document closes.
   * @param at An open document's page.
   * @returns The held page handle, or 0 if it does not exist.
   */
  private holdPage(at: PageAddress): number {
    const doc = this.docs.get(at.docId);
    if (!doc) return 0;
    const held = doc.held.get(at.pageIndex);
    if (held) return held;
    const page = this.pdfium.FPDF_LoadPage(doc.handle, at.pageIndex);
    if (page) doc.held.set(at.pageIndex, page);
    return page;
  }

  /**
   * Writes the objects of held pages into their content streams, so copies and imports of the
   * document see the edited text. Switched-off objects stay in memory for undo but are not written.
   * @param docIds The documents to write.
   */
  private writeHeldPages(docIds: Iterable<DocId>): void {
    for (const docId of docIds) {
      for (const page of this.docs.get(docId)?.held.values() ?? []) this.pdfium.FPDFPage_GenerateContent(page);
    }
  }

  /**
   * Loads a page (or uses the held one), runs `work`, and lets go of the page.
   * @param at An open document's page.
   * @param work What to do with the page handle.
   * @returns `work`'s result, or `unknown-document` if the document or page does not exist.
   */
  private withPage<T, E>(at: PageAddress, work: (page: number) => Result<T, E>): Result<T, E | "unknown-document"> {
    const opened = this.openPage(at);
    if (!opened) return err("unknown-document");
    try {
      return work(opened.page);
    } finally {
      opened.release();
    }
  }

  /**
   * Builds a new PDF from pages of open documents, in order, with extra rotation (architecture §7.3).
   * Starts from a copy of the first page's document as it is now (annotations and form values
   * included), so its bookmarks, metadata and form keep working; pages from other files are
   * imported, then everything is put in order, unused pages and removed annotations are dropped.
   * The result is reopened to check it before it is returned.
   * @param parts The pages of the new file, in order.
   * @param options `flatten`: draw annotations and form fields into the pages, so they can no
   *   longer be edited (for a copy to send).
   * @returns The new file's bytes, or why it could not be built.
   */
  assemble(
    parts: readonly AssemblePart[],
    options: AssembleOptions = {},
  ): Result<ArrayBuffer, "unknown-document" | "assemble-failed"> {
    const first = parts[0];
    const base = first ? this.docs.get(first.docId) : undefined;
    if (!first || !base || parts.some((part) => !this.docs.has(part.docId))) return err("unknown-document");

    this.writeHeldPages(new Set(parts.map((part) => part.docId)));
    const current = this.saveCopy(base.handle);
    const dest = current ? this.loadCopy(current, base.password) : null;
    if (!dest) return err("assemble-failed");
    try {
      const order = this.importForeignPages(dest.handle, first.docId, parts);
      if (!order || !this.arrange(dest.handle, order)) return err("assemble-failed");
      parts.forEach((part, index) => this.finishPage(dest.handle, index, part.rotation, options.flatten ?? false));
      const bytes = this.saveCopy(dest.handle);
      // An encrypted file stays encrypted when saved, so it is checked with the same password.
      if (!bytes || this.countPages(bytes, base.password) !== parts.length) return err("assemble-failed");
      return ok(bytes);
    } finally {
      this.pdfium.FPDF_CloseDocument(dest.handle);
      this.pdfium.pdfium.wasmExports.free(dest.bufferPtr);
    }
  }

  /**
   * Opens a temporary document from bytes, without registering it.
   * @param bytes A PDF.
   * @param password Its password, if encrypted.
   * @returns The handle and the buffer to free after closing, or `null` if it does not open.
   */
  private loadCopy(bytes: ArrayBuffer, password: string): { handle: number; bufferPtr: number } | null {
    const heap = this.pdfium.pdfium;
    const bufferPtr = heap.wasmExports.malloc(bytes.byteLength);
    heap.HEAPU8.set(new Uint8Array(bytes), bufferPtr);
    const handle = this.pdfium.FPDF_LoadMemDocument(bufferPtr, bytes.byteLength, password);
    if (handle) return { handle, bufferPtr };
    heap.wasmExports.free(bufferPtr);
    return null;
  }

  /**
   * Appends pages from documents other than the base, and works out each part's index in `dest`.
   * @param dest A fresh copy of the base document.
   * @param baseDocId The document `dest` was copied from.
   * @param parts The pages of the new file.
   * @returns For each part, its current page index in `dest`; `null` if an import failed.
   */
  private importForeignPages(dest: number, baseDocId: DocId, parts: readonly AssemblePart[]): number[] | null {
    const indexPtr = this.pdfium.pdfium.wasmExports.malloc(INT_BYTES);
    try {
      return parts.map((part) => {
        if (part.docId === baseDocId) return part.pageIndex;
        const appendAt = this.pdfium.FPDF_GetPageCount(dest);
        this.pdfium.pdfium.setValue(indexPtr, part.pageIndex, "i32");
        const imported = this.pdfium.FPDF_ImportPagesByIndex(
          dest,
          this.docs.get(part.docId)!.handle,
          indexPtr,
          1,
          appendAt,
        );
        if (!imported) throw new Error("import failed");
        return appendAt;
      });
    } catch {
      return null;
    } finally {
      this.pdfium.pdfium.wasmExports.free(indexPtr);
    }
  }

  /**
   * Moves the wanted pages to the front in order, then deletes the rest.
   * @param dest The document being built.
   * @param order Current indexes of the wanted pages, in their final order.
   * @returns True on success.
   */
  private arrange(dest: number, order: readonly number[]): boolean {
    const heap = this.pdfium.pdfium;
    const listPtr = heap.wasmExports.malloc(order.length * INT_BYTES);
    try {
      order.forEach((pageIndex, i) => heap.setValue(listPtr + i * INT_BYTES, pageIndex, "i32"));
      if (!this.pdfium.FPDF_MovePages(dest, listPtr, order.length, 0)) return false;
      for (let index = this.pdfium.FPDF_GetPageCount(dest) - 1; index >= order.length; index--)
        this.pdfium.FPDFPage_Delete(dest, index);
      return true;
    } finally {
      heap.wasmExports.free(listPtr);
    }
  }

  /**
   * Final touches on one page of a file being built: drops annotations removed in the editor and
   * turns the page further clockwise.
   * @param dest The document being built.
   * @param pageIndex The page.
   * @param rotation Extra rotation.
   * @param flatten Draw the annotations into the page.
   */
  private finishPage(dest: number, pageIndex: number, rotation: Rotation, flatten: boolean): void {
    const page = this.pdfium.FPDF_LoadPage(dest, pageIndex);
    if (!page) return;
    this.annotations.stripRemoved(page);
    if (flatten) this.pdfium.FPDFPage_Flatten(page, FLATTEN_AS_SHOWN);
    if (rotation !== 0) {
      const quarterTurns = (this.pdfium.FPDFPage_GetRotation(page) + rotation / QUARTER_TURN) % 4;
      this.pdfium.FPDFPage_SetRotation(page, quarterTurns);
    }
    this.pdfium.FPDF_ClosePage(page);
  }

  /**
   * Serialises a document.
   * @param doc An open PDFium document.
   * @returns The file's bytes, or `null` if PDFium could not write it.
   */
  private saveCopy(doc: number): ArrayBuffer | null {
    const heap = this.pdfium.pdfium;
    const writer = this.pdfium.PDFiumExt_OpenFileWriter();
    try {
      if (!this.pdfium.PDFiumExt_SaveAsCopy(doc, writer)) return null;
      const size = this.pdfium.PDFiumExt_GetFileWriterSize(writer);
      const dataPtr = heap.wasmExports.malloc(size);
      try {
        this.pdfium.PDFiumExt_GetFileWriterData(writer, dataPtr, size);
        return heap.HEAPU8.slice(dataPtr, dataPtr + size).buffer;
      } finally {
        heap.wasmExports.free(dataPtr);
      }
    } finally {
      this.pdfium.PDFiumExt_CloseFileWriter(writer);
    }
  }

  /**
   * Opens bytes just to count their pages (the save verification step).
   * @param bytes A PDF.
   * @param password Its password, if it is encrypted.
   * @returns The page count, or -1 if the bytes do not open.
   */
  private countPages(bytes: ArrayBuffer, password: string): number {
    const opened = this.open(bytes, password || undefined);
    if (!opened.ok) return -1;
    this.close(opened.value.docId);
    return opened.value.pages.length;
  }

  /**
   * Reads every page's crop box and own rotation without loading page content.
   * @param handle An open PDFium document handle.
   * @returns One entry per page.
   */
  private readPageGeometry(handle: number): PageGeometry[] {
    const heap = this.pdfium.pdfium;
    const count = this.pdfium.FPDF_GetPageCount(handle);
    // FS_RECTF: left, top, right, bottom.
    const rectPtr = heap.wasmExports.malloc(4 * FLOAT_BYTES);
    const read = (offset: number) => heap.getValue(rectPtr + offset * FLOAT_BYTES, "float");
    try {
      return Array.from({ length: count }, (_, index) => {
        const found =
          this.pdfium.EPDF_GetPageBoxByIndex(handle, index, BOX_CROP, rectPtr) ||
          this.pdfium.EPDF_GetPageBoxByIndex(handle, index, BOX_MEDIA, rectPtr);
        const [left, top, right, bottom] = found
          ? [read(0), read(1), read(2), read(3)]
          : [0, LETTER_HEIGHT, LETTER_WIDTH, 0];
        const quarterTurns = this.pdfium.EPDF_GetPageRotationByIndex(handle, index);
        return {
          cropBox: {
            x: Math.min(left, right),
            y: Math.min(top, bottom),
            width: Math.abs(right - left),
            height: Math.abs(top - bottom),
          },
          rotation: ((((quarterTurns % 4) + 4) % 4) * QUARTER_TURN) as Rotation,
        };
      });
    } finally {
      heap.wasmExports.free(rectPtr);
    }
  }
}
