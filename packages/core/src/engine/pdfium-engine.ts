/**
 * PDFium, wrapped. The only file that calls the PDFium C API. It runs anywhere WebAssembly does
 * (the worker in the app, Node in tests) and returns plain pixels, never DOM objects.
 */
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import { err, ok, type PageSize, type Result } from "@pdf-editor/shared";
import type { AssemblePart, DocId, EngineErrorCode, Rotation } from "./protocol";

/** FPDF_GetLastError code for a missing or wrong password. Every other failure is treated as damage. */
const PDFIUM_ERROR_PASSWORD = 4;
/** FPDFBitmap_BGRA. With FPDF_REVERSE_BYTE_ORDER the buffer comes out in RGBA order. */
const BITMAP_FORMAT_BGRA = 4;
const RENDER_FLAGS = 0x01 /* FPDF_ANNOT */ | 0x10 /* FPDF_REVERSE_BYTE_ORDER */;
const WHITE = 0xffffffff;
const BYTES_PER_PIXEL = 4;
const FLOAT_BYTES = 4;

/** Raw RGBA pixels of one rendered page. */
export interface PagePixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

interface OpenDoc {
  readonly handle: number;
  /** PDFium reads the file lazily from this buffer, so it lives until the document closes. */
  readonly bufferPtr: number;
  readonly byteLength: number;
  /** Password the document was opened with, needed to open it a second time when saving. */
  readonly password: string;
}

const QUARTER_TURN = 90;
const INT_BYTES = 4;

export type OpenFailure = Extract<EngineErrorCode, "password-required" | "wrong-password" | "damaged">;

export class PdfiumEngine {
  private readonly docs = new Map<DocId, OpenDoc>();
  private nextDocNumber = 1;
  private readonly pdfium: WrappedPdfiumModule;

  /**
   * Use `PdfiumEngine.create()`.
   * @param pdfium An initialised PDFium module.
   */
  private constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
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
   * @returns The new document's id and page sizes, or why it could not be opened.
   */
  open(bytes: ArrayBuffer, password?: string): Result<{ docId: DocId; pageSizes: PageSize[] }, OpenFailure> {
    const heap = this.pdfium.pdfium;
    const bufferPtr = heap.wasmExports.malloc(bytes.byteLength);
    heap.HEAPU8.set(new Uint8Array(bytes), bufferPtr);
    const handle = this.pdfium.FPDF_LoadMemDocument(bufferPtr, bytes.byteLength, password ?? "");
    if (!handle) {
      const code = this.pdfium.FPDF_GetLastError();
      heap.wasmExports.free(bufferPtr);
      if (code === PDFIUM_ERROR_PASSWORD) return err(password ? "wrong-password" : "password-required");
      return err("damaged");
    }
    const docId = `doc-${this.nextDocNumber++}`;
    this.docs.set(docId, { handle, bufferPtr, byteLength: bytes.byteLength, password: password ?? "" });
    return ok({ docId, pageSizes: this.readPageSizes(handle) });
  }

  /**
   * Closes a document and frees its memory. Unknown ids are ignored.
   * @param docId The document to close.
   */
  close(docId: DocId): void {
    const doc = this.docs.get(docId);
    if (!doc) return;
    this.pdfium.FPDF_CloseDocument(doc.handle);
    this.pdfium.pdfium.wasmExports.free(doc.bufferPtr);
    this.docs.delete(docId);
  }

