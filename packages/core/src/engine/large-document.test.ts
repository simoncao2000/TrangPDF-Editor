import { expect, it, spyOn } from "bun:test";
import { corpusFile, pdfiumWasm } from "../testing/fixtures";
import { PdfiumEngine } from "./pdfium-engine";

it("renders page one with exact indexed geometry and releases every scanned page", async () => {
  const engine = await PdfiumEngine.create(pdfiumWasm());
  const pdfium = engine["pdfium"];
  const load = spyOn(pdfium, "FPDF_LoadPage");
  const close = spyOn(pdfium, "FPDF_ClosePage");
  try {
    for (const scanLength of [1000, 8]) {
      const opened = engine.open(corpusFile("large-1000-pages.pdf"));
      if (!opened.ok) throw new Error(opened.error);
      const { docId, pages } = opened.value;
      try {
        expect(pages).toHaveLength(1000);
        expect(load).not.toHaveBeenCalled();
        expect(engine.renderPage({ docId, pageIndex: 0 }, { width: 816, height: 1056 }).ok).toBe(true);
        for (let pageIndex = 0; pageIndex < scanLength; pageIndex++) {
          expect(engine.getFormFields({ docId, pageIndex }).ok).toBe(true);
          expect(engine.getAnnotations({ docId, pageIndex }).ok).toBe(true);
          expect(close.mock.calls.length).toBe(load.mock.calls.length);
        }
      } finally {
        engine.close(docId);
      }
      expect(load).toHaveBeenCalled();
      expect(close.mock.calls.length).toBe(load.mock.calls.length);
      load.mockClear();
      close.mockClear();
    }
  } finally {
    load.mockRestore();
    close.mockRestore();
  }
});
