/** Form field reads and writes through EngineClient, the worker host, and PDFium. */
import type { PdfRect } from "@pdf-editor/shared";
import { beforeAll, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import { corpusFile, createTestEngine, type FakeBitmap } from "../testing/fixtures";
import type { EngineClient } from "./engine-client";
import type { PageAddress } from "./protocol";

let engine: EngineClient;

beforeAll(async () => {
  engine = await createTestEngine();
});

/**
 * Opens the first page of a fixture.
 * @param fixture The PDF file name in the corpus.
 * @returns Its first page address.
 */
async function open(fixture: string): Promise<PageAddress> {
  const opened = await engine.call("open", { source: { bytes: corpusFile(fixture) } }).promise;
  return { docId: opened.docId, pageIndex: 0 };
}

const defaultState = {
  checked: false,
  exportValue: "",
  options: [],
  required: false,
  readOnly: false,
  multiline: false,
  fontName: "Helvetica",
  fontSize: 12,
  textColor: { r: 0, g: 0, b: 0 },
  textInset: 1,
} as const;

const widgets = [
  {
    ...defaultState,
    name: "full_name",
    kind: "text",
    value: "",
    required: true,
    rect: { x: 72, y: 690, width: 300, height: 22 },
  },
  { ...defaultState, name: "contact", kind: "checkbox", value: "Off", exportValue: "Yes" },
  { ...defaultState, name: "visit", kind: "radio", value: "first", exportValue: "first", checked: true },
  { ...defaultState, name: "visit", kind: "radio", value: "first", exportValue: "returning" },
  {
    ...defaultState,
    id: "site-widget",
    name: "site",
    kind: "choice",
    value: "Headland",
    options: ["Headland", "Harbour", "Dunes"],
  },
  {
    ...defaultState,
    id: "alternate-site-widget",
    name: "alternate_site",
    kind: "choice",
    value: "",
    options: ["Headland", "Harbour", "Dunes"],
  },
] as const;

const filledWidgets = [
  { ...widgets[0], value: "Minh N." },
  { ...widgets[1], value: "Yes", checked: true },
  { ...widgets[2], value: "returning", checked: false },
  { ...widgets[3], value: "returning", checked: true },
  { ...widgets[4], value: "Dunes" },
  widgets[5],
] as const;

/**
 * Fills the fixture's text, checkbox, radio group, and choice.
 * @param at The fixture's first page.
 * @returns The checkbox id for clearing it later.
 */
async function fill(at: PageAddress): Promise<string> {
  const [name, contact, , returning, site] = await engine.call("getFormFields", at).promise;
  if (!name || !contact || !returning || !site) throw new Error("The form fixture is missing widgets.");
  const edits = [
    { id: name.id, value: filledWidgets[0].value },
    { id: contact.id, value: contact.exportValue },
    { id: returning.id, value: returning.exportValue },
    { id: site.id, value: filledWidgets[4].value },
  ];
  for (const edit of edits) {
    expect(await engine.call("setFormField", { ...at, ...edit }).promise).toBeNull();
  }
  return contact.id;
}

/**
 * Assembles the edited page and opens the resulting PDF.
 * @param at The page to export.
 * @param flatten Whether to flatten widgets into page content.
 * @returns The exported page address.
 */
async function reopen(at: PageAddress, flatten: boolean): Promise<PageAddress> {
  const { bytes } = await engine.call("assemble", { parts: [{ ...at, rotation: 0 }], flatten }).promise;
  const { docId } = await engine.call("open", { source: { bytes } }).promise;
  return { docId, pageIndex: 0 };
}

/**
 * Counts dark pixels inside a widget at one pixel per PDF point.
 * @param at The fixture's first page.
 * @param rect The widget's PDF rectangle.
 * @returns The number of dark pixels inside the widget.
 */
async function countDarkWidgetPixels(at: PageAddress, rect: PdfRect): Promise<number> {
  const width = 612;
  const height = 792;
  const { bitmap } = await engine.call("renderPage", { ...at, width, height }).promise;
  const { pixels } = bitmap as unknown as FakeBitmap;
  const top = height - rect.y - rect.height;
  const darkThreshold = 128;
  const channels = 4;
  let count = 0;
  for (let y = top; y < top + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const offset = (y * width + x) * channels;
      if (Math.max(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!) < darkThreshold) count++;
    }
  }
  bitmap.close();
  return count;
}

it("skips untyped widgets, preserves page order, and keeps IDs across reads", async () => {
  const at = await open("form.pdf");
  try {
    const fields = await engine.call("getFormFields", at).promise;
    expect(fields).toHaveLength(widgets.length);
    expect(fields).toMatchObject(widgets);
    expect(fields.every(({ id }) => id.length > 0)).toBe(true);
    expect(new Set(fields.map(({ id }) => id)).size).toBe(widgets.length);
    expect(await engine.call("getFormFields", at).promise).toEqual(fields);
    expect(await engine.call("getAnnotations", at).promise).toEqual([]);
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});

it("can open, read a held page, and close the same form twice", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const at = await open("form.pdf");
    try {
      await engine.call("getTextObjects", at).promise;
      const fields = await engine.call("getFormFields", at).promise;
      expect(fields).toMatchObject(widgets);
      expect(await engine.call("getFormFields", at).promise).toEqual(fields);
    } finally {
      await engine.call("close", { docId: at.docId }).promise;
    }
  }
});

