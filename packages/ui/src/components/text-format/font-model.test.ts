import { expect, it } from "bun:test";
import { type PageFont } from "@pdf-editor/core";
import { fontSections, type FontChoice } from "./font-model";

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
