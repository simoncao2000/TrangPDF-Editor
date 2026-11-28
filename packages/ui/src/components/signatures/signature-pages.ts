import type { EditableAnnotation, PageFrame, ScreenPoint } from "@pdf-editor/core";
import { create } from "zustand";
import { useViewer } from "../../state/viewer-store";

interface SignaturePage {
  pageId: string;
  frame: PageFrame;
  onCreate(annotation: EditableAnnotation): void;
}

export const signaturePages = new WeakMap<Element, SignaturePage>();
export const useSignatureDrag = create(() => ({ dragging: false }));

/** @param point Client coordinates, or omitted for keyboard placement.
 * @returns The mounted page and page-local drop point.
 */
export function signatureTarget(point?: ScreenPoint) {
  const number = useViewer.getState().currentPage + 1;
  const page = point
    ? document.elementFromPoint(point.x, point.y)?.closest("[data-page]")
    : document.querySelector(`[data-page][aria-label="Page ${number}"]`);
  const surface = page?.querySelector("[data-signature-page]");
  const target = surface && signaturePages.get(surface);
  const viewer = page?.closest<HTMLElement>("[data-document-pages]");
  if (!page || !target || !surface || !viewer) return null;
  const box = surface.getBoundingClientRect();
  const view = viewer.getBoundingClientRect();
  const bottom = view.bottom - (parseFloat(getComputedStyle(viewer).scrollPaddingBottom) || 0);
  const center = point ?? {
    x: (Math.max(view.left, box.left) + Math.min(view.right, box.right)) / 2,
    y: (Math.max(view.top, box.top) + Math.min(bottom, box.bottom)) / 2,
  };
  return { ...target, page, surface, point: { x: center.x - box.left, y: center.y - box.top } };
}
