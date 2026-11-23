import { expect, it, spyOn } from "bun:test";
import { corpusFile, pdfiumWasm } from "../testing/fixtures";
import { PdfiumEngine } from "./pdfium-engine";
import { TextMeasure } from "./pdfium-text-measure";

/**
 * Lists the handles in a loaded PDFium page in drawing order.
 * @param engine The in-process engine.
 * @param page The native page handle.
 * @returns The page's attached objects.
 */
function pageHandles(engine: PdfiumEngine, page: number): number[] {
  const pdfium = engine["pdfium"];
  return Array.from({ length: pdfium.FPDFPage_CountObjects(page) }, (_, i) => pdfium.FPDFPage_GetObject(page, i));
}

it("keeps unchanged run handles and owns only detached objects across history transitions", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  const { docId } = opened.value;
  const at = { docId, pageIndex: 0 };
  const initial = engine.getTextObjects(at);
  if (!initial.ok) throw new Error(initial.error);
  const source = initial.value[0]!;
  const base = source.runs![0]!;
  const first = { ...base, text: "Tide ", font: { kind: "standard", family: "Helvetica" } } as const;
  const second = { ...first, text: "tables", color: { r: 20, g: 40, b: 60 } };
  expect((await engine.editPageText(at, source.id, "setup", [first, second])).ok).toBe(true);

  const pdfium = engine["pdfium"];
  const page = engine["docs"].get(docId)!.held.get(0)!;
  const separator = pdfium.FPDFPageObj_CreateNewRect(0, 0, 12, 12);
  expect(pdfium.FPDFPage_InsertObjectAtIndex(page, separator, 1)).toBe(true);
  const originalOrder = pageHandles(engine, page);
  const [changedHandle, , keptHandle, otherLine] = originalOrder as [number, number, number, number];
  const prior = engine.getTextObjects(at);
  const fonts = engine.getPageFonts(at);
  if (!prior.ok || !fonts.ok) throw new Error("Could not read source runs and fonts.");
  const [change, keep] = prior.value[0]!.runs!;
  expect(change!.font).toMatchObject({ documentFontId: fonts.value[0]!.id });
  expect(keep!.font).toMatchObject({ documentFontId: fonts.value[0]!.id });

  const pdfiumFont = pdfium.FPDFTextObj_GetFont(keptHandle);
  const measure = new TextMeasure(pdfium);
  const originalMatrix = measure.matrixOf(keptHandle);
  const marker = pdfium.FPDFPageObj_AddMark(keptHandle, "PreserveMe");
  const destroy = spyOn(pdfium, "FPDFPageObj_Destroy");
  const embed = spyOn(pdfium, "FPDFText_LoadFont");

  expect((await engine.editPageText(at, source.id, "wide", [{ ...change!, text: "Low tide " }, keep!])).ok).toBe(true);
  const editedOrder = pageHandles(engine, page);
  const replacement = editedOrder[0]!;
  expect(replacement).not.toBe(changedHandle);
  expect(editedOrder).toEqual([replacement, separator, keptHandle, otherLine]);
  expect(pdfium.FPDFTextObj_GetFont(keptHandle)).toBe(pdfiumFont);
  expect(pdfium.FPDFPageObj_GetMark(keptHandle, 1)).toBe(marker);
  expect(embed).not.toHaveBeenCalled();
  const editedMatrix = measure.matrixOf(keptHandle);
  expect(editedMatrix[4]).toBeGreaterThan(originalMatrix[4]!);
  expect(editedMatrix[5]).toBe(originalMatrix[5]!);
  expect(destroy.mock.calls.flat()).not.toContain(changedHandle);

  expect(engine.togglePageTextEdit(at, "wide", false).ok).toBe(true);
  expect(pageHandles(engine, page)).toEqual(originalOrder);
  expect(measure.matrixOf(keptHandle)).toEqual(originalMatrix);
  expect(engine.togglePageTextEdit(at, "wide", true).ok).toBe(true);
  expect(pageHandles(engine, page)).toEqual(editedOrder);
  expect(measure.matrixOf(keptHandle)).toEqual(editedMatrix);

  destroy.mockClear();
  engine.dropPageTextEdit(at, "wide");
  engine.dropPageTextEdit(at, "wide");
  expect(destroy.mock.calls).toEqual([[changedHandle]]);
  expect(pageHandles(engine, page)).toEqual(editedOrder);

  const current = engine.getTextObjects(at);
  if (!current.ok) throw new Error(current.error);
  const [newFirst, newSecond] = current.value[0]!.runs!;
  expect((await engine.editPageText(at, source.id, "redo", [{ ...newFirst!, text: "Ebb " }, newSecond!])).ok).toBe(
    true,
  );
  const undoneReplacement = pageHandles(engine, page)[0]!;
  expect(engine.togglePageTextEdit(at, "redo", false).ok).toBe(true);
  destroy.mockClear();
  engine.dropPageTextEdit(at, "redo");
  expect(destroy.mock.calls).toEqual([[undoneReplacement]]);
  expect(pageHandles(engine, page)).toEqual(editedOrder);
  const reordered = await engine.editPageText(at, source.id, "reorder", [newSecond!, newFirst!]);
  expect(reordered.ok).toBe(true);
  const moved = engine.getTextObjects(at);
  if (!moved.ok) throw new Error(moved.error);
  expect(moved.value[0]!.runs?.map((run) => run.text.trim())).toEqual(["tables", "Low tide"]);
  expect(pageHandles(engine, page).indexOf(keptHandle)).toBeLessThan(pageHandles(engine, page).indexOf(replacement));
  expect(engine.togglePageTextEdit(at, "reorder", false).ok).toBe(true);
  expect(pageHandles(engine, page)).toEqual(editedOrder);
  destroy.mockClear();
  engine.dropPageTextEdit(at, "reorder");
  expect(destroy).not.toHaveBeenCalled();
  engine.close(docId);
});

