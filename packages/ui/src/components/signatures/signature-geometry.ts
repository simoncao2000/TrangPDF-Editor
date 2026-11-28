/** Turning drawn strokes into a saved signature, and a saved signature into ink on a page. */
import { screenToPdf, type PageFrame, type InkAnnotation, type Rgb } from "@pdf-editor/core";
import type { PdfPoint } from "@pdf-editor/shared";
import type { DrawnSignature } from "../../state/signature-store";

type Point = { readonly x: number; readonly y: number };

/**
 * Normalises strokes drawn on a pad into a saved signature: cropped to their ink, 1 wide.
 * @param id A fresh id.
 * @param strokes Strokes in pad pixels, y down.
 * @returns The signature, or `null` when nothing was drawn.
 */
export function signatureFrom(id: string, strokes: readonly (readonly Point[])[]): DrawnSignature | null {
  const points = strokes.flat();
  if (points.length === 0) return null;
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const width = Math.max(1, Math.max(...points.map((p) => p.x)) - left);
  const height = Math.max(1, Math.max(...points.map((p) => p.y)) - top);
  return {
    kind: "drawn",
    id,
    aspect: height / width,
    strokes: strokes.map((stroke) => stroke.map((p) => ({ x: (p.x - left) / width, y: (p.y - top) / width }))),
  };
}

/** What a placed signature looks like. */
export interface SignatureLook {
  readonly color: Rgb;
  readonly lineWidth: number;
  /** Its width on the page, in points. */
  readonly width: number;
}

/**
 * A saved signature as ink on a page, its top-left corner at a point.
 * @param signature The signature.
 * @param at The top-left corner, in PDF space (y up).
 * @param look Colour, stroke width and width on the page.
 * @returns The ink annotation, with an empty id.
 */
export function placeSignature(signature: DrawnSignature, at: PdfPoint, look: SignatureLook): InkAnnotation {
  const height = signature.aspect * look.width;
  const strokes = signature.strokes.map((stroke) =>
    // A single dot is drawn as a tiny stroke so it still shows.
    (stroke.length === 1 ? [stroke[0]!, stroke[0]!] : stroke).map((p) => ({
      x: at.x + p.x * look.width,
      y: at.y - p.y * look.width,
    })),
  );
  const margin = look.lineWidth / 2;
  return {
    kind: "ink",
    id: "",
    strokes,
    lineWidth: look.lineWidth,
    color: look.color,
    opacity: 1,
    rect: { x: at.x - margin, y: at.y - height - margin, width: look.width + 2 * margin, height: height + 2 * margin },
  };
}

export const SIGNATURE_WIDTH = 160;

/** @param start Tile press position. @param point Current position. @returns Whether the drag has begun. */
export function startedDrag(start: Point, point: Point) {
  return Math.hypot(start.x - point.x, start.y - point.y) >= 6;
}

/** @param cancelled Whether the gesture was interrupted. @param overPage Whether a page was hit.
 * @returns Whether to commit the drop.
 */
export function acceptsDrop(cancelled: boolean, overPage: boolean) {
  return !cancelled && overPage;
}

/** @param point Page-local CSS pixels. @param frame Target page geometry. @param aspect Ink height divided by width.
 * @param margin Stroke radius in points. @returns Centred, fitted ink bounds in PDF coordinates.
 */
export function signatureBounds(point: Point, frame: PageFrame, aspect: number, margin: number) {
  const crop = frame.cropBox;
  const center = screenToPdf(point, frame);
  const width = Math.max(0, Math.min(SIGNATURE_WIDTH, crop.width - 2 * margin, (crop.height - 2 * margin) / aspect));
  const height = width * aspect;
  return {
    x: Math.max(crop.x + margin, Math.min(center.x - width / 2, crop.x + crop.width - width - margin)),
    y: Math.max(crop.y + margin, Math.min(center.y - height / 2, crop.y + crop.height - height - margin)),
    width,
    height,
  };
}
