/** Names and colours for showing annotations in the interface. */
import type { Annotation, Rgb } from "@pdf-editor/core";

/** What each kind is called in labels, toasts and screen readers. */
export const ANNOTATION_NAMES: Record<Annotation["kind"], string> = {
  highlight: "Highlight",
  ink: "Drawing",
  square: "Rectangle",
  textBox: "Text box",
  other: "Annotation",
};

/**
 * A CSS colour from 0–255 channels.
 * @param color The colour.
 * @returns `rgb(r g b)`.
 */
export function cssColor(color: Rgb): string {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}
