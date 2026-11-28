/** PDFium form environments and widget access. */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { err, ok, type Result } from "@pdf-editor/shared";
import type { FormField, FormFieldKind } from "../forms/form-field";
import { AnnotationStrings } from "./pdfium-comments";
import { FLOAT_BYTES, INT_BYTES, PdfiumHeap, RECT_BYTES } from "./pdfium-heap";

const FORMTYPE_NONE = 0;
const SUBTYPE_WIDGET = 20;
const NAME_KEY = "NM";
const FLAG_READ_ONLY = 1;
const FLAG_REQUIRED = 2;
const FLAG_MULTILINE = 4096;
const BEVELED_BORDER = 3;
const INSET_BORDER = 4;

// FPDF_STANDARD_FONT order from EPDFAnnot_GetDefaultAppearance.
const STANDARD_FONTS = [
  "Courier",
  "Courier-Bold",
  "Courier-BoldOblique",
  "Courier-Oblique",
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-BoldOblique",
  "Helvetica-Oblique",
  "Times-Roman",
  "Times-Bold",
  "Times-BoldItalic",
  "Times-Italic",
  "Symbol",
  "ZapfDingbats",
] as const;

/** FPDF_FORMFIELD_* codes. */
const FIELD_KINDS: Partial<Record<number, FormFieldKind>> = {
  1: "button",
  2: "checkbox",
  3: "radio",
  4: "choice",
  5: "choice",
  6: "text",
  7: "signature",
};

export interface FormEnvironment {
  readonly handle: number;
  readonly info: number;
  readonly hasForm: boolean;
  /** Loaded pages registered with this form environment. */
  readonly pages: Set<number>;
}

export type FormFieldWriteError = "unknown-annotation" | "form-field-write-failed" | "engine-failed";

/** Form widget viewport, matching the page bitmap render. */
interface FormViewport {
  readonly bitmap: number;
  readonly width: number;
  readonly height: number;
  readonly quarterTurns: number;
  readonly flags: number;
}

