/** Turning drawn strokes into a saved signature, and a saved signature into ink on a page. */
import type { InkAnnotation, Rgb } from "@pdf-editor/core";
import type { PdfPoint } from "@pdf-editor/shared";
import type { SavedSignature } from "../../state/signature-store";

type Point = { readonly x: number; readonly y: number };

/**
 * Normalises strokes drawn on a pad into a saved signature: cropped to their ink, 1 wide.
 * @param id A fresh id.
 * @param strokes Strokes in pad pixels, y down.
 * @returns The signature, or `null` when nothing was drawn.
 */
export function signatureFrom(id: string, strokes: readonly (readonly Point[])[]): SavedSignature | null {
  const points = strokes.flat();
  if (points.length === 0) return null;
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const width = Math.max(1, Math.max(...points.map((p) => p.x)) - left);
  const height = Math.max(1, Math.max(...points.map((p) => p.y)) - top);
  return {
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
export function placeSignature(signature: SavedSignature, at: PdfPoint, look: SignatureLook): InkAnnotation {
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
