import { describe, expect, it } from "bun:test";
import { summarizeFields, type FormField } from "./form-field";

const base: FormField = {
  id: "w",
  name: "n",
  kind: "text",
  rect: { x: 0, y: 0, width: 10, height: 10 },
  value: "",
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
};

describe("summarizeFields", () => {
  it("groups widgets by field name and tells which fields are filled", () => {
    const fields = summarizeFields([
      { ...base, id: "a", name: "full_name", value: "Minh", required: true },
      { ...base, id: "b", name: "visit", kind: "radio", exportValue: "first" },
      { ...base, id: "c", name: "visit", kind: "radio", exportValue: "returning", checked: true },
      { ...base, id: "d", name: "agree", kind: "checkbox" },
      { ...base, id: "e", name: "submit", kind: "button" },
    ]);
    expect(fields.map((field) => [field.name, field.filled, field.required])).toEqual([
      ["full_name", true, true],
      ["visit", true, false],
      ["agree", false, false],
    ]);
    expect(fields[1]!.first.id).toBe("b");
  });
});
