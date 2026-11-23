import { expect, it, spyOn } from "bun:test";
import { canEmbedLocalFont, fontTable, missingFontCharacter, validFontBytes } from "../page-text/sfnt";
import { corpusFile, pdfiumWasm } from "../testing/fixtures";
import { FontSubsetCache, prepareFont, subsetEngine, subsetFont } from "./font-subset";
import { PdfiumEngine } from "./pdfium-engine";

const inter = new URL("../../../ui/src/assets/fonts/inter.ttf", import.meta.url);

/** @returns Source bytes for the licensed Inter fixture. */
async function interBytes(): Promise<ArrayBuffer> {
  return Bun.file(inter).arrayBuffer();
}

it.each([400, 700] as const)("subsets Inter and instantiates weight %i", async (weight) => {
  const source = await interBytes();
  const sample = "Tạ";
  const subset = await subsetFont(source, sample.normalize("NFD"), weight);
  expect(missingFontCharacter(subset, sample + " ")).toBeUndefined();
  expect(missingFontCharacter(subset, "Z")).toBe("Z");
  expect(fontTable(subset, "OS/2")?.getUint16(4)).toBe(weight);
  for (const tag of ["fvar", "gvar", "HVAR", "MVAR", "avar"]) expect(fontTable(subset, tag)).toBeUndefined();
  for (const tag of ["cmap", "name", "OS/2", "hmtx", "glyf", "loca"]) expect(fontTable(subset, tag)).toBeDefined();
  expect(subset.byteLength).toBeLessThan(source.byteLength / 10);
});

it("produces different glyph outlines for regular and bold instances", async () => {
  const source = await interBytes();
  const sample = "Tạ";
  const regular = await subsetFont(source, sample.normalize("NFD"), 400);
  const bold = await subsetFont(source, sample.normalize("NFD"), 700);
  const regularGlyf = fontTable(regular, "glyf");
  const boldGlyf = fontTable(bold, "glyf");
  expect(regularGlyf).toBeDefined();
  expect(boldGlyf).toBeDefined();
  expect(new Uint8Array(regularGlyf!.buffer, regularGlyf!.byteOffset, regularGlyf!.byteLength)).not.toEqual(
    new Uint8Array(boldGlyf!.buffer, boldGlyf!.byteOffset, boldGlyf!.byteLength),
  );
});

it.each([0x0002, 0x0100])("rejects restricted embedding flags %i in the worker", async (fsType) => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  const { docId } = opened.value;
  const bytes = await interBytes();
  const os2 = fontTable(bytes, "OS/2");
  if (!os2) throw new Error("Inter fixture has no OS/2 table.");
  os2.setUint16(8, fsType);
  expect(engine.registerTextFont(docId, "inter", bytes).ok).toBe(true);
  try {
    const result = await engine.addPageText(
      { docId, pageIndex: 0 },
      [
        {
          runs: [
            {
              text: "Tạ",
              font: { kind: "embedded", fontId: "inter", name: "Inter", weight: 400, italic: false },
              bold: false,
              italic: false,
              underline: false,
              fontSize: 16,
              color: { r: 0, g: 0, b: 0 },
            },
          ],
        },
      ],
      { origin: { x: 80, y: 400 }, angle: 0, fontSize: 16 },
      ["restricted-font"],
    );
    expect(result).toEqual({ ok: false, error: "text-edit-failed" });
  } finally {
    engine.close(docId);
  }
});

it("frees the subset and PDFium resources when creating the text object fails", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  const { docId } = opened.value;
  const bytes = await interBytes();
  expect(engine.registerTextFont(docId, "inter", bytes).ok).toBe(true);
  const hb = await subsetEngine();
  const malloc = spyOn(hb, "malloc");
  const hbFree = spyOn(hb, "free");
  const destroyBlob = spyOn(hb, "hb_blob_destroy");
  const destroyFace = spyOn(hb, "hb_face_destroy");
  const destroyInput = spyOn(hb, "hb_subset_input_destroy");
  const pdfium = engine["pdfium"];
  const load = spyOn(pdfium, "FPDFText_LoadFont");
  const free = spyOn(pdfium.pdfium.wasmExports, "free");
  const closeFont = spyOn(pdfium, "FPDFFont_Close");
  const create = spyOn(pdfium, "FPDFPageObj_CreateTextObj").mockReturnValueOnce(0);
  try {
    const result = await engine.addPageText(
      { docId, pageIndex: 0 },
      [
        {
          runs: [
            {
              text: "Tạ",
              font: { kind: "embedded", fontId: "inter", name: "Inter", weight: 400, italic: false },
              bold: false,
              italic: false,
              underline: false,
              fontSize: 16,
              color: { r: 0, g: 0, b: 0 },
            },
          ],
        },
      ],
      { origin: { x: 80, y: 400 }, angle: 0, fontSize: 16 },
      ["failed-run"],
    );
    expect(result.ok).toBe(false);
    expect(hbFree).toHaveBeenCalledWith(malloc.mock.results[0]?.value);
    expect(destroyBlob).toHaveBeenCalledTimes(2);
    expect(destroyFace).toHaveBeenCalledTimes(2);
    expect(destroyInput).toHaveBeenCalledTimes(1);
    expect(free).toHaveBeenCalledWith(load.mock.calls[0]?.[1]);
    expect(closeFont).toHaveBeenCalledWith(load.mock.results[0]?.value);
    expect(engine["documentFonts"].get(docId)?.has("inter")).toBe(true);
  } finally {
    for (const spy of [malloc, hbFree, destroyBlob, destroyFace, destroyInput, load, free, closeFont, create]) {
      spy.mockRestore();
    }
    engine.close(docId);
  }
  expect(engine["documentFonts"].size).toBe(0);
  expect(engine["fontBytes"].size).toBe(0);
});

