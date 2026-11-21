/**
 * Zoom and pixel-size math. Components never do this themselves (architecture §8.3).
 * Zoom 1 means 100%: one PDF point is 96/72 CSS pixels, so a Letter page is 816 × 1056 at 100%.
 */
import type { PageSize } from "@pdf-editor/shared";

/** CSS pixels per PDF point at 100% zoom. */
export const CSS_PIXELS_PER_POINT = 96 / 72;
/** The zoom steps offered by the zoom buttons and menu. */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Largest bitmap rendered in one piece (architecture §8.2: 16 megapixels on desktop). */
export const MAX_BITMAP_PIXELS = 16_000_000;

export type ZoomMode =
  { readonly kind: "fit-width" } | { readonly kind: "fit-page" } | { readonly kind: "percent"; readonly zoom: number };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Keeps a zoom inside the supported range.
 * @param zoom Any zoom factor.
 * @returns `zoom` clamped to [MIN_ZOOM, MAX_ZOOM].
 */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Turns a zoom mode into a concrete zoom factor.
 * @param mode Fit width, fit page, or a fixed percentage.
 * @param viewport Space available for the page in CSS pixels (padding already removed).
 * @param page The page to fit, in points.
 * @returns The zoom factor (1 = 100%).
 */
export function resolveZoom(mode: ZoomMode, viewport: Size, page: PageSize): number {
  if (mode.kind === "percent") return clampZoom(mode.zoom);
  const widthZoom = viewport.width / (page.width * CSS_PIXELS_PER_POINT);
  if (mode.kind === "fit-width") return clampZoom(widthZoom);
  const heightZoom = viewport.height / (page.height * CSS_PIXELS_PER_POINT);
  return clampZoom(Math.min(widthZoom, heightZoom));
}

/**
 * Picks the next preset above or below the current zoom.
 * @param zoom The current zoom factor.
 * @param direction 1 to zoom in, -1 to zoom out.
 * @returns The nearest preset in that direction, or the end of the range.
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const epsilon = 0.001;
  if (direction === 1) return ZOOM_PRESETS.find((preset) => preset > zoom + epsilon) ?? clampZoom(zoom);
  return [...ZOOM_PRESETS].reverse().find((preset) => preset < zoom - epsilon) ?? clampZoom(zoom);
}

/**
 * Size of a page on screen.
 * @param page Page size in points.
 * @param zoom Zoom factor.
 * @returns Width and height in CSS pixels.
 */
export function cssPageSize(page: PageSize, zoom: number): Size {
  return { width: page.width * CSS_PIXELS_PER_POINT * zoom, height: page.height * CSS_PIXELS_PER_POINT * zoom };
}

/**
 * Pixel size to render a page at so it is sharp on the current screen, capped to the bitmap limit.
 * @param css The page's on-screen size in CSS pixels.
 * @param devicePixelRatio `window.devicePixelRatio`.
 * @param maxPixels Largest bitmap allowed; bigger renders are scaled down (tiling comes later).
 * @returns Whole-pixel width and height, at least 1 × 1.
 */
export function bitmapSize(css: Size, devicePixelRatio: number, maxPixels: number = MAX_BITMAP_PIXELS): Size {
  let width = css.width * devicePixelRatio;
  let height = css.height * devicePixelRatio;
  const pixels = width * height;
  if (pixels > maxPixels) {
    const shrink = Math.sqrt(maxPixels / pixels);
    width *= shrink;
    height *= shrink;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}
