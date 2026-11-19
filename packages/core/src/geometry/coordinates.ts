/**
 * Conversion between PDF space and screen space (architecture §8.3). Every annotation tool goes
 * through these functions; components never do this math themselves.
 *
 * PDF space: origin at the bottom-left of the page, y goes up, unit is the point (1/72 inch).
 * Screen space: origin at the top-left of the displayed page, y goes down, unit is the CSS pixel.
 * The displayed page is the crop box, turned clockwise by the page's rotation, scaled by zoom × 96/72.
 */
import type { PageSize, PdfPoint, PdfRect } from "@pdf-editor/shared";
import type { PageGeometry, Rotation } from "../engine/protocol";
import { CSS_PIXELS_PER_POINT, type Size } from "./zoom";

/** A point on the displayed page, in CSS pixels from its top-left corner. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle on the displayed page, in CSS pixels from its top-left corner. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** How one page is shown: which part of it, turned how far, at what zoom. */
export interface PageFrame {
  /** The visible area of the page in PDF space (its crop box), before rotation. */
  readonly cropBox: PdfRect;
  /** Total clockwise rotation: the page's own rotation plus any rotation added in the editor. */
  readonly rotation: Rotation;
  /** 1 means 100%. */
  readonly zoom: number;
}

const FULL_TURN = 360;

/**
 * Adds two clockwise rotations.
 * @param a A rotation.
 * @param b Another rotation.
 * @returns Their sum in [0, 360).
 */
function addRotations(a: Rotation, b: Rotation): Rotation {
  return ((a + b) % FULL_TURN) as Rotation;
}

/**
 * Size of a page as shown, in points.
 * @param page The page's crop box and own rotation.
 * @param extraRotation Rotation added in the editor.
 * @returns Width and height after both rotations.
 */
export function pageSizeOf(page: PageGeometry, extraRotation: Rotation = 0): PageSize {
  const { width, height } = page.cropBox;
  return addRotations(page.rotation, extraRotation) % 180 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * How a page is shown at a zoom.
 * @param page The page's crop box and own rotation.
 * @param extraRotation Rotation added in the editor.
 * @param zoom 1 means 100%.
 * @returns The frame to convert coordinates with.
 */
export function pageFrame(page: PageGeometry, extraRotation: Rotation, zoom: number): PageFrame {
  return { cropBox: page.cropBox, rotation: addRotations(page.rotation, extraRotation), zoom };
}

/**
 * CSS pixels per PDF point for a frame.
 * @param frame The page frame.
 * @returns zoom × 96 / 72.
 */
function scaleOf(frame: PageFrame): number {
  return frame.zoom * CSS_PIXELS_PER_POINT;
}

/**
 * Size of the displayed page, after rotation and zoom.
 * @param frame The page frame.
 * @returns Width and height in CSS pixels.
 */
export function displayedSize(frame: PageFrame): Size {
  const scale = scaleOf(frame);
  const { width, height } = frame.cropBox;
  return frame.rotation % 180 === 0 ? { width: width * scale, height: height * scale } : { width: height * scale, height: width * scale };
}

/**
 * Converts a PDF point to a point on the displayed page.
 * @param point A point in PDF space.
 * @param frame How the page is shown.
 * @returns The point in CSS pixels from the displayed page's top-left corner.
 */
export function pdfToScreen(point: PdfPoint, frame: PageFrame): ScreenPoint {
  const { cropBox, rotation } = frame;
  // Distance from the crop box's top-left corner, y going down, still in points and unrotated.
  const u = point.x - cropBox.x;
  const v = cropBox.y + cropBox.height - point.y;
  const scale = scaleOf(frame);
  switch (rotation) {
    case 0:
      return { x: u * scale, y: v * scale };
    case 90:
      return { x: (cropBox.height - v) * scale, y: u * scale };
    case 180:
      return { x: (cropBox.width - u) * scale, y: (cropBox.height - v) * scale };
    case 270:
      return { x: v * scale, y: (cropBox.width - u) * scale };
  }
}

/**
 * Converts a point on the displayed page to a PDF point. The inverse of `pdfToScreen`.
 * @param point A point in CSS pixels from the displayed page's top-left corner.
 * @param frame How the page is shown.
 * @returns The point in PDF space.
 */
export function screenToPdf(point: ScreenPoint, frame: PageFrame): PdfPoint {
  const { cropBox, rotation } = frame;
  const scale = scaleOf(frame);
  const dx = point.x / scale;
  const dy = point.y / scale;
  const [u, v] = unrotate(dx, dy, rotation, cropBox);
  return { x: cropBox.x + u, y: cropBox.y + cropBox.height - v };
}

/**
 * Undoes the clockwise turn of a displayed point.
 * @param dx Distance from the displayed page's left edge, in points.
 * @param dy Distance from the displayed page's top edge, in points.
 * @param rotation The page's total rotation.
 * @param cropBox The page's crop box.
 * @returns Distances from the unrotated crop box's left and top edges, in points.
 */
function unrotate(dx: number, dy: number, rotation: Rotation, cropBox: PdfRect): readonly [number, number] {
  switch (rotation) {
    case 0:
      return [dx, dy];
    case 90:
      return [dy, cropBox.height - dx];
    case 180:
      return [cropBox.width - dx, cropBox.height - dy];
    case 270:
      return [cropBox.width - dy, dx];
  }
}

/**
 * Converts a PDF rectangle to a rectangle on the displayed page.
 * @param rect A rectangle in PDF space.
 * @param frame How the page is shown.
 * @returns The rectangle in CSS pixels; rotation may swap its width and height.
 */
export function pdfRectToScreen(rect: PdfRect, frame: PageFrame): ScreenRect {
  const a = pdfToScreen({ x: rect.x, y: rect.y }, frame);
  const b = pdfToScreen({ x: rect.x + rect.width, y: rect.y + rect.height }, frame);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/**
 * Converts a rectangle on the displayed page to a PDF rectangle. The inverse of `pdfRectToScreen`.
 * @param rect A rectangle in CSS pixels.
 * @param frame How the page is shown.
 * @returns The rectangle in PDF space.
 */
export function screenRectToPdf(rect: ScreenRect, frame: PageFrame): PdfRect {
  const a = screenToPdf({ x: rect.left, y: rect.top }, frame);
  const b = screenToPdf({ x: rect.left + rect.width, y: rect.top + rect.height }, frame);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/**
 * Converts a distance moved on screen (a drag) into a distance in PDF space.
 * @param delta Distance in CSS pixels, y going down.
 * @param frame How the page is shown.
 * @returns The same distance in points, y going up, with the page's rotation undone.
 */
export function screenDeltaToPdf(delta: ScreenPoint, frame: PageFrame): PdfPoint {
  const origin = screenToPdf({ x: 0, y: 0 }, frame);
  const moved = screenToPdf(delta, frame);
  return { x: moved.x - origin.x, y: moved.y - origin.y };
}