it("preserves a shared worker font until the last registered document closes", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const first = engine.open(corpusFile("text.pdf"));
  const next = engine.open(corpusFile("text.pdf"));
  if (!first.ok || !next.ok) throw new Error("Could not open the test documents.");
  const bytes = await interBytes();
  expect(engine.registerTextFont(first.value.docId, "inter", bytes).ok).toBe(true);
  expect(engine.registerTextFont(next.value.docId, "inter").ok).toBe(true);
  expect(engine["fontBytes"].size).toBe(1);
  engine.close(first.value.docId);
  expect(engine["fontBytes"].size).toBe(1);
  engine.close(next.value.docId);
  expect(engine["fontBytes"].size).toBe(0);
  expect(engine["documentFonts"].size).toBe(0);
});

it("decodes WOFF2 into a validated TrueType font before subsetting", async () => {
  const { default: compress } = await import("wawoff2/compress.js");
  const small = await subsetFont(await interBytes(), "Tặ", 400);
  const compressed = Uint8Array.from(await compress(new Uint8Array(small))).buffer;
  expect(new DataView(compressed).getUint32(0)).toBe(0x774f4632);
  const decoded = await prepareFont(compressed);
  expect(new DataView(decoded).getUint32(0)).toBe(0x00010000);
  expect(validFontBytes(decoded)).toBe(true);
  expect(missingFontCharacter(await subsetFont(decoded, "ặ", 400), "ặ")).toBeUndefined();

  const damaged = compressed.slice(0);
  new Uint8Array(damaged).fill(0xff, 48);
  await expect(prepareFont(damaged)).rejects.toThrow("could not be decoded");

  new DataView(compressed).setUint32(16, 21 * 1024 * 1024);
  await expect(prepareFont(compressed)).rejects.toThrow("20 MB");
});

it("flags OpenType CFF outlines as unavailable for PDF embedding", async () => {
  // The directory is sufficient to exercise the outline check without a separate CFF asset.
  const bytes = new ArrayBuffer(32);
  const view = new DataView(bytes);
  view.setUint32(0, 0x4f54544f);
  view.setUint16(4, 1);
  view.setUint32(12, 0x43464620);
  view.setUint32(20, 28);
  view.setUint32(24, 4);
  expect(await prepareFont(bytes)).toBe(bytes);
  expect(canEmbedLocalFont(bytes)).toBe(false);
  await expect(subsetFont(bytes, "a", 400)).rejects.toThrow("cannot be embedded");
});

it("registers a sloppy-directory TrueType subset extracted from a corpus PDF", async () => {
  const bytes = new ArrayBuffer(32);
  const view = new DataView(bytes);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(12, 0x676c7966);
  view.setUint32(20, 28);
  view.setUint32(24, 4);
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  try {
    expect(engine.registerTextFont(opened.value.docId, "corpus-subset", bytes).ok).toBe(true);
  } finally {
    engine.close(opened.value.docId);
  }
});

it("reuses subsets for the same font, NFC character set and pinned weight", async () => {
  const cache = new FontSubsetCache();
  const bytes = await interBytes();
  const first = cache.get("inter", bytes, "bặ", 400);
  expect(cache.get("inter", bytes, "ặbb".normalize("NFD"), 400)).toBe(first);
  expect(cache.get("inter", bytes, "bặ", 700)).not.toBe(first);
  expect(cache.get("other", bytes, "bặ", 400)).not.toBe(first);
  expect(missingFontCharacter(await first, "ặb")).toBeUndefined();
  cache.remove(bytes);
  expect(cache.get("inter", bytes, "bặ", 400)).not.toBe(first);
});
