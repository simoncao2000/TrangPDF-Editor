import { err, ok, type Result } from "@pdf-editor/shared";

interface Entry {
  start: number;
  end: number;
  value: string;
}

/** Reads PDFium's direct dictionaries without interpreting strings as names or changing their bytes.
 * @param source Bytes represented by one code unit per byte, starting at a dictionary.
 * @returns Its top-level entries and length, or null for unsupported syntax.
 */
function dictionary(source: string) {
  if (!source.startsWith("<<")) return null;
  const entries = new Map<string, Entry>();
  const token =
    /\s*(<<|>>|\[|\]|<[^<>]*>|\((?:\\[\s\S]|[^()\\])*\)|\/[^\s()[\]<>/%#]+|\d+\s+\d+\s+R\b|[^\s()[\]<>/%#]+)/y;
  token.lastIndex = 2;
  while (true) {
    const key = token.exec(source)?.[1];
    if (key === ">>") return { entries, end: token.lastIndex };
    if (!key?.startsWith("/") || entries.has(key)) return null;
    const start = token.lastIndex - key.length;
    const valueStart = token.lastIndex;
    const ends: string[] = [];
    do {
      const item = token.exec(source)?.[1];
      if (!item) return null;
      if (item === "<<" || item === "[") ends.push(item === "<<" ? ">>" : "]");
      else if ((item === ">>" || item === "]") && ends.pop() !== item) return null;
    } while (ends.length);
    const end = token.lastIndex;
    entries.set(key, { start, end, value: source.slice(valueStart, end).trim() });
  }
}

/** Looks up a live indirect object in the final classic cross-reference table.
 * @param section Bytes from startxref to the trailer keyword.
 * @param number Object number from the trailer.
 * @param generation Generation from the trailer.
 * @param xref Offset of the table after the objects.
 * @returns Its byte range, or null for an unexpected xref.
 */
function catalogRange(section: string, number: number, generation: number, xref: number) {
  const lines = section.trimEnd().split(/\r\n|\r|\n/);
  if (lines.shift()?.trimEnd() !== "xref") return null;
  let offset: number | null = null;
  let end = xref;
  for (let i = 0; i < lines.length;) {
    const header = /^(\d+) +(\d+) *$/.exec(lines[i++]!);
    if (!header || Number(header[2]) > lines.length - i) return null;
    for (let j = 0; j < Number(header[2]); j++) {
      const row = /^(\d{10}) (\d{5}) ([fn]) *$/.exec(lines[i++]!);
      if (!row) return null;
      // PDFium writes live objects in offset order. A later live object bounds the catalog read.
      if (offset !== null && row[3] === "n" && Number(row[1]) > offset) end = Math.min(end, Number(row[1]));
      if (Number(header[1]) + j === number && Number(row[2]) === generation && row[3] === "n") offset = Number(row[1]);
    }
  }
  return offset === null || offset >= end ? null : { offset, end };
}

/** Appends a replacement catalog to a full, classic-xref PDFium save.
 * @param bytes The saved document after flattening all pages.
 * @returns Verified structural rewrite or a typed failure for unsupported input.
 */
export function stripForm(bytes: ArrayBuffer): Result<ArrayBuffer, "flatten-failed"> {
  const failed = err("flatten-failed" as const);
  const data = new Uint8Array(bytes);
  const decoder = new TextDecoder("latin1");
  const tail = decoder.decode(data.subarray(-128));
  const eof = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!eof) return failed;
  const prev = Number(eof[1]);
  const section = decoder.decode(data.subarray(prev));
  const trailerAt = section.indexOf("trailer");
  const trailer = section.slice(trailerAt + 7).trimStart();
  const parsed = dictionary(trailer);
  if (trailerAt < 0 || !parsed || trailer.slice(parsed.end).trimStart() !== eof[0]) return failed;
  const fields = parsed.entries;
  if (fields.has("/Prev") || fields.has("/XRefStm")) return failed;
  const root = fields.get("/Root")?.value;
  const ref = root?.match(/^(\d+)\s+(\d+)\s+R$/);
  const size = fields.get("/Size")?.value;
  if (!ref || !size || !/^\d+$/.test(size) || Number(size) <= Number(ref[1])) return failed;
  const range = catalogRange(section.slice(0, trailerAt), Number(ref[1]), Number(ref[2]), prev);
  if (!range) return failed;
  const { offset } = range;
  const object = decoder.decode(data.subarray(offset, range.end));
  const header = /^(\d+)\s+(\d+)\s+obj\s*/.exec(object);
  if (!header || header[1] !== ref[1] || header[2] !== ref[2]) return failed;
  const catalog = dictionary(object.slice(header[0].length));
  if (!catalog || catalog.entries.get("/Type")?.value !== "/Catalog") return failed;
  const end = header[0].length + catalog.end;
  if (!/^\s*endobj\b/.test(object.slice(end))) return failed;
  const form = catalog.entries.get("/AcroForm");
  if (!form) return ok(bytes);
  const base = offset + header[0].length;
  const catalogParts = [data.subarray(offset, base + form.start), data.subarray(base + form.end, offset + end)];
  const encode = new TextEncoder();
  const close = encode.encode("\r\nendobj\r\n");
  const at = data.length + 2;
  const xref = at + catalogParts.reduce((length, part) => length + part.length, close.length);
  const row = String(at).padStart(10, "0") + " " + ref[2]!.padStart(5, "0") + " n\r\n";
  const table = encode.encode(`xref\r\n${ref[1]} 1\r\n${row}trailer\r\n<</Prev ${prev}`);
  const trailerBase = prev + section.length - trailer.length;
  const parts = [data, encode.encode("\r\n"), ...catalogParts, close, table];
  for (const key of ["/Size", "/Root", "/Encrypt", "/ID"]) {
    const entry = fields.get(key);
    if (entry) parts.push(data.subarray(trailerBase + entry.start, trailerBase + entry.end));
  }
  parts.push(encode.encode(`>>\r\nstartxref\r\n${xref}\r\n%%EOF\r\n`));
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return ok(output.buffer);
}