it("opens and edits a line without loading any other page of a 1,000-page document", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  const { docId } = opened.value;
  const doc = engine["docs"].get(docId)!;
  const pdfium = engine["pdfium"];
  for (let index = 1; index < 1000; index++) {
    pdfium.FPDF_ClosePage(pdfium.FPDFPage_New(doc.handle, index, 400, 500));
  }
  expect(pdfium.FPDF_GetPageCount(doc.handle)).toBe(1000);
  const load = spyOn(pdfium, "FPDF_LoadPage");
  const at = { docId, pageIndex: 0 };
  const original = engine.getTextObjects(at);
  if (!original.ok) throw new Error(original.error);
  expect(engine.getPageFonts(at).ok).toBe(true);
  const line = original.value[0]!;
  const run = { ...line.runs![0]!, text: "New tide tables" };
  expect((await engine.editPageText(at, line.id, "edit-one-page", [run])).ok).toBe(true);
  expect(load.mock.calls).toEqual([[doc.handle, 0]]);
  engine.close(docId);
});

it("destroys detached edit handles once when the document closes with history held", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const opened = engine.open(corpusFile("text.pdf"));
  if (!opened.ok) throw new Error(opened.error);
  const { docId } = opened.value;
  const at = { docId, pageIndex: 0 };
  const original = engine.getTextObjects(at);
  if (!original.ok) throw new Error(original.error);
  const line = original.value[0]!;
  const detached = pageHandles(engine, engine["docs"].get(docId)!.held.get(0)!)[0]!;
  const destroy = spyOn(engine["pdfium"], "FPDFPageObj_Destroy");

  expect((await engine.editPageText(at, line.id, "held-history", [{ ...line.runs![0]!, text: "Changed" }])).ok).toBe(
    true,
  );
  expect(pageHandles(engine, engine["docs"].get(docId)!.held.get(0)!)).not.toContain(detached);
  engine.close(docId);

  expect(destroy.mock.calls.flat().filter((handle) => handle === detached)).toHaveLength(1);
});
