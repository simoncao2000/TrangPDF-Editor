/**
 * The annotations the editor understands, as plain data in PDF space. PDFium owns the real objects
 * (architecture §6.1); these records are what crosses the worker boundary, what commands remember
 * for undo, and what the annotation layer draws.
 */
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import type { CommentNote, CommentReply } from "./comment";

/** A colour with 0–255 channels. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface AnnotationBase {
  /** Stable id, stored in the PDF as the annotation's name (/NM). */
  readonly id: string;
  /** Bounding box in PDF space. */
  readonly rect: PdfRect;
  readonly color: Rgb;
  /** 0 (invisible) to 1 (solid). */
  readonly opacity: number;
  /** The comment written on it (text boxes have none: their /Contents is their text). */
  readonly comment?: CommentNote;
  /** Replies to it, oldest first. Read from the file; changed with their own commands. */
  readonly replies?: readonly CommentReply[];
}

/** Highlighted text: one rectangle per line. */
export interface HighlightAnnotation extends AnnotationBase {
  readonly kind: "highlight";
  readonly lines: readonly PdfRect[];
  /** The page text under it, read from the page (never written). */
  readonly quote?: string;
}

/** Freehand drawing, also used for drawn signatures. */
export interface InkAnnotation extends AnnotationBase {
  readonly kind: "ink";
  readonly strokes: readonly (readonly PdfPoint[])[];
  readonly lineWidth: number;
}

/** A rectangle outline. */
export interface SquareAnnotation extends AnnotationBase {
  readonly kind: "square";
  readonly lineWidth: number;
}

/** A text box. `color` is the text colour. */
export interface TextBoxAnnotation extends AnnotationBase {
  readonly kind: "textBox";
  readonly text: string;
  readonly fontSize: number;
}

/**
 * Any other annotation, made by another app (a stamp, a note, a shape the editor does not draw).
 * PDFium draws it; the editor can select and delete it, but not change it.
 */
export interface OtherAnnotation extends AnnotationBase {
  readonly kind: "other";
  /** The PDF annotation subtype number (FPDF_ANNOT_*). */
  readonly subtype: number;
}

export type Annotation = HighlightAnnotation | InkAnnotation | SquareAnnotation | TextBoxAnnotation | OtherAnnotation;
export type AnnotationKind = Annotation["kind"];
/** The kinds the editor creates and draws itself. */
export type EditableAnnotation = Exclude<Annotation, OtherAnnotation>;

/**
 * Whether the editor draws and edits this annotation itself.
 * @param annotation Any annotation.
 * @returns True for highlights, ink, rectangles and text boxes.
 */
export function isEditable(annotation: Annotation): annotation is EditableAnnotation {
  return annotation.kind !== "other";
}

/**
 * Moves a point.
 * @param point A point.
 * @param dx Distance along x, in points.
 * @param dy Distance along y, in points.
 * @returns The moved point.
 */
function shiftPoint(point: PdfPoint, dx: number, dy: number): PdfPoint {
  return { x: point.x + dx, y: point.y + dy };
}

/**
 * Moves a rectangle.
 * @param rect A rectangle.
 * @param dx Distance along x, in points.
 * @param dy Distance along y, in points.
 * @returns The moved rectangle.
 */
function shiftRect(rect: PdfRect, dx: number, dy: number): PdfRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/**
 * Moves an annotation by a distance in PDF space, with everything it contains.
 * @param annotation The annotation.
 * @param dx Distance along x, in points.
 * @param dy Distance along y, in points (positive is up).
 * @returns A moved copy.
 */
export function moveAnnotation<A extends Annotation>(annotation: A, dx: number, dy: number): A {
  const rect = shiftRect(annotation.rect, dx, dy);
  switch (annotation.kind) {
    case "highlight":
      return { ...annotation, rect, lines: annotation.lines.map((line) => shiftRect(line, dx, dy)) };
    case "ink":
      return {
        ...annotation,
        rect,
        strokes: annotation.strokes.map((stroke) => stroke.map((point) => shiftPoint(point, dx, dy))),
      };
    default:
      return { ...annotation, rect };
  }
}

/**
 * Stretches an annotation into a new bounding box. Ink strokes are scaled with it; highlights are
 * tied to the text under them, so they keep their size.
 * @param annotation The annotation.
 * @param to The new bounding box, in PDF space.
 * @returns A resized copy.
 */
export function resizeAnnotation<A extends Annotation>(annotation: A, to: PdfRect): A {
  if (annotation.kind === "highlight") return annotation;
  if (annotation.kind !== "ink") return { ...annotation, rect: to };
  const from = annotation.rect;
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  const map = (point: PdfPoint): PdfPoint => ({ x: to.x + (point.x - from.x) * sx, y: to.y + (point.y - from.y) * sy });
  return { ...annotation, rect: to, strokes: annotation.strokes.map((stroke) => stroke.map(map)) };
}

/**
 * The smallest rectangle around a set of points, grown by a margin on every side.
 * @param points At least one point.
 * @param margin Space added around the points, in points (half a line width keeps strokes inside).
 * @returns The bounding rectangle.
 */
export function boundsOf(points: readonly PdfPoint[], margin = 0): PdfRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - margin;
  const bottom = Math.min(...ys) - margin;
  return { x: left, y: bottom, width: Math.max(...xs) + margin - left, height: Math.max(...ys) + margin - bottom };
}

/**
 * The bounding box of some rectangles.
 * @param rects At least one rectangle.
 * @returns Their bounds.
 */
export function boundsOfRects(rects: readonly PdfRect[]): PdfRect {
  return boundsOf(
    rects.flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ]),
  );
}

/**
 * A new highlight over some lines of text.
 * @param id A fresh id.
 * @param lines One rectangle per line, in PDF space.
 * @param look Its colour and opacity.
 * @returns The highlight.
 */
export function newHighlight(
  id: string,
  lines: readonly PdfRect[],
  look: { readonly color: Rgb; readonly opacity: number },
): HighlightAnnotation {
  return { kind: "highlight", id, lines, rect: boundsOfRects(lines), color: look.color, opacity: look.opacity };
}
