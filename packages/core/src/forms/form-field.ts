/**
 * Form fields as the editor sees them: one record per widget (the box on the page), with its
 * field's name, kind, value and rules. A radio group or a checkbox group shares one name.
 */
import type { PdfRect } from "@pdf-editor/shared";
import type { Rgb } from "../annotations/annotation";

export type FormFieldKind = "text" | "checkbox" | "radio" | "choice" | "signature" | "button";

export interface FormField {
  /** The widget's id (its /NM), stable while the document is open. */
  readonly id: string;
  /** The field's full name; widgets of one radio group share it. */
  readonly name: string;
  readonly kind: FormFieldKind;
  /** The widget's box, in PDF space. */
  readonly rect: PdfRect;
  /** The field's value: its text, its chosen option, or a checked box's export value ("Off" when not). */
  readonly value: string;
  /** For checkboxes and radio buttons: whether this widget is the one checked. */
  readonly checked: boolean;
  /** For checkboxes and radio buttons: the value this widget gives the field when checked. */
  readonly exportValue: string;
  /** For choices: the options, in order. */
  readonly options: readonly string[];
  readonly required: boolean;
  readonly readOnly: boolean;
  /** For text fields: lines wrap and Enter starts a new one. */
  readonly multiline: boolean;
  /** The standard PDF font name, or an empty string when the face is unknown. */
  readonly fontName: string;
  /** The default appearance's font size, in points. Zero means auto. */
  readonly fontSize: number;
  readonly textColor: Rgb;
  /** The distance in points from the widget edge to the PDFium text area. */
  readonly textInset: number;
}

/** One field (all of its widgets): what the Fields panel lists. */
export interface FieldSummary {
  readonly name: string;
  readonly kind: FormFieldKind;
  readonly required: boolean;
  readonly filled: boolean;
  /** Where to go to fill it: its first widget. */
  readonly first: FormField;
}

/**
 * Whether a field has a value: text written, an option chosen, a box checked.
 * @param widgets The field's widgets.
 * @returns True when it is filled.
 */
export function isFilled(widgets: readonly FormField[]): boolean {
  return widgets.some((widget) =>
    widget.kind === "checkbox" || widget.kind === "radio" ? widget.checked : widget.value.trim() !== "",
  );
}

/**
 * Groups widgets into fields, in the order their first widgets come.
 * @param widgets Every widget, in page order.
 * @returns One summary per field (push buttons are left out: there is nothing to fill).
 */
export function summarizeFields(widgets: readonly FormField[]): FieldSummary[] {
  const groups = new Map<string, FormField[]>();
  for (const widget of widgets) {
    if (widget.kind === "button") continue;
    groups.set(widget.name, [...(groups.get(widget.name) ?? []), widget]);
  }
  return [...groups.values()].map((group) => ({
    name: group[0]!.name,
    kind: group[0]!.kind,
    required: group.some((widget) => widget.required),
    filled: isFilled(group),
    first: group[0]!,
  }));
}