  /**
   * Draws one page into an RGBA buffer, stretched to exactly `width` × `height` pixels on white.
   * @param docId An open document.
   * @param pageIndex Zero-based page index.
   * @param width Output width in device pixels.
   * @param height Output height in device pixels.
   * @param rotation Extra clockwise rotation on top of the page's own (the user's Rotate command).
   * @returns The pixels, or `unknown-document` if `docId` is not open.
   */
  renderPage(docId: DocId, pageIndex: number, width: number, height: number, rotation: Rotation = 0): Result<PagePixels, "unknown-document"> {
    const doc = this.docs.get(docId);
    if (!doc) return err("unknown-document");
    const page = this.pdfium.FPDF_LoadPage(doc.handle, pageIndex);
    const bitmap = this.pdfium.FPDFBitmap_CreateEx(width, height, BITMAP_FORMAT_BGRA, 0, 0);
    try {
      this.pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
      this.pdfium.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, rotation / QUARTER_TURN, RENDER_FLAGS);
      const start = this.pdfium.FPDFBitmap_GetBuffer(bitmap);
      const length = width * height * BYTES_PER_PIXEL;
      const pixels = new Uint8ClampedArray(this.pdfium.pdfium.HEAPU8.buffer, start, length).slice();
      return ok({ width, height, pixels });
    } finally {
      this.pdfium.FPDFBitmap_Destroy(bitmap);
      this.pdfium.FPDF_ClosePage(page);
    }
  }

  /**
   * Builds a new PDF from pages of open documents, in order, with extra rotation (architecture §7.3).
   * Starts from a fresh copy of the first page's file, so its bookmarks, metadata and form keep
   * working; pages from other files are imported, then everything is put in order and unused pages
   * are removed. The result is reopened to check it before it is returned.
   * @param parts The pages of the new file, in order.
   * @returns The new file's bytes, or why it could not be built.
   */
  assemble(parts: readonly AssemblePart[]): Result<ArrayBuffer, "unknown-document" | "assemble-failed"> {
    const first = parts[0];
    const base = first ? this.docs.get(first.docId) : undefined;
    if (!first || !base || parts.some((part) => !this.docs.has(part.docId))) return err("unknown-document");

    const dest = this.pdfium.FPDF_LoadMemDocument(base.bufferPtr, base.byteLength, base.password);
    if (!dest) return err("assemble-failed");
    try {
      const order = this.importForeignPages(dest, first.docId, parts);
      if (!order || !this.arrange(dest, order)) return err("assemble-failed");
      parts.forEach((part, index) => this.addRotation(dest, index, part.rotation));
      const bytes = this.saveCopy(dest);
      // An encrypted file stays encrypted when saved, so it is checked with the same password.
      if (!bytes || this.countPages(bytes, base.password) !== parts.length) return err("assemble-failed");
      return ok(bytes);
    } finally {
      this.pdfium.FPDF_CloseDocument(dest);
    }
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
        const imported = this.pdfium.FPDF_ImportPagesByIndex(dest, this.docs.get(part.docId)!.handle, indexPtr, 1, appendAt);
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
      for (let index = this.pdfium.FPDF_GetPageCount(dest) - 1; index >= order.length; index--) this.pdfium.FPDFPage_Delete(dest, index);
      return true;
    } finally {
      heap.wasmExports.free(listPtr);
    }
  }

  /**
   * Turns one page further clockwise.
   * @param dest The document being built.
   * @param pageIndex Page to turn.
   * @param rotation Extra rotation.
   */
  private addRotation(dest: number, pageIndex: number, rotation: Rotation): void {
    if (rotation === 0) return;
    const page = this.pdfium.FPDF_LoadPage(dest, pageIndex);
    const quarterTurns = (this.pdfium.FPDFPage_GetRotation(page) + rotation / QUARTER_TURN) % 4;
    this.pdfium.FPDFPage_SetRotation(page, quarterTurns);
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
    return opened.value.pageSizes.length;
  }

  /**
   * Reads every page's size without loading page content.
   * @param handle An open PDFium document handle.
   * @returns Sizes in points, rotation applied.
   */
  private readPageSizes(handle: number): PageSize[] {
    const heap = this.pdfium.pdfium;
    const count = this.pdfium.FPDF_GetPageCount(handle);
    const sizePtr = heap.wasmExports.malloc(2 * FLOAT_BYTES);
    try {
      return Array.from({ length: count }, (_, index) => {
        this.pdfium.FPDF_GetPageSizeByIndexF(handle, index, sizePtr);
        return { width: heap.getValue(sizePtr, "float"), height: heap.getValue(sizePtr + FLOAT_BYTES, "float") };
      });
    } finally {
      heap.wasmExports.free(sizePtr);
    }
  }
}
