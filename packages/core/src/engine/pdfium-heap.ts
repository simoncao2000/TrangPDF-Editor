/**
 * Small helpers for passing values through PDFium's WebAssembly memory: scratch buffers that are
 * always freed, UTF-16 strings, and FS_RECTF / FS_POINTF / FS_QUADPOINTSF structs.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";

export const FLOAT_BYTES = 4;
export const INT_BYTES = 4;
const UTF16_BYTES = 2;
/** FS_POINTF: x, y. */
export const POINT_BYTES = 2 * FLOAT_BYTES;
/** FS_RECTF: left, top, right, bottom. */
export const RECT_BYTES = 4 * FLOAT_BYTES;
/** FS_QUADPOINTSF: x1, y1 … x4, y4. */
export const QUAD_BYTES = 8 * FLOAT_BYTES;

export class PdfiumHeap {
  private readonly pdfium: WrappedPdfiumModule;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
  }

  /**
   * Runs `work` with a scratch buffer that is freed afterwards, even if `work` throws.
   * @param bytes Buffer size.
   * @param work Receives the buffer's address.
   * @returns Whatever `work` returns.
   */
  withBuffer<T>(bytes: number, work: (ptr: number) => T): T {
    const ptr = this.pdfium.pdfium.wasmExports.malloc(Math.max(bytes, 1));
    try {
      return work(ptr);
    } finally {
      this.pdfium.pdfium.wasmExports.free(ptr);
    }
  }

  /**
   * Runs `work` with a NUL-terminated UTF-16LE copy of `text` (FPDF_WIDESTRING).
   * @param text The string.
   * @param work Receives its address.
   * @returns Whatever `work` returns.
   */
  withWideString<T>(text: string, work: (ptr: number) => T): T {
    return this.withBuffer((text.length + 1) * UTF16_BYTES, (ptr) => {
      for (let i = 0; i < text.length; i++)
        this.pdfium.pdfium.setValue(ptr + i * UTF16_BYTES, text.charCodeAt(i), "i16");
      this.pdfium.pdfium.setValue(ptr + text.length * UTF16_BYTES, 0, "i16");
      return work(ptr);
    });
  }

  /**
   * Reads a UTF-16 string from a PDFium "write into my buffer" call, which returns the byte length
   * it needs when given a null buffer.
   * @param read Calls PDFium with (buffer, byteLength) and returns the byte length.
   * @returns The string, without the trailing NUL; empty when PDFium returns nothing.
   */
  readWideString(read: (ptr: number, bytes: number) => number): string {
    const bytes = read(0, 0);
    if (bytes <= UTF16_BYTES) return "";
    return this.withBuffer(bytes, (ptr) => {
      read(ptr, bytes);
      let text = "";
      for (let i = 0; i < bytes / UTF16_BYTES - 1; i++)
        text += String.fromCharCode(this.pdfium.pdfium.getValue(ptr + i * UTF16_BYTES, "i16") & 0xffff);
      return text;
    });
  }

  /**
   * Reads a float.
   * @param ptr Its address.
   * @returns The value.
   */
  float(ptr: number): number {
    return this.pdfium.pdfium.getValue(ptr, "float");
  }

  /**
   * Reads a 32-bit integer.
   * @param ptr Its address.
   * @returns The value.
   */
  int(ptr: number): number {
    return this.pdfium.pdfium.getValue(ptr, "i32");
  }

  /**
   * Writes floats one after another.
   * @param ptr Start address.
   * @param values The floats.
   */
  writeFloats(ptr: number, values: readonly number[]): void {
    values.forEach((value, i) => this.pdfium.pdfium.setValue(ptr + i * FLOAT_BYTES, value, "float"));
  }

  /**
   * Writes a rectangle as an FS_RECTF.
   * @param ptr Address of an FS_RECTF.
   * @param rect The rectangle in PDF space.
   */
  writeRect(ptr: number, rect: PdfRect): void {
    this.writeFloats(ptr, [rect.x, rect.y + rect.height, rect.x + rect.width, rect.y]);
  }

  /**
   * Reads an FS_RECTF.
   * @param ptr Its address.
   * @returns The rectangle in PDF space.
   */
  readRect(ptr: number): PdfRect {
    const [left, top, right, bottom] = [0, 1, 2, 3].map((i) => this.float(ptr + i * FLOAT_BYTES)) as [
      number,
      number,
      number,
      number,
    ];
    return {
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(top - bottom),
    };
  }

  /**
   * Writes a rectangle as an FS_QUADPOINTSF: top-left, top-right, bottom-left, bottom-right.
   * @param ptr Address of an FS_QUADPOINTSF.
   * @param rect The rectangle in PDF space.
   */
  writeQuad(ptr: number, rect: PdfRect): void {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y + rect.height;
    const bottom = rect.y;
    this.writeFloats(ptr, [left, top, right, top, left, bottom, right, bottom]);
  }

  /**
   * Reads an FS_QUADPOINTSF as the rectangle around its four corners.
   * @param ptr Its address.
   * @returns The bounding rectangle in PDF space.
   */
  readQuadBounds(ptr: number): PdfRect {
    const values = Array.from({ length: 8 }, (_, i) => this.float(ptr + i * FLOAT_BYTES));
    const xs = values.filter((_, i) => i % 2 === 0);
    const ys = values.filter((_, i) => i % 2 === 1);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  /**
   * Writes points as consecutive FS_POINTFs.
   * @param ptr Start address.
   * @param points The points.
   */
  writePoints(ptr: number, points: readonly PdfPoint[]): void {
    this.writeFloats(
      ptr,
      points.flatMap((point) => [point.x, point.y]),
    );
  }

  /**
   * Reads consecutive FS_POINTFs.
   * @param ptr Start address.
   * @param count How many points.
   * @returns The points.
   */
  readPoints(ptr: number, count: number): PdfPoint[] {
    return Array.from({ length: count }, (_, i) => ({
      x: this.float(ptr + i * POINT_BYTES),
      y: this.float(ptr + i * POINT_BYTES + FLOAT_BYTES),
    }));
  }
}
