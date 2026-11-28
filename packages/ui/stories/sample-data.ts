import type { Annotation, FormField, PageTextObject } from "@pdf-editor/core";

/** @param value Opacity from zero to 100. @returns The formatted percent. */
export function percent(value: number): string {
  return `${value}%`;
}

/** @returns The text of the zoom menu trigger. */
export function menuLabel(): string {
  return "Zoom";
}

export const signature = { kind: "typed", id: "sample", text: "Linh Nguyen", style: "flowing", ink: "blue" } as const;
export const positions = [{ id: "end", label: "At the end", detail: "After page 1", index: 1 }];
export const color = { r: 41, g: 77, b: 119 };
export const toolStyle = { color, opacity: 0.8, lineWidth: 2, fontSize: 14 };
export const rect = { x: 72, y: 690, width: 200, height: 24 };
export const textStyle = {
  color,
  fontSize: 14,
  fontFamily: "Helvetica",
  bold: false,
  italic: false,
  underline: false,
} as const;
export const body = [
  { text: "Please check the totals.", bold: true, italic: false, underline: false, ink: "blue" },
] as const;
export const mark = {
  id: "sample-mark",
  kind: "highlight",
  rect,
  lines: [rect],
  opacity: 0.65,
  color: { r: 244, g: 217, b: 126 },
  comment: { body, author: "Linh", modified: null },
} satisfies Annotation;
export const box = {
  id: "sample-box",
  kind: "textBox",
  rect,
  color,
  opacity: 1,
  text: "A sample text box",
  fontSize: 14,
} as const;
export const textObject = {
  id: "sample-text",
  text: "Tide tables for the headland",
  bounds: rect,
  color,
  fontSize: 16,
  style: { family: "sans", bold: false, italic: false },
} satisfies PageTextObject;
export const field = {
  id: "sample-field",
  name: "Name",
  kind: "text",
  rect,
  value: "Linh",
  checked: false,
  exportValue: "Yes",
  options: [],
  required: true,
  readOnly: false,
  multiline: false,
  fontName: "Helvetica",
  fontSize: 14,
  textColor: color,
  textInset: 2,
} satisfies FormField;
