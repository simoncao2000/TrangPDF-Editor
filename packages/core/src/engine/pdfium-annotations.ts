/**
 * Reads and writes annotations on a loaded PDFium page. The only code that knows how the editor's
 * annotation records map onto PDF annotation dictionaries.
 *
 * Removing hides the annotation and marks it instead of deleting it, so undo can bring back any
 * annotation, even one made by another app that the editor could not recreate. Marked annotations
 * are stripped when a file is built (`stripRemoved`).
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { err, ok, type PdfPoint, type PdfRect, type Result } from "@pdf-editor/shared";
import {
  isTextMarkup,
  type Annotation,
  type AnnotationKind,
  type EditableAnnotation,
  type Rgb,
  type TextMarkupKind,
} from "../annotations/annotation";
import { plainComment, type CommentNote, type CommentReply } from "../annotations/comment";
import { encodeComment, MAX_COMMENT_XHTML } from "./comment-xhtml";
import { AnnotationComments, AnnotationStrings } from "./pdfium-comments";
import { AnnotationImages } from "./pdfium-images";
import { FLOAT_BYTES, INT_BYTES, POINT_BYTES, PdfiumHeap, QUAD_BYTES, RECT_BYTES } from "./pdfium-heap";

/** FPDF_ANNOT_* subtypes the editor maps to its own kinds. */
const SUBTYPE = {
  text: 1,
  link: 2,
  freeText: 3,
  line: 4,
  square: 5,
  circle: 6,
  highlight: 9,
  underline: 10,
  squiggly: 11,
  strikeout: 12,
  stamp: 13,
  ink: 15,
  popup: 16,
  widget: 20,
} as const;
const SUBTYPE_OF: Record<Exclude<AnnotationKind, "other">, number> = {
  highlight: SUBTYPE.highlight,
  underline: SUBTYPE.underline,
  strikeout: SUBTYPE.strikeout,
  squiggly: SUBTYPE.squiggly,
  ink: SUBTYPE.ink,
  square: SUBTYPE.square,
  circle: SUBTYPE.circle,
  line: SUBTYPE.line,
  arrow: SUBTYPE.line,
  note: SUBTYPE.text,
  image: SUBTYPE.stamp,
  textBox: SUBTYPE.freeText,
};
/** The text markup each subtype is. */
const MARKUP_OF: Partial<Record<number, TextMarkupKind>> = {
  [SUBTYPE.highlight]: "highlight",
  [SUBTYPE.underline]: "underline",
  [SUBTYPE.strikeout]: "strikeout",
  [SUBTYPE.squiggly]: "squiggly",
};
/** Line ending styles for EPDFAnnot_SetLineEndings (/LE): none, and the open arrowhead of arrows. */
const LINE_END_NONE = 0;
const LINE_END_OPEN_ARROW = 4;
/** Subtypes that are not shown as annotations: links and popups have no picture, widgets are form fields. */
const NOT_LISTED = new Set<number>([SUBTYPE.link, SUBTYPE.popup, SUBTYPE.widget]);
/** FPDF_ANNOT_FLAG_HIDDEN. */
const FLAG_HIDDEN = 2;
/** FPDF_ANNOT_FLAG_PRINT. */
const FLAG_PRINT = 4;
/** FPDFANNOT_COLORTYPE_Color. */
const COLOR_STROKE = 0;
/** Border style for EPDFAnnot_SetBorderStyle; with width 0 no border is drawn. */
const BORDER_STYLE_SOLID = 0;
/** Helvetica in PDFium's standard font list. */
const FONT_HELVETICA = 4;
const MAX_CHANNEL = 255;
/** Private key that marks a stamp as an image the editor placed (other stamps stay "other"). */
const IMAGE_KEY = "TrangPDFImage";
/** Private key that marks an annotation removed in the editor. */
const REMOVED_KEY = "TrangPDFRemoved";
const NAME_KEY = "NM";
const CONTENTS_KEY = "Contents";
const DEFAULT_COLOR: Rgb = { r: 0, g: 0, b: 0 };

