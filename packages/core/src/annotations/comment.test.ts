import { describe, expect, it } from "bun:test";
import { fromPdfDate, toPdfDate } from "./comment";

describe("PDF dates", () => {
  it("writes a date in PDF form, in UTC", () => {
    expect(toPdfDate("2026-11-21T09:05:07.000Z")).toBe("D:20261121090507Z");
  });

  it("reads PDF dates with and without a time zone", () => {
    expect(fromPdfDate("D:20261121090507Z")).toBe("2026-11-21T09:05:07.000Z");
    expect(fromPdfDate("D:20261121160507+07'00'")).toBe("2026-11-21T09:05:07.000Z");
    expect(fromPdfDate("D:20261121040507-05'00")).toBe("2026-11-21T09:05:07.000Z");
    expect(fromPdfDate("D:2026112109")).toBe("2026-11-21T09:00:00.000Z");
  });

  it("gives null for anything that is not a PDF date", () => {
    expect(fromPdfDate("")).toBeNull();
    expect(fromPdfDate("yesterday")).toBeNull();
  });
});