export class PdfiumForms {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;
  private readonly strings: AnnotationStrings;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
    this.strings = new AnnotationStrings(pdfium);
  }

  /**
   * Initialises form support for an open document.
   * @param doc The document handle.
   * @returns Its form environment, or null if initialisation failed.
   */
  open(doc: number): FormEnvironment | null {
    const info = this.pdfium.PDFiumExt_OpenFormFillInfo();
    if (!info) return null;
    const handle = this.pdfium.PDFiumExt_InitFormFillEnvironment(doc, info);
    if (handle) {
      return { handle, info, hasForm: this.pdfium.FPDF_GetFormType(doc) !== FORMTYPE_NONE, pages: new Set() };
    }
    this.pdfium.PDFiumExt_CloseFormFillInfo(info);
    return null;
  }

  /**
   * Releases the environment after its pages have closed.
   * @param form The document's form environment.
   * @returns Nothing.
   */
  close(form: FormEnvironment): void {
    this.pdfium.PDFiumExt_ExitFormFillEnvironment(form.handle);
    this.pdfium.PDFiumExt_CloseFormFillInfo(form.info);
  }

  /**
   * Unregisters a page immediately before the engine closes it.
   * @param page The loaded page handle.
   * @param form The document's form environment.
   * @returns Nothing.
   */
  beforeClosePage(page: number, form: FormEnvironment): void {
    if (form.pages.delete(page)) this.pdfium.FORM_OnBeforeClosePage(page, form.handle);
  }

  /**
   * Draws the form widgets onto the rendered page.
   * @param page The loaded page handle.
   * @param form The document's form environment.
   * @param view The bitmap and its page viewport.
   */
  draw(page: number, form: FormEnvironment, view: FormViewport): void {
    if (!form.hasForm) return;
    this.registerPage(page, form);
    const { bitmap, width, height, quarterTurns, flags } = view;
    this.pdfium.FPDF_FFLDraw(form.handle, bitmap, page, 0, 0, width, height, quarterTurns, flags);
  }

  /**
   * Lists the widgets in page annotation order.
   * @param page The loaded page handle.
   * @param form The document's form environment.
   * @returns The fields, or an error if a widget could not be read.
   */
  list(page: number, form: FormEnvironment): Result<FormField[], "engine-failed"> {
    if (!form.hasForm) return ok([]);
    this.registerPage(page, form);
    const fields: FormField[] = [];
    const count = this.pdfium.FPDFPage_GetAnnotCount(page);
    for (let index = 0; index < count; index++) {
      const widget = this.readAnnotation(page, index, form.handle);
      if (!widget.ok) return widget;
      if (widget.value) fields.push(widget.value);
    }
    return ok(fields);
  }

  /**
   * Sets the field value through the widget with the given /NM.
   * @param page The loaded page handle.
   * @param form The document's form environment.
   * @param id The widget's /NM.
   * @param value The text, toggle export value or Off, or choice option.
   * @returns Null on success, or an error if the widget is missing or the write fails.
   */
  setValue(page: number, form: FormEnvironment, id: string, value: string): Result<null, FormFieldWriteError> {
    if (!form.hasForm || !id) return err("unknown-annotation");
    this.registerPage(page, form);
    const count = this.pdfium.FPDFPage_GetAnnotCount(page);
    for (let index = 0; index < count; index++) {
      const annot = this.pdfium.FPDFPage_GetAnnot(page, index);
      if (!annot) return err("engine-failed");
      try {
        if (this.pdfium.FPDFAnnot_GetSubtype(annot) !== SUBTYPE_WIDGET || this.strings.get(annot, NAME_KEY) !== id)
          continue;
        return this.writeWidget(page, form.handle, annot, value) ? ok(null) : err("form-field-write-failed");
      } finally {
        this.pdfium.FPDFPage_CloseAnnot(annot);
      }
    }
    return err("unknown-annotation");
  }

  /** Dispatches a writable widget to the appropriate PDFium form operation. */
  private writeWidget(page: number, form: number, annot: number, value: string): boolean {
    if (this.pdfium.FPDFAnnot_GetFormFieldFlags(form, annot) & FLAG_READ_ONLY) return false;
    switch (FIELD_KINDS[this.pdfium.FPDFAnnot_GetFormFieldType(form, annot)]) {
      case "text":
        return this.writeText(page, form, annot, value);
      case "choice":
        return this.writeChoice(page, form, annot, value);
      case "checkbox":
      case "radio":
        return this.writeToggle(form, annot, value);
      default:
        return false;
    }
  }

  /** Replaces the entire text and checks the value committed by PDFium. */
  private writeText(page: number, form: number, annot: number, value: string): boolean {
    const edited = this.withFocus(form, annot, () => {
      if (!this.pdfium.FORM_SelectAllText(form, page)) return false;
      this.heap.withWideString(value, (ptr) => this.pdfium.FORM_ReplaceSelection(form, page, ptr));
      return true;
    });
    return edited && this.readValue(form, annot) === value;
  }

  /**
   * Selects an option by label, or clears the value and refreshes the widget appearance.
   * @param page The loaded page handle.
   * @param form The document's form handle.
   * @param annot The choice widget handle.
   * @param value The option label, or an empty string to clear the selection.
   * @returns Whether PDFium committed the change.
   */
  private writeChoice(page: number, form: number, annot: number, value: string): boolean {
    if (value === "") {
      const cleared = this.heap.withWideString(value, (ptr) =>
        this.pdfium.EPDFAnnot_SetFormFieldValue(form, annot, ptr),
      );
      return cleared && this.readValue(form, annot) === "" && this.pdfium.EPDFAnnot_GenerateFormFieldAP(annot);
    }
    const index = this.readOptions(annot, form)?.indexOf(value) ?? -1;
    if (index < 0) return false;
    const edited = this.withFocus(form, annot, () => this.pdfium.FORM_SetIndexSelected(form, page, index, true));
    return edited && this.pdfium.FPDFAnnot_IsOptionSelected(form, annot, index);
  }

  /** Updates a checkbox or radio group using its existing on and off appearances. */
  private writeToggle(form: number, annot: number, value: string): boolean {
    return this.heap.withWideString(value, (ptr) => this.pdfium.EPDFAnnot_SetFormFieldValue(form, annot, ptr));
  }

  /** Focuses a widget and releases focus to commit the change and rebuild its appearance. */
  private withFocus(form: number, annot: number, edit: () => boolean): boolean {
    if (!this.pdfium.FORM_SetFocusedAnnot(form, annot)) return false;
    let committed: boolean;
    let edited: boolean;
    try {
      edited = edit();
    } finally {
      committed = this.pdfium.FORM_ForceToKillFocus(form);
    }
    return edited && committed;
  }

  /**
   * Registers a loaded page for form operations once per page handle.
   * @param page The loaded page handle.
   * @param form The document's form environment.
   * @returns Nothing.
   */
  private registerPage(page: number, form: FormEnvironment): void {
    if (form.pages.has(page)) return;
    this.pdfium.FORM_OnAfterLoadPage(page, form.handle);
    form.pages.add(page);
  }

  /**
   * Reads a widget and releases the temporary annotation handle.
   * @param page The loaded page handle.
   * @param index The page annotation index.
   * @param form The form handle.
   * @returns The field, null for non-widgets or unsupported widget types, or a read error.
   */
  private readAnnotation(page: number, index: number, form: number): Result<FormField | null, "engine-failed"> {
    const annot = this.pdfium.FPDFPage_GetAnnot(page, index);
    if (!annot) return err("engine-failed");
    try {
      if (this.pdfium.FPDFAnnot_GetSubtype(annot) !== SUBTYPE_WIDGET) return ok(null);
      const kind = FIELD_KINDS[this.pdfium.FPDFAnnot_GetFormFieldType(form, annot)];
      return kind ? this.readWidget(annot, form, kind) : ok(null);
    } finally {
      this.pdfium.FPDFPage_CloseAnnot(annot);
    }
  }

  /**
   * Reads a widget's field properties and its own geometry and state.
   * @param annot The widget annotation handle.
   * @param form The form handle.
   * @param kind The widget's supported field kind.
   * @returns The field, or a read error.
   */
  private readWidget(annot: number, form: number, kind: FormFieldKind): Result<FormField, "engine-failed"> {
    const rect = this.heap.withBuffer(RECT_BYTES, (ptr) =>
      this.pdfium.FPDFAnnot_GetRect(annot, ptr) ? this.heap.readRect(ptr) : null,
    );
    const name = this.readString((ptr, bytes) => this.pdfium.FPDFAnnot_GetFormFieldName(form, annot, ptr, bytes));
    const value = this.readValue(form, annot);
    const toggle = kind === "checkbox" || kind === "radio";
    const exportValue = toggle
      ? this.readString((ptr, bytes) => this.pdfium.FPDFAnnot_GetFormFieldExportValue(form, annot, ptr, bytes))
      : "";
    const options = kind === "choice" ? this.readOptions(annot, form) : [];
    if (rect === null || name === null || value === null || exportValue === null || options === null)
      return err("engine-failed");
    const { id, stored } = this.strings.ensureName(annot, () => crypto.randomUUID());
    if (!stored) return err("engine-failed");
    const flags = this.pdfium.FPDFAnnot_GetFormFieldFlags(form, annot);
    return ok({
      id,
      name,
      kind,
      rect,
      value,
      checked: toggle && this.pdfium.FPDFAnnot_IsChecked(form, annot),
      exportValue,
      options,
      required: (flags & FLAG_REQUIRED) !== 0,
      readOnly: (flags & FLAG_READ_ONLY) !== 0,
      multiline: kind === "text" && (flags & FLAG_MULTILINE) !== 0,
      ...this.readTypography(form, annot),
    });
  }

  /**
   * Reads the widget's default appearance and the inset used by PDFium's form filler.
   * @param form The document's form handle.
   * @param annot The widget handle.
   * @returns The face, point size, RGB colour and text inset.
   */
  private readTypography(
    form: number,
    annot: number,
  ): Pick<FormField, "fontName" | "fontSize" | "textColor" | "textInset"> {
    return this.heap.withBuffer(4 * INT_BYTES + FLOAT_BYTES, (ptr) => {
      const size = ptr + INT_BYTES;
      const r = size + FLOAT_BYTES;
      const g = r + INT_BYTES;
      const b = g + INT_BYTES;
      const hasFace = this.pdfium.EPDFAnnot_GetDefaultAppearance(annot, ptr, size, r, g, b);
      const fontName = hasFace ? (STANDARD_FONTS[this.heap.int(ptr)] ?? "") : "";
      const fontSize = this.pdfium.FPDFAnnot_GetFontSize(form, annot, size) ? this.heap.float(size) : 0;
      const textColor = this.pdfium.FPDFAnnot_GetFontColor(form, annot, r, g, b)
        ? { r: this.heap.int(r), g: this.heap.int(g), b: this.heap.int(b) }
        : { r: 0, g: 0, b: 0 };
      const border = this.pdfium.EPDFAnnot_GetBorderStyle(annot, size);
      const width = border
        ? this.heap.float(size)
        : this.pdfium.FPDFAnnot_GetBorder(annot, ptr, size, r)
          ? this.heap.float(r)
          : 1;
      const textInset = (border === BEVELED_BORDER || border === INSET_BORDER ? 2 : 1) * width;
      return { fontName, fontSize, textColor, textInset };
    });
  }

  /** Reads the committed field value, or null if PDFium cannot read it. */
  private readValue(form: number, annot: number): string | null {
    return this.readString((ptr, bytes) => this.pdfium.FPDFAnnot_GetFormFieldValue(form, annot, ptr, bytes));
  }

  /**
   * Reads a choice widget's option labels in order.
   * @param annot The widget annotation handle.
   * @param form The form handle.
   * @returns The labels, or null if a label could not be read.
   */
  private readOptions(annot: number, form: number): string[] | null {
    const count = this.pdfium.FPDFAnnot_GetOptionCount(form, annot);
    const options: string[] = [];
    for (let index = 0; index < count; index++) {
      const label = this.readString((ptr, bytes) =>
        this.pdfium.FPDFAnnot_GetOptionLabel(form, annot, index, ptr, bytes),
      );
      if (label === null) return null;
      options.push(label);
    }
    return options;
  }

  /**
   * Reads a PDFium form string, which includes a terminator even when empty.
   * @param read The PDFium getter accepting a buffer address and byte length.
   * @returns The decoded text, or null on a zero-length error.
   */
  private readString(read: (ptr: number, bytes: number) => number): string | null {
    const size = read(0, 0);
    return size ? this.heap.readWideString((ptr, bytes) => (ptr ? read(ptr, bytes) : size)) : null;
  }
}