export class PageAnnotations {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;
  private readonly comments: AnnotationComments;
  private readonly strings: AnnotationStrings;
  private readonly images: AnnotationImages;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
    this.comments = new AnnotationComments(pdfium);
    this.strings = new AnnotationStrings(pdfium);
    this.images = new AnnotationImages(pdfium);
  }

  /**
   * Lists a page's visible annotations, in drawing order, each with its replies (replies are not
   * listed on their own) and, for highlights, the text they cover. Unnamed annotations are
   * addressed without writing to their dictionaries.
   * @param page A loaded page.
   * @param plainOnly Whether to skip rich comment decoding.
   * @returns The annotations.
   */
  list(page: number, plainOnly = false): Annotation[] {
    const result: Annotation[] = [];
    const replies = new Map<string, CommentReply[]>();
    this.forEach(page, (annot) => {
      const subtype = this.pdfium.FPDFAnnot_GetSubtype(annot);
      if (NOT_LISTED.has(subtype) || this.isHidden(annot)) return;
      const parentId = this.comments.parentOf(page, annot);
      if (parentId === null) result.push(this.read(page, annot, subtype, plainOnly));
      else replies.set(parentId, [...(replies.get(parentId) ?? []), this.readReply(page, annot, plainOnly)]);
    });
    return result.map((annotation) => {
      const thread = replies.get(annotation.id);
      const quote = !plainOnly && isTextMarkup(annotation) ? this.comments.quote(page, annotation.lines) : "";
      return { ...annotation, ...(thread ? { replies: thread } : {}), ...(quote ? { quote } : {}) };
    });
  }

  /**
   * Writes a reply to an annotation: creates it if the page has none with its id, otherwise
   * updates it (and shows it again if it was removed).
   * @param page A loaded page.
   * @param parentId The annotation it answers.
   * @param reply The reply.
   * @returns Success or the reason the reply could not be written.
   */
  putReply(
    page: number,
    parentId: string,
    reply: CommentReply,
  ): Result<null, "unknown-annotation" | "rich-comment-too-large"> {
    const content = encodeComment(reply.body);
    if (content.rich.length > MAX_COMMENT_XHTML) return err("rich-comment-too-large");
    const parent = this.find(page, parentId);
    if (!parent) return err("unknown-annotation");
    try {
      const annot = this.find(page, reply.id) || this.comments.createReply(page, parent, reply.id);
      if (!annot) return err("unknown-annotation");
      try {
        this.unhide(annot);
        this.comments.write(annot, reply, content);
        return ok(null);
      } finally {
        this.pdfium.FPDFPage_CloseAnnot(annot);
      }
    } finally {
      this.pdfium.FPDFPage_CloseAnnot(parent);
    }
  }

  /**
   * Writes an annotation: creates it if the page has none with its id, otherwise updates it (and
   * shows it again if it was removed).
   * @param doc The document handle (new images belong to it).
   * @param page A loaded page.
   * @param annotation The annotation to write.
   * @param editComment Whether to replace the stored comment on an existing annotation.
   * @returns The annotation as stored or the reason it could not be written.
   */
  put(
    doc: number,
    page: number,
    annotation: EditableAnnotation,
    editComment = false,
  ): Result<Annotation, "annotation-failed" | "rich-comment-too-large"> {
    const existing = this.find(page, annotation.id);
    let annot = existing;
    try {
      const replace = existing && !editComment && this.needsRecreating(existing, annotation);
      if (replace && this.hasCommentData(page, existing, annotation.id)) return err("annotation-failed");
      const note = annotation.kind !== "textBox" && (!existing || editComment) ? annotation.comment : undefined;
      const content = note && encodeComment(note.body);
      if (content && content.rich.length > MAX_COMMENT_XHTML) return err("rich-comment-too-large");
      if (editComment && existing) {
        if (note && content) this.comments.write(existing, note, content);
        return ok(this.read(page, existing, this.pdfium.FPDFAnnot_GetSubtype(existing)));
      }
      if (!existing || replace) {
        annot = this.pdfium.FPDFPage_CreateAnnot(page, SUBTYPE_OF[annotation.kind]);
        if (!annot) return err("annotation-failed");
        this.strings.set(annot, NAME_KEY, annotation.id);
        // Printed like the rest of the page (other readers leave out marks without this flag).
        this.pdfium.FPDFAnnot_SetFlags(annot, FLAG_PRINT);
      }
      this.unhide(annot);
      this.write(doc, annot, annotation);
      if (note && content) this.comments.write(annot, note, content);
      // An image's appearance is its picture, which writing it already built.
      if (annotation.kind !== "image") this.pdfium.EPDFAnnot_GenerateAppearance(annot);
      if (replace) {
        const index = this.pdfium.FPDFPage_GetAnnotIndex(page, existing);
        if (!this.pdfium.FPDFPage_RemoveAnnot(page, index)) {
          this.pdfium.FPDFPage_RemoveAnnot(page, this.pdfium.FPDFPage_GetAnnotIndex(page, annot));
          return err("annotation-failed");
        }
      }
      return ok(this.read(page, annot, SUBTYPE_OF[annotation.kind]));
    } finally {
      if (annot && annot !== existing) this.pdfium.FPDFPage_CloseAnnot(annot);
      if (existing) this.pdfium.FPDFPage_CloseAnnot(existing);
    }
  }

  /**
   * Hides an annotation and marks it removed.
   * @param page A loaded page.
   * @param id The annotation's id.
   * @returns False if the page has no annotation with that id.
   */
  remove(page: number, id: string): boolean {
    return this.withAnnot(page, id, (annot) => {
      this.pdfium.FPDFAnnot_SetFlags(annot, this.pdfium.FPDFAnnot_GetFlags(annot) | FLAG_HIDDEN);
      this.strings.set(annot, REMOVED_KEY, "1");
    });
  }

  /**
   * Shows a removed annotation again.
   * @param page A loaded page.
   * @param id The annotation's id.
   * @returns False if the page has no annotation with that id.
   */
  restore(page: number, id: string): boolean {
    return this.withAnnot(page, id, (annot) => this.unhide(annot));
  }

  /**
   * Deletes every annotation marked removed. Used on a copy of a file that is being saved.
   * @param page A loaded page.
   */
  stripRemoved(page: number): void {
    for (let index = this.pdfium.FPDFPage_GetAnnotCount(page) - 1; index >= 0; index--) {
      const annot = this.pdfium.FPDFPage_GetAnnot(page, index);
      const removed = annot ? this.isRemoved(annot) : false;
      if (annot) this.pdfium.FPDFPage_CloseAnnot(annot);
      if (removed) this.pdfium.FPDFPage_RemoveAnnot(page, index);
    }
  }

  /**
   * Hides or shows every annotation the editor draws itself, so a page can be rendered without
   * them while the annotation layer draws them on top.
   * @param page A loaded page.
   * @param hidden True to hide, false to undo an earlier `setEditableHidden(page, true)`.
   */
  setEditableHidden(page: number, hidden: boolean): void {
    // Images (stamps) are drawn by PDFium, like stamps from other apps.
    const editable = new Set(Object.values(SUBTYPE_OF).filter((subtype) => subtype !== SUBTYPE.stamp));
    this.forEach(page, (annot) => {
      if (!editable.has(this.pdfium.FPDFAnnot_GetSubtype(annot)) || this.isRemoved(annot)) return;
      const flags = this.pdfium.FPDFAnnot_GetFlags(annot);
      this.pdfium.FPDFAnnot_SetFlags(annot, hidden ? flags | FLAG_HIDDEN : flags & ~FLAG_HIDDEN);
    });
  }

  /**
   * Calls `visit` with every annotation on a page, closing each handle afterwards.
   * @param page A loaded page.
   * @param visit Receives each annotation handle.
   */
  private forEach(page: number, visit: (annot: number) => void): void {
    const count = this.pdfium.FPDFPage_GetAnnotCount(page);
    for (let index = 0; index < count; index++) {
      const annot = this.pdfium.FPDFPage_GetAnnot(page, index);
      if (!annot) continue;
      try {
        visit(annot);
      } finally {
        this.pdfium.FPDFPage_CloseAnnot(annot);
      }
    }
  }

  /**
   * Finds an annotation by id. The caller closes the handle.
   * @param page A loaded page.
   * @param id The annotation's id.
   * @returns Its handle, or 0.
   */
  private find(page: number, id: string): number {
    const count = this.pdfium.FPDFPage_GetAnnotCount(page);
    for (let index = 0; index < count; index++) {
      const annot = this.pdfium.FPDFPage_GetAnnot(page, index);
      if (annot && this.strings.annotationId(page, annot) === id) return annot;
      if (annot) this.pdfium.FPDFPage_CloseAnnot(annot);
    }
    return 0;
  }

  /**
   * Runs `work` on the annotation with an id, then closes it.
   * @param page A loaded page.
   * @param id The annotation's id.
   * @param work What to do with it.
   * @returns False if there is no such annotation.
   */
  private withAnnot(page: number, id: string, work: (annot: number) => void): boolean {
    const annot = this.find(page, id);
    if (!annot) return false;
    try {
      work(annot);
      return true;
    } finally {
      this.pdfium.FPDFPage_CloseAnnot(annot);
    }
  }

  /**
   * Checks whether replacing an annotation would lose comment entries or break reply links.
   * @param page A loaded page.
   * @param annot The annotation handle.
   * @param id The annotation id.
   * @returns Whether the original dictionary must be preserved.
   */
  private hasCommentData(page: number, annot: number, id: string): boolean {
    if (this.comments.hasEntries(annot, this.pdfium.FPDFAnnot_GetSubtype(annot) === SUBTYPE.freeText)) return true;
    let hasReplies = false;
    this.forEach(page, (candidate) => {
      hasReplies ||= this.comments.parentOf(page, candidate) === id;
    });
    return hasReplies;
  }

  /**
   * Whether an existing annotation cannot be updated in place: a different kind, or a highlight
   * with fewer lines (PDFium can replace and append quads).
   * @param annot Existing annotation handle.
   * @param next What it should become.
   * @returns True when it has to be deleted and created again.
   */
  private needsRecreating(annot: number, next: EditableAnnotation): boolean {
    if (this.pdfium.FPDFAnnot_GetSubtype(annot) !== SUBTYPE_OF[next.kind]) return true;
    return isTextMarkup(next) && this.pdfium.FPDFAnnot_CountAttachmentPoints(annot) > next.lines.length;
  }

  /**
   * Copies a record's properties onto an annotation.
   * @param doc The document handle.
   * @param annot The annotation handle.
   * @param annotation The record.
   */
  private write(doc: number, annot: number, annotation: EditableAnnotation): void {
    const { pdfium, heap } = this;
    heap.withBuffer(RECT_BYTES, (ptr) => {
      heap.writeRect(ptr, annotation.rect);
      pdfium.FPDFAnnot_SetRect(annot, ptr);
    });
    pdfium.EPDFAnnot_SetOpacity(annot, Math.round(annotation.opacity * MAX_CHANNEL));
    const { r, g, b } = annotation.color;
    switch (annotation.kind) {
      case "highlight":
      case "underline":
      case "strikeout":
      case "squiggly":
        pdfium.EPDFAnnot_SetColor(annot, COLOR_STROKE, r, g, b);
        this.writeLines(annot, annotation.lines);
        break;
      case "line":
      case "arrow":
        pdfium.EPDFAnnot_SetColor(annot, COLOR_STROKE, r, g, b);
        pdfium.FPDFAnnot_SetBorder(annot, 0, 0, annotation.lineWidth);
        heap.withBuffer(2 * POINT_BYTES, (ptr) => {
          heap.writePoints(ptr, [annotation.start, annotation.end]);
          pdfium.EPDFAnnot_SetLine(annot, ptr, ptr + POINT_BYTES);
        });
        pdfium.EPDFAnnot_SetLineEndings(
          annot,
          LINE_END_NONE,
          annotation.kind === "arrow" ? LINE_END_OPEN_ARROW : LINE_END_NONE,
        );
        break;
      case "note":
        pdfium.EPDFAnnot_SetColor(annot, COLOR_STROKE, r, g, b);
        break;
      case "image":
        this.images.write(doc, annot, annotation);
        this.strings.set(annot, IMAGE_KEY, "1");
        break;
      case "ink":
        pdfium.EPDFAnnot_SetColor(annot, COLOR_STROKE, r, g, b);
        pdfium.FPDFAnnot_SetBorder(annot, 0, 0, annotation.lineWidth);
        pdfium.FPDFAnnot_RemoveInkList(annot);
        for (const stroke of annotation.strokes) {
          heap.withBuffer(stroke.length * POINT_BYTES, (ptr) => {
            heap.writePoints(ptr, stroke);
            pdfium.FPDFAnnot_AddInkStroke(annot, ptr, stroke.length);
          });
        }
        break;
      case "square":
      case "circle":
        pdfium.EPDFAnnot_SetColor(annot, COLOR_STROKE, r, g, b);
        pdfium.FPDFAnnot_SetBorder(annot, 0, 0, annotation.lineWidth);
        break;
      case "textBox":
        // No frame: PDFium otherwise draws a 1 pt border in the text colour (and insets the text).
        pdfium.EPDFAnnot_SetBorderStyle(annot, BORDER_STYLE_SOLID, 0);
        this.strings.set(annot, CONTENTS_KEY, annotation.text);
        pdfium.EPDFAnnot_SetDefaultAppearance(annot, FONT_HELVETICA, annotation.fontSize, r, g, b);
        break;
    }
  }

  /**
   * Writes a highlight's lines as quad points, replacing existing ones in place.
   * @param annot The annotation handle.
   * @param lines One rectangle per line.
   */
  private writeLines(annot: number, lines: readonly PdfRect[]): void {
    const existing = this.pdfium.FPDFAnnot_CountAttachmentPoints(annot);
    this.heap.withBuffer(QUAD_BYTES, (ptr) => {
      lines.forEach((line, index) => {
        this.heap.writeQuad(ptr, line);
        if (index < existing) this.pdfium.FPDFAnnot_SetAttachmentPoints(annot, index, ptr);
        else this.pdfium.FPDFAnnot_AppendAttachmentPoints(annot, ptr);
      });
    });
  }

  /**
   * Reads an annotation into a record.
   * @param page The annotation page.
   * @param annot The annotation handle.
   * @param subtype Its FPDF_ANNOT_* subtype.
   * @param plainOnly Whether to skip rich comment decoding.
   * @returns The record.
   */
  private read(page: number, annot: number, subtype: number, plainOnly = false): Annotation {
    const base = {
      id: this.strings.annotationId(page, annot),
      rect: this.heap.withBuffer(RECT_BYTES, (ptr) =>
        this.pdfium.FPDFAnnot_GetRect(annot, ptr) ? this.heap.readRect(ptr) : { x: 0, y: 0, width: 0, height: 0 },
      ),
      color: this.readColor(annot) ?? DEFAULT_COLOR,
      opacity: this.readOpacity(annot),
      ...this.commentOf(annot, subtype, plainOnly),
    };
    const markup = MARKUP_OF[subtype];
    if (markup) return { ...base, kind: markup, lines: this.readLines(annot) };
    switch (subtype) {
      case SUBTYPE.ink:
        return { ...base, kind: "ink", strokes: this.readStrokes(annot), lineWidth: this.readBorderWidth(annot) };
      case SUBTYPE.square:
        return { ...base, kind: "square", lineWidth: this.readBorderWidth(annot) };
      case SUBTYPE.circle:
        return { ...base, kind: "circle", lineWidth: this.readBorderWidth(annot) };
      case SUBTYPE.line:
        return { ...base, ...this.readLine(annot), lineWidth: this.readBorderWidth(annot) };
      case SUBTYPE.text:
        return { ...base, kind: "note" };
      case SUBTYPE.stamp:
        return this.strings.get(annot, IMAGE_KEY) === "1"
          ? { ...base, kind: "image" }
          : { ...base, kind: "other", subtype };
      case SUBTYPE.freeText:
        return {
          ...base,
          ...this.readTextAppearance(annot),
          kind: "textBox",
          text: this.strings.get(annot, CONTENTS_KEY),
        };
      default:
        return { ...base, kind: "other", subtype };
    }
  }

  /**
   * The comment on an annotation, as a record field.
   * @param annot The annotation handle.
   * @param subtype Its FPDF_ANNOT_* subtype.
   * @param plainOnly Whether to skip rich comment decoding.
   * @returns `{ comment }`, or nothing for a text box (its /Contents is its text) or no comment.
   */
  private commentOf(annot: number, subtype: number, plainOnly: boolean): { comment?: CommentNote } {
    const comment = subtype === SUBTYPE.freeText ? undefined : this.comments.read(annot, plainOnly);
    return comment ? { comment } : {};
  }

  /**
   * Reads a reply.
   * @param page The annotation page.
   * @param annot The reply's handle.
   * @param plainOnly Whether to skip rich comment decoding.
   * @returns The record.
   */
  private readReply(page: number, annot: number, plainOnly: boolean): CommentReply {
    const note = this.comments.read(annot, plainOnly) ?? { body: plainComment(""), author: "", modified: null };
    return { id: this.strings.annotationId(page, annot), ...note };
  }

  /**
   * Reads the stroke colour.
   * @param annot The annotation handle.
   * @returns The colour, or `null` if it has none.
   */
  private readColor(annot: number): Rgb | null {
    return this.heap.withBuffer(3 * INT_BYTES, (ptr) =>
      this.pdfium.EPDFAnnot_GetColor(annot, COLOR_STROKE, ptr, ptr + INT_BYTES, ptr + 2 * INT_BYTES)
        ? { r: this.heap.int(ptr), g: this.heap.int(ptr + INT_BYTES), b: this.heap.int(ptr + 2 * INT_BYTES) }
        : null,
    );
  }

  /**
   * Reads the constant opacity.
   * @param annot The annotation handle.
   * @returns 0 to 1; 1 when unset.
   */
  private readOpacity(annot: number): number {
    return this.heap.withBuffer(INT_BYTES, (ptr) =>
      this.pdfium.EPDFAnnot_GetOpacity(annot, ptr) ? this.heap.int(ptr) / MAX_CHANNEL : 1,
    );
  }

  /**
   * Reads the border width.
   * @param annot The annotation handle.
   * @returns The width in points; 1 when unset.
   */
  private readBorderWidth(annot: number): number {
    return this.heap.withBuffer(3 * FLOAT_BYTES, (ptr) =>
      this.pdfium.FPDFAnnot_GetBorder(annot, ptr, ptr + FLOAT_BYTES, ptr + 2 * FLOAT_BYTES)
        ? this.heap.float(ptr + 2 * FLOAT_BYTES)
        : 1,
    );
  }

  /**
   * Reads a line's ends and whether it ends in an arrowhead.
   * @param annot The annotation handle.
   * @returns Its kind (line or arrow) and its two ends; the rectangle's diagonal when PDFium cannot say.
   */
  private readLine(annot: number): { kind: "line" | "arrow"; start: PdfPoint; end: PdfPoint } {
    const ends = this.heap.withBuffer(2 * POINT_BYTES, (ptr) =>
      this.pdfium.FPDFAnnot_GetLine(annot, ptr, ptr + POINT_BYTES) ? this.heap.readPoints(ptr, 2) : null,
    );
    const rect = this.heap.withBuffer(RECT_BYTES, (ptr) =>
      this.pdfium.FPDFAnnot_GetRect(annot, ptr) ? this.heap.readRect(ptr) : { x: 0, y: 0, width: 0, height: 0 },
    );
    const [start, end] = ends ?? [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];
    const ending = this.heap.withBuffer(2 * INT_BYTES, (ptr) =>
      this.pdfium.EPDFAnnot_GetLineEndings(annot, ptr, ptr + INT_BYTES)
        ? this.heap.int(ptr + INT_BYTES)
        : LINE_END_NONE,
    );
    return { kind: ending === LINE_END_NONE ? "line" : "arrow", start: start!, end: end! };
  }

  /**
   * Reads a highlight's quad points, one rectangle per line.
   * @param annot The annotation handle.
   * @returns The lines.
   */
  private readLines(annot: number): PdfRect[] {
    const count = this.pdfium.FPDFAnnot_CountAttachmentPoints(annot);
    return this.heap.withBuffer(QUAD_BYTES, (ptr) =>
      Array.from({ length: count }, (_, index) => {
        this.pdfium.FPDFAnnot_GetAttachmentPoints(annot, index, ptr);
        return this.heap.readQuadBounds(ptr);
      }),
    );
  }

  /**
   * Reads an ink annotation's strokes.
   * @param annot The annotation handle.
   * @returns One list of points per stroke.
   */
  private readStrokes(annot: number): PdfPoint[][] {
    return Array.from({ length: this.pdfium.FPDFAnnot_GetInkListCount(annot) }, (_, index) => {
      const count = this.pdfium.FPDFAnnot_GetInkListPath(annot, index, 0, 0);
      return this.heap.withBuffer(count * POINT_BYTES, (ptr) => {
        this.pdfium.FPDFAnnot_GetInkListPath(annot, index, ptr, count);
        return this.heap.readPoints(ptr, count);
      });
    });
  }

  /**
   * Reads a text box's font size and text colour from its default appearance.
   * @param annot The annotation handle.
   * @returns Font size and colour, with defaults when the text box has none.
   */
  private readTextAppearance(annot: number): { fontSize: number; color: Rgb } {
    // Out params: font (int), size (float), r, g, b (ints).
    return this.heap.withBuffer(5 * INT_BYTES, (ptr) => {
      const at = (slot: number) => ptr + slot * INT_BYTES;
      if (!this.pdfium.EPDFAnnot_GetDefaultAppearance(annot, at(0), at(1), at(2), at(3), at(4)))
        return { fontSize: 12, color: DEFAULT_COLOR };
      return {
        fontSize: this.heap.float(at(1)),
        color: { r: this.heap.int(at(2)), g: this.heap.int(at(3)), b: this.heap.int(at(4)) },
      };
    });
  }

  /**
   * Whether the editor removed this annotation.
   * @param annot The annotation handle.
   * @returns True when marked removed.
   */
  private isRemoved(annot: number): boolean {
    return this.strings.get(annot, REMOVED_KEY) === "1";
  }

  /**
   * Whether an annotation is hidden, by the file or by the editor.
   * @param annot The annotation handle.
   * @returns True when it should not be listed.
   */
  private isHidden(annot: number): boolean {
    return (this.pdfium.FPDFAnnot_GetFlags(annot) & FLAG_HIDDEN) !== 0;
  }

  /**
   * Clears the removed mark and the hidden flag.
   * @param annot The annotation handle.
   */
  private unhide(annot: number): void {
    if (!this.isRemoved(annot)) return;
    this.strings.set(annot, REMOVED_KEY, "");
    this.pdfium.FPDFAnnot_SetFlags(annot, this.pdfium.FPDFAnnot_GetFlags(annot) & ~FLAG_HIDDEN);
  }
}
