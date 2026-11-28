import { fontName, MAX_FONT_BYTES, validFontBytes } from "@pdf-editor/core";
import type { FontFileRecord, FontFileStore } from "@pdf-editor/shared";

/**
 * Reads and validates an explicitly selected font before saving its decoded form.
 * @param store The local font store.
 * @param file The selected font file.
 * @param prepare The engine's validation and decoding operation.
 * @returns The stored record.
 */
export async function addFontFile(
  store: FontFileStore,
  file: File,
  prepare: (bytes: ArrayBuffer) => Promise<ArrayBuffer>,
): Promise<FontFileRecord> {
  if (!/\.(ttf|otf|woff2)$/i.test(file.name) || file.size > MAX_FONT_BYTES) {
    throw new Error("Choose a .ttf, .otf or .woff2 font file up to 20 MB.");
  }
  const input = await file.arrayBuffer();
  if (!validFontBytes(input, true)) throw new Error("Choose a valid font file up to 20 MB.");
  const bytes = await prepare(input);
  if (!validFontBytes(bytes)) throw new Error("This font file is invalid.");
  const record = {
    id: `file-${crypto.randomUUID()}`,
    name: file.name,
    family: fontName(bytes, 16) ?? fontName(bytes, 1) ?? file.name.replace(/\.[^.]+$/, ""),
    style: fontName(bytes, 17) ?? fontName(bytes, 2) ?? "Regular",
    bytes,
  };
  await store.add(record);
  return record;
}
