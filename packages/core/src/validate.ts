import { MAX_FILE_BYTES, type OpenErrorKind } from "@pdf-editor/shared";

/** "%PDF-" in ASCII. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
/** The PDF spec lets the header start anywhere in the first 1024 bytes. */
const HEADER_SEARCH_WINDOW = 1024;

/**
 * Cheap checks before a file is sent to the engine.
 * @param bytes The file.
 * @param maxBytes Size limit.
 * @returns Why the file is rejected, or `null` if it looks like a PDF.
 */
export function inspectPdfBytes(bytes: ArrayBuffer, maxBytes: number = MAX_FILE_BYTES): OpenErrorKind | null {
  if (bytes.byteLength === 0) return "empty";
  if (bytes.byteLength > maxBytes) return "too-large";
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, HEADER_SEARCH_WINDOW));
  for (let start = 0; start <= head.length - PDF_SIGNATURE.length; start++) {
    if (PDF_SIGNATURE.every((byte, offset) => head[start + offset] === byte)) return null;
  }
  return "not-pdf";
}