it("returns no fields for a document without a form and reports a closed document", async () => {
  const at = await open("text.pdf");
  try {
    expect(await engine.call("getFormFields", at).promise).toEqual([]);
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
  await expect(engine.call("getFormFields", at).promise).rejects.toMatchObject({
    detail: { code: "unknown-document" },
  });
});

it("reads a standard face, automatic size, and non-black colour from the form appearance", async () => {
  const pdf = corpusFile("form.pdf");
  const bytes = Buffer.from(pdf);
  // Keep the PDF objects at the offsets in its xref table.
  bytes.write("/Cour 00 Tf 1 g", bytes.indexOf("/Helv 12 Tf 0 g"));
  bytes.write("/Cour", bytes.indexOf("/Helv 11 0 R"));
  bytes.write("/Courier  ", bytes.indexOf("/Helvetica"));
  const { docId } = await engine.call("open", { source: { bytes: pdf } }).promise;
  try {
    const [text] = await engine.call("getFormFields", { docId, pageIndex: 0 }).promise;
    expect(text).toMatchObject({ fontName: "Courier", fontSize: 0, textColor: { r: 255, g: 255, b: 255 } });
  } finally {
    await engine.call("close", { docId }).promise;
  }
});

it("sets text, checkbox, radio, and choice values and clears the checkbox", async () => {
  const at = await open("form.pdf");
  try {
    const contactId = await fill(at);
    expect(await engine.call("getFormFields", at).promise).toMatchObject(filledWidgets);
    await engine.call("setFormField", { ...at, id: contactId, value: "Off" }).promise;
    const fields = await engine.call("getFormFields", at).promise;
    expect(fields.find(({ id }) => id === contactId)).toMatchObject({ value: "Off", checked: false });
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});

it("rejects an unknown widget id", async () => {
  const at = await open("form.pdf");
  try {
    await expect(
      engine.call("setFormField", { ...at, id: "missing-widget", value: "Minh N." }).promise,
    ).rejects.toMatchObject({ detail: { code: "unknown-annotation" } });
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});

it("clears a choice before and after it has a selection", async () => {
  const at = await open("form.pdf");
  const id = widgets[5].id;
  try {
    const initial = await engine.call("getFormFields", at).promise;
    const choice = initial.find((field) => field.id === id)!;
    expect(choice.value).toBe("");

    const { x, y, width, height } = choice.rect;
    // Exclude the widget border and dropdown arrow from the label count.
    const labelRect = { x: x + 2, y: y + 2, width: width - 24, height: height - 4 };
    const emptyPixels = await countDarkWidgetPixels(at, labelRect);
    for (const value of ["", "Dunes", ""]) {
      expect(await engine.call("setFormField", { ...at, id, value }).promise).toBeNull();
      const fields = await engine.call("getFormFields", at).promise;
      expect(fields.find((field) => field.id === id)?.value).toBe(value);
      const pixels = await countDarkWidgetPixels(at, labelRect);
      if (value) expect(pixels).toBeGreaterThan(emptyPixels);
      else expect(pixels).toBe(emptyPixels);
    }

    const saved = await reopen(at, false);
    try {
      const fields = await engine.call("getFormFields", saved).promise;
      expect(fields.find((field) => field.id === id)?.value).toBe("");
      expect(await countDarkWidgetPixels(saved, labelRect)).toBe(emptyPixels);
    } finally {
      await engine.call("close", { docId: saved.docId }).promise;
    }
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});

it("rejects writing a read-only text widget and preserves its value", async () => {
  const bytes = corpusFile("form.pdf");
  const pdf = Buffer.from(bytes);
  const flags = pdf.indexOf("/Ff 2 /V ()");
  expect(flags).toBeGreaterThanOrEqual(0);
  pdf.write("/Ff 3 /V ()", flags);
  const { docId } = await engine.call("open", { source: { bytes } }).promise;
  const at = { docId, pageIndex: 0 };
  try {
    const [name] = await engine.call("getFormFields", at).promise;
    expect(name).toMatchObject({ name: "full_name", readOnly: true, value: "" });
    await expect(
      engine.call("setFormField", { ...at, id: name!.id, value: filledWidgets[0].value }).promise,
    ).rejects.toMatchObject({ detail: { code: "form-field-write-failed" } });
    const [after] = await engine.call("getFormFields", at).promise;
    expect(after).toEqual(name);
  } finally {
    await engine.call("close", { docId }).promise;
  }
});

it("keeps edited form values after assembly and reopening", async () => {
  const at = await open("form.pdf");
  try {
    await fill(at);
    const saved = await reopen(at, false);
    try {
      expect(await engine.call("getFormFields", saved).promise).toMatchObject(filledWidgets);
    } finally {
      await engine.call("close", { docId: saved.docId }).promise;
    }
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});

it("renders the filled name and flattens the text and choice as searchable page text", async () => {
  const at = await open("form.pdf");
  try {
    const before = await countDarkWidgetPixels(at, widgets[0].rect);
    await fill(at);
    expect(await countDarkWidgetPixels(at, widgets[0].rect)).toBeGreaterThan(before);
    const saved = await reopen(at, true);
    try {
      expect(await engine.call("getFormFields", saved).promise).toEqual([]);
      for (const query of [filledWidgets[0].value, filledWidgets[4].value]) {
        const params = { docId: saved.docId, pageIndexes: [saved.pageIndex], query, limit: 5 };
        expect(await engine.call("findText", params).promise).toHaveLength(1);
      }
    } finally {
      await engine.call("close", { docId: saved.docId }).promise;
    }
  } finally {
    await engine.call("close", { docId: at.docId }).promise;
  }
});
