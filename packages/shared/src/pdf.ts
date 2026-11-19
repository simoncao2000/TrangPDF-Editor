/** Width and height of a page in PDF points (1/72 inch), with the page's own rotation applied. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** Why a file could not be opened. The UI turns each kind into a message and a next step. */
export type OpenErrorKind =
  | "empty" // zero bytes
  | "too-large" // over MAX_FILE_BYTES
  | "not-pdf" // no %PDF- header (often an image saved as .pdf)
  | "password-required" // encrypted, no password given yet
  | "wrong-password"
  | "damaged" // PDFium could not parse it
  | "engine-failed" // the worker crashed or did not start
  | "unreadable"; // the platform could not read the file (moved, permission denied)

/** Largest file the editor accepts. Bigger files risk running out of WebAssembly memory. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

/** A point in PDF user space, in points. The origin is the page's bottom-left corner; y goes up. */
export interface PdfPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in PDF user space, in points: `x`, `y` is its bottom-left corner. */
export interface PdfRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
