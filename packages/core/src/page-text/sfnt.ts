/**
 * Reads a table from a single-face OpenType font.
 * @param font The font bytes.
 * @param tag The four-character table name.
 * @returns The table view, if present and in bounds.
 */
export function fontTable(font: ArrayBuffer, tag: string): DataView | undefined {
  const view = new DataView(font);
  if (view.byteLength < 12) return;
  const count = view.getUint16(4);
  for (let index = 0; index < count && 28 + index * 16 <= view.byteLength; index++) {
    const entry = 12 + index * 16;
    if (![...tag].every((char, offset) => char.charCodeAt(0) === view.getUint8(entry + offset))) continue;
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset + length <= font.byteLength) return new DataView(font, offset, length);
  }
}

/**
 * Checks whether a font's embedding permissions allow subsetting for PDF.
 * @param bytes The original font.
 * @returns Whether embedding is allowed.
 */
export function canSubsetFont(bytes: ArrayBuffer): boolean {
  const os2 = fontTable(bytes, "OS/2");
  if (!os2 || os2.byteLength < 10) return true;
  const flags = os2.getUint16(8);
  return !(flags & 0x300) && (!(flags & 2) || Boolean(flags & 12));
}

/**
 * Looks up a codepoint in a Unicode BMP cmap.
 * @param map The cmap table.
 * @param start The subtable offset.
 * @param code The Unicode codepoint.
 * @returns Whether a nonzero glyph maps to the codepoint.
 */
function inBmp(map: DataView, start: number, code: number): boolean {
  if (code > 0xffff || start + 16 > map.byteLength) return false;
  const count = map.getUint16(start + 6) / 2;
  const ends = start + 14;
  const starts = ends + count * 2 + 2;
  const deltas = starts + count * 2;
  const ranges = deltas + count * 2;
  const limit = Math.min(map.byteLength, start + map.getUint16(start + 2));
  if (ranges + count * 2 > limit) return false;
  for (let index = 0; index < count * 2; index += 2) {
    if (code > map.getUint16(ends + index)) continue;
    const first = map.getUint16(starts + index);
    if (code < first) return false;
    const delta = map.getInt16(deltas + index);
    const range = map.getUint16(ranges + index);
    if (!range) return Boolean((code + delta) & 0xffff);
    const address = ranges + index + range + (code - first) * 2;
    const glyph = address + 2 <= limit ? map.getUint16(address) : 0;
    return Boolean(glyph && (glyph + delta) & 0xffff);
  }
  return false;
}

/**
 * Looks up a codepoint in a Unicode format 12 cmap.
 * @param map The cmap table.
 * @param start The subtable offset.
 * @param code The Unicode codepoint.
 * @returns Whether the subtable provides a glyph.
 */
function inFullMap(map: DataView, start: number, code: number): boolean {
  if (start + 16 > map.byteLength) return false;
  const count = map.getUint32(start + 12);
  if (start + 16 + count * 12 > map.byteLength) return false;
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const entry = start + 16 + middle * 12;
    const first = map.getUint32(entry);
    if (code < first) high = middle;
    else if (code > map.getUint32(entry + 4)) low = middle + 1;
    else return map.getUint32(entry + 8) + code - first !== 0;
  }
  return false;
}

/**
 * Finds the first character without a glyph in the font's Unicode cmap.
 * @param bytes The original font.
 * @param text The selection or block.
 * @param exact Whether to check the input without Unicode normalization.
 * @returns The first missing character, or undefined.
 */
export function missingFontCharacter(bytes: ArrayBuffer, text: string, exact = false): string | undefined {
  const map = fontTable(bytes, "cmap");
  const characters = [...new Set(exact ? text : text.normalize("NFC"))];
  if (!map || map.byteLength < 4) return characters[0];
  const subtables: number[] = [];
  for (let index = 0; index < map.getUint16(2) && 12 + index * 8 <= map.byteLength; index++) {
    const record = 4 + index * 8;
    const platform = map.getUint16(record);
    const encoding = map.getUint16(record + 2);
    const offset = map.getUint32(record + 4);
    if (offset + 2 > map.byteLength || (platform !== 0 && (platform !== 3 || ![1, 10].includes(encoding)))) continue;
    subtables.push(offset);
  }
  return characters.find((char) => {
    const code = char.codePointAt(0)!;
    return !subtables.some((start) => {
      const format = map.getUint16(start);
      return format === 4 ? inBmp(map, start, code) : format === 12 && inFullMap(map, start, code);
    });
  });
}

export const MAX_FONT_BYTES = 20 * 1024 * 1024;

/**
 * Checks supported signatures and verifies that the complete table directory is in bounds.
 * @param bytes The untrusted font bytes.
 * @param compressed Whether WOFF2 input is allowed.
 * @returns Whether the font envelope is valid.
 */
export function validFontBytes(bytes: ArrayBuffer, compressed = false): boolean {
  if (bytes.byteLength < 12 || bytes.byteLength > MAX_FONT_BYTES) return false;
  const view = new DataView(bytes);
  const magic = view.getUint32(0);
  if (compressed && magic === 0x774f4632) {
    return (
      view.byteLength >= 48 &&
      view.getUint32(8) === view.byteLength &&
      view.getUint32(16) >= 12 &&
      view.getUint32(16) <= MAX_FONT_BYTES
    );
  }
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(magic)) return false;
  const count = view.getUint16(4);
  const directoryEnd = 12 + count * 16;
  if (!count || directoryEnd > view.byteLength) return false;
  for (let entry = 12; entry < directoryEnd; entry += 16) {
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset < directoryEnd || offset + length > view.byteLength) return false;
  }
  return true;
}

/**
 * Checks whether a local face can use the PDFium TrueType embedding path.
 * @param bytes The decoded font.
 * @returns Whether its outlines and embedding permissions are supported.
 */
export function canEmbedLocalFont(bytes: ArrayBuffer): boolean {
  return Boolean(fontTable(bytes, "glyf") && canSubsetFont(bytes));
}

/**
 * Reads a Unicode OpenType name, preferring English when supplied.
 * @param bytes The decoded font.
 * @param id The OpenType name identifier.
 * @returns The name, or undefined if absent.
 */
export function fontName(bytes: ArrayBuffer, id: number): string | undefined {
  const table = fontTable(bytes, "name");
  if (!table || table.byteLength < 6) return;
  const count = table.getUint16(2);
  const storage = table.getUint16(4);
  if (storage < 6 + count * 12 || storage > table.byteLength) return;
  let fallback: string | undefined;
  for (let entry = 6; entry < 6 + count * 12; entry += 12) {
    const platform = table.getUint16(entry);
    if ((platform !== 0 && platform !== 3) || table.getUint16(entry + 6) !== id) continue;
    const length = table.getUint16(entry + 8);
    const start = storage + table.getUint16(entry + 10);
    if (!length || length % 2 || start + length > table.byteLength) continue;
    const value = new TextDecoder("utf-16be").decode(new Uint8Array(bytes, table.byteOffset + start, length)).trim();
    if (!value) continue;
    if (platform === 3 && table.getUint16(entry + 4) === 0x0409) return value;
    fallback ??= value;
  }
  return fallback;
}
