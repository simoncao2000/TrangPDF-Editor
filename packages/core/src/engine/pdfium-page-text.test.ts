import { init } from "@embedpdf/pdfium";
import { expect, it, spyOn } from "bun:test";
import type { TextRun } from "../page-text/page-text";
import { pdfiumWasm } from "../testing/fixtures";
import { PdfiumHeap, INT_BYTES } from "./pdfium-heap";
import { PageTextObjects, TextObjectIds } from "./pdfium-page-text";
import { TextMeasure } from "./pdfium-text-measure";

it("stages text and underlines atomically and toggles both kinds of object together", async () => {
  const pdfium = await init({ wasmBinary: pdfiumWasm() });
  pdfium.PDFiumExt_Init();
  const doc = pdfium.FPDF_CreateNewDocument();
  const page = pdfium.FPDFPage_New(doc, 0, 612, 792);
  const at = { doc, page, ids: new TextObjectIds() };
  const writer = new PageTextObjects(pdfium);
  const run: TextRun = {
    text: "A ",
    fontFamily: "Courier",
    fontSize: 20,
    bold: false,
    italic: false,
    underline: true,
    color: { r: 31, g: 78, b: 121 },
  };
  const lines = [{ runs: [run, { ...run, text: "B", bold: true }] }];
  const placement = { origin: { x: 72, y: 500 }, angle: 0, fontSize: 14 };
  const ids = ["a", "a-path", "b", "b-path"];

  try {
    const drawMode = pdfium.FPDFPath_SetDrawMode.bind(pdfium);
    const failSecondUnderline = spyOn(pdfium, "FPDFPath_SetDrawMode")
      .mockImplementationOnce(drawMode)
      .mockImplementationOnce(() => false);
    const destroy = spyOn(pdfium, "FPDFPageObj_Destroy");
    expect(writer.add(at, lines, placement, ids)).toBe(false);
    expect(pdfium.FPDFPage_CountObjects(page)).toBe(0);
    expect(at.ids.handlesOf("a")).toEqual([]);
    // Two scratch objects per advance, plus the two texts and two rectangles in the failed block.
    expect(destroy).toHaveBeenCalledTimes(8);
    failSecondUnderline.mockRestore();
    destroy.mockRestore();

    expect(writer.add(at, lines, placement, ids)).toBe(true);
    expect(pdfium.FPDFPage_CountObjects(page)).toBe(4);
    const measure = new TextMeasure(pdfium);
    const second = at.ids.handlesOf("b")[0]!;
    expect(measure.matrixOf(second).slice(4)).toEqual([96, 500]);
    const path = at.ids.handlesOf("a-path")[0]!;
    expect(pdfium.FPDFPageObj_GetType(path)).toBe(2);
    const heap = new PdfiumHeap(pdfium);
    expect(writer.show(at, [], ids)).toBe(true);
    expect(heap.withBuffer(INT_BYTES, (ptr) => pdfium.FPDFPageObj_GetIsActive(path, ptr) && heap.int(ptr))).toBe(0);
    expect(writer.show(at, ids, [])).toBe(true);
    expect(heap.withBuffer(INT_BYTES, (ptr) => pdfium.FPDFPageObj_GetIsActive(path, ptr) && heap.int(ptr))).toBe(1);
  } finally {
    pdfium.FPDF_ClosePage(page);
    pdfium.FPDF_CloseDocument(doc);
  }
});
