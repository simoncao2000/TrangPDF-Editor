import { describe, expect, it } from "bun:test";
import { fieldProgress, nextRequiredField } from "./field-progress";

const fields = [
  { name: "Name", required: true, filled: false },
  { name: "Contact", required: false, filled: false },
  { name: "Visit", required: true, filled: true },
  { name: "Site", required: true, filled: false },
  { name: "Notes", required: false, filled: true },
] as const;

describe("fieldProgress", () => {
  it("counts optional fields only after they are filled", () => {
    expect(fieldProgress(fields)).toEqual({ done: 2, total: 4, remaining: 2 });
    expect(fieldProgress(fields.map((field) => ({ ...field, filled: field.required || field.filled })))).toEqual({
      done: 4,
      total: 4,
      remaining: 0,
    });
  });
});

describe("nextRequiredField", () => {
  it("starts in document order and skips filled and optional fields", () => {
    expect(nextRequiredField(fields)).toBe(fields[0]);
    expect(nextRequiredField(fields, "Name")).toBe(fields[3]);
  });

  it("wraps around and stops when everything required has an answer", () => {
    expect(nextRequiredField(fields, "Site")).toBe(fields[0]);
    expect(nextRequiredField(fields.filter((field) => !field.required || field.filled))).toBeUndefined();
  });
});
