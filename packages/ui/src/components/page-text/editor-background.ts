/**
 * The colour behind a line of page text, so the in-place editor can cover the original with the
 * page's own colour: white text on a navy band is edited on navy, not on white where it would
 * vanish. Read from the rendered page just outside the text's box.
 */
import type { Rgb } from "@pdf-editor/core";

/** Below this contrast the text would be unreadable on the sampled colour (WCAG ratio). */
const MIN_CONTRAST = 1.5;
/** Behind light text when the page's colour cannot be used. */
const DARK: Rgb = { r: 31, g: 31, b: 31 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** Colours are grouped by their top 5 bits per channel, so anti-aliasing noise counts as one colour. */
const BUCKET_SHIFT = 3;

/** RGBA pixels, like `ImageData`. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * The pixels on the edge of an image (its outermost rows and columns).
 * @param image The image.
 * @returns Their colours, each pixel once.
 */
export function ringOf(image: Pixels): Rgb[] {
  const colors: Rgb[] = [];
  const at = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    colors.push({ r: image.data[i]!, g: image.data[i + 1]!, b: image.data[i + 2]! });
  };
  for (let x = 0; x < image.width; x++) {
    at(x, 0);
    if (image.height > 1) at(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y++) {
    at(0, y);
    if (image.width > 1) at(image.width - 1, y);
  }
  return colors;
}

/**
 * The colour most pixels share: the page's background, even where text or a line crosses it.
 * @param colors Some pixels' colours.
 * @returns The average of the largest group of near-identical colours, or `null` for no pixels.
 */
export function dominantColor(colors: readonly Rgb[]): Rgb | null {
  const groups = new Map<number, Rgb[]>();
  for (const color of colors) {
    const key = ((color.r >> BUCKET_SHIFT) << 10) | ((color.g >> BUCKET_SHIFT) << 5) | (color.b >> BUCKET_SHIFT);
    groups.set(key, [...(groups.get(key) ?? []), color]);
  }
  const largest = [...groups.values()].reduce<Rgb[]>((best, group) => (group.length > best.length ? group : best), []);
  if (largest.length === 0) return null;
  const mean = (channel: keyof Rgb) =>
    Math.round(largest.reduce((sum, color) => sum + color[channel], 0) / largest.length);
  return { r: mean("r"), g: mean("g"), b: mean("b") };
}

/**
 * The WCAG contrast ratio between two colours.
 * @param a A colour.
 * @param b Another colour.
 * @returns From 1 (the same) to 21 (black on white).
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The editor's background: the page's colour around the text, unless the text would not read on
 * it (or there is none), then dark behind light text and white behind dark text.
 * @param around The colours just outside the text's box.
 * @param text The text's colour.
 * @returns The colour to edit on.
 */
export function editorBackground(around: readonly Rgb[], text: Rgb): Rgb {
  const page = dominantColor(around);
  if (page && contrastRatio(page, text) >= MIN_CONTRAST) return page;
  return contrastRatio(text, WHITE) >= contrastRatio(text, DARK) ? WHITE : DARK;
}

/**
 * Reads the rendered page's pixels in a box.
 * @param canvas The page's canvas.
 * @param box The box in the canvas's CSS pixels.
 * @returns The pixels, or `null` if the canvas is empty or cannot be read.
 */
export function pixelsIn(
  canvas: HTMLCanvasElement,
  box: { left: number; top: number; width: number; height: number },
): Pixels | null {
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0 || canvas.clientWidth === 0) return null;
  const scale = canvas.width / canvas.clientWidth;
  const left = Math.max(0, Math.floor(box.left * scale));
  const top = Math.max(0, Math.floor(box.top * scale));
  const right = Math.min(canvas.width, Math.ceil((box.left + box.width) * scale));
  const bottom = Math.min(canvas.height, Math.ceil((box.top + box.height) * scale));
  if (right <= left || bottom <= top) return null;
  return context.getImageData(left, top, right - left, bottom - top);
}

/**
 * A colour's relative luminance (WCAG).
 * @param color The colour.
 * @returns From 0 (black) to 1 (white).
 */
function luminance(color: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}
