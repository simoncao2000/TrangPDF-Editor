import { describe, expect, it } from "bun:test";
import { corpusFile } from "./testing/fixtures";
import { inspectPdfBytes } from "./validate";

describe("inspectPdfBytes", () => {
  it("accepts a PDF", () => {
    expect(inspectPdfBytes(corpusFile("three-pages.pdf"))).toBeNull();
  });

  it("accepts a header that starts after leading junk", () => {
    const bytes = new TextEncoder().encode("garbage\n%PDF-1.4\n");
    expect(inspectPdfBytes(bytes.buffer)).toBeNull();
  });

  it("rejects an image renamed to .pdf", () => {
    expect(inspectPdfBytes(corpusFile("not-a-pdf.pdf"))).toBe("not-pdf");
  });

  it("rejects an empty file", () => {
    expect(inspectPdfBytes(new ArrayBuffer(0))).toBe("empty");
  });

  it("rejects a file over the size limit", () => {
    expect(inspectPdfBytes(corpusFile("three-pages.pdf"), 100)).toBe("too-large");
  });
});
