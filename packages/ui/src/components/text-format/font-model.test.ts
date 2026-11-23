import { expect, it } from "bun:test";
import { MAX_FONT_BYTES, type PageFont } from "@pdf-editor/core";
import type { FontFileRecord, FontFileStore } from "@pdf-editor/shared";
import { addFontFile } from "./font-files";
import { checkDocumentFontRows, fontSections, pageFontChoice, type FontChoice } from "./font-model";

it("uses the worker's missing character for PDF faces, even when the browser has no preview bytes", async () => {
  const style = { family: "serif", bold: true, italic: true } as const;
  const fonts = [
    pageFontChoice("doc-1", { id: "1", name: "Subset Serif", style }),
    pageFontChoice("doc-2", { id: "2", name: "Covered Serif", style }),
  ];
  const text = "Đặ";
  const documentCoverage = await checkDocumentFontRows(fonts, text, async (run) => {
    expect(run).toMatchObject({ text, bold: true, italic: true, font: { kind: "embedded", weight: 700 } });
    return run.font?.kind === "embedded" && run.font.documentFontId === "1" ? { missingCharacter: "ặ" } : {};
  });
  const [document] = fontSections(fonts, [], "", { text, italic: true, documentCoverage });
  expect(document?.rows.map(({ blocked, missing }) => ({ blocked, missing }))).toEqual([
    { blocked: false, missing: "ặ" },
    { blocked: false, missing: undefined },
  ]);
});

it("groups choices, filters by name and flags unavailable or restricted glyphs", async () => {
  const bytes = await Bun.file(new URL("../../assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const restricted = bytes.slice(0);
  const restrictedView = new DataView(restricted);
  const count = restrictedView.getUint16(4);
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    if (restrictedView.getUint32(entry) !== 0x4f532f32) continue;
    restrictedView.setUint16(restrictedView.getUint32(entry + 8) + 8, 2);
    break;
  }
  const face: PageFont = { id: "4", name: "Local Sans", style: { family: "sans", bold: false, italic: false }, bytes };
  const page: FontChoice[] = [
    { id: "doc-4", name: face.name, document: face, bundledId: "inter" },
    { id: "doc-5", name: "Restricted", document: { ...face, bytes: restricted }, bundledId: "inter" },
  ];
  const recent = [{ id: "lora", name: "Lora", bundledId: "lora" }];
  const selection = { text: "a\u0323\u0306 🐈", italic: false };
  const sections = fontSections(page, recent, "", selection);
  expect(sections.slice(0, 3).map(({ title }) => title)).toEqual(["In this PDF", "Recent", "Comes with TrangPDF"]);
  expect(sections[2]?.rows.map(({ font }) => font.name)).toEqual([
    "Inter",
    "Lora",
    "JetBrains Mono",
    "Playpen Sans",
    "Nunito",
  ]);
  expect(sections[0]?.rows[0]).toMatchObject({ blocked: false, missing: "🐈" });
  expect(sections[0]?.rows[1]).toMatchObject({ blocked: true });
  expect(fontSections(page, recent, "  LORA ", selection).map(({ rows }) => rows.length)).toEqual([0, 1, 1, 0]);
});

/** @returns An in-memory implementation of the platform font-file contract. */
function memoryFontStore(): FontFileStore {
  const records = new Map<string, FontFileRecord>();
  return {
    /** @returns The stored records. */
    async list() {
      return [...records.values()];
    },
    /** @param record The font to save. @returns Nothing. */
    async add(record) {
      records.set(record.id, record);
    },
    /** @param id The record to delete. @returns Nothing. */
    async remove(id) {
      records.delete(id);
    },
  };
}

/** @param bytes Already decoded test fixture bytes. @returns The unchanged sfnt fixture. */
async function prepared(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return bytes;
}

it("adds, lists, searches and removes a font through the storage contract", async () => {
  const store = memoryFontStore();
  const bytes = await Bun.file(new URL("../../assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const record = await addFontFile(store, new File([bytes], "my-font.ttf"), prepared);
  expect(record).toMatchObject({ name: "my-font.ttf", family: "Inter", style: "Regular" });
  expect(await store.list()).toEqual([record]);
  const sections = fontSections([], [], "int", {
    text: "a",
    italic: false,
    device: [{ name: "Other", id: "device", bundledId: "inter" }],
    files: [{ name: record.family, id: record.id, bundledId: "inter", local: { kind: "file", bytes: record.bytes } }],
  });
  expect(sections.at(-2)?.rows).toHaveLength(0);
  expect(sections.at(-1)?.rows[0]).toMatchObject({ blocked: false, font: { id: record.id } });
  await store.remove(record.id);
  expect(await store.list()).toEqual([]);
});

it("rejects bad signatures, bounds, extensions and sizes before writing", async () => {
  const store = memoryFontStore();
  const bytes = await Bun.file(new URL("../../assets/fonts/inter.ttf", import.meta.url)).arrayBuffer();
  const badDirectory = bytes.slice(0);
  new DataView(badDirectory).setUint32(20, bytes.byteLength + 1);
  const badMagic = bytes.slice(0);
  new DataView(badMagic).setUint32(0, 0);
  for (const file of [
    new File([badDirectory], "t.ttf"),
    new File([badMagic], "t.otf"),
    new File([bytes], "t.woff"),
    new File([new ArrayBuffer(MAX_FONT_BYTES + 1)], "t.ttf"),
  ]) {
    await expect(addFontFile(store, file, prepared)).rejects.toThrow();
  }
  expect(await store.list()).toEqual([]);
});
