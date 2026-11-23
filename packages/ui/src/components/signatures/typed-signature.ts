import type { SignatureInk, SignatureStyle, TypedSignature } from "../../state/signature-store";

export const SIGNATURE_STYLES = {
  flowing: { label: "Flowing", family: "Great Vibes" },
  classic: { label: "Classic", family: "Allura" },
  // This Caveat package lacks a full Vietnamese subset.
  casual: { label: "Casual", family: "Caveat Variable, Playpen Sans Variable" },
  rounded: { label: "Rounded", family: "Playpen Sans Variable" },
} satisfies Record<SignatureStyle, { label: string; family: string }>;

export const SIGNATURE_INKS = {
  black: "#1d1d1b",
  blue: "#1f3f8f",
} satisfies Record<SignatureInk, string>;

const FONT_SIZE = 52;
const RENDER_SCALE = 4;
const MAX_CANVAS_SIDE = 4096;

interface InkBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Sizes a canvas around the measured glyph bounds, with one spare pixel on each edge for antialiasing.
 * @param metrics The browser's measurements in CSS pixels.
 * @returns Canvas dimensions, scale and the origin of the text baseline.
 */
export function signatureCanvasLayout(
  metrics: Pick<
    TextMetrics,
    "actualBoundingBoxLeft" | "actualBoundingBoxRight" | "actualBoundingBoxAscent" | "actualBoundingBoxDescent"
  >,
) {
  const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const scale = Math.min(RENDER_SCALE, (MAX_CANVAS_SIDE - 2) / Math.max(width, height));
  return {
    width: Math.ceil(width * scale) + 2,
    height: Math.ceil(height * scale) + 2,
    scale,
    x: 1 + metrics.actualBoundingBoxLeft * scale,
    y: 1 + metrics.actualBoundingBoxAscent * scale,
  };
}

/**
 * Finds the tight rectangle around all nontransparent pixels, including antialiased edges.
 * @param pixels The rendered pixels, in RGBA order.
 * @returns The ink rectangle, or null if the image is empty.
 */
export function signatureInkBounds({ data, width, height }: ImageData): InkBounds | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Renders a typed signature using the bundled font, at four times the preview's resolution for ordinary names.
 * @param signature The typed name, style and ink.
 * @returns The transparent PNG bytes and its trimmed height-to-width ratio.
 */
export async function renderTypedSignature(signature: TypedSignature) {
  const font = `${FONT_SIZE}px ${SIGNATURE_STYLES[signature.style].family}`;
  await document.fonts.load(font, signature.text);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Signature canvas unavailable");
  context.font = font;
  const layout = signatureCanvasLayout(context.measureText(signature.text));
  canvas.width = layout.width;
  canvas.height = layout.height;
  context.setTransform(layout.scale, 0, 0, layout.scale, layout.x, layout.y);
  context.font = font;
  context.fillStyle = SIGNATURE_INKS[signature.ink];
  context.fillText(signature.text, 0, 0);

  const bounds = signatureInkBounds(context.getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) throw new Error("The signature has no visible ink");
  const ink = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  context.putImageData(ink, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("Signature PNG unavailable");
  return { bytes: await png.arrayBuffer(), aspect: bounds.height / bounds.width };
}
