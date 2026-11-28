import {
  annotationRevisionOf,
  cssPageSize,
  displayedPageSize,
  docIdOf,
  layoutPages,
  resolveZoom,
  type PageGeometry as PageBoxes,
  type PageLayout,
  type Rotation,
  type ZoomMode,
} from "@pdf-editor/core";
import type { PageSize } from "@pdf-editor/shared";
import { useMemo } from "react";
import { useDocument } from "../../editor/hooks";

/** Stand-in geometry for a page whose source is unknown. */
const LETTER: PageBoxes = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 };

/** Everything needed to draw one page of the document, whatever file it came from. */
export interface PageDrawInfo {
  /** The page reference id (stable across reordering): use it as the React key. */
  readonly id: string;
  readonly docId: string;
  /** Page index inside its source file. */
  readonly sourceIndex: number;
  readonly rotation: Rotation;
  /** Size in points as shown (rotation applied). */
  readonly size: PageSize;
  /** Changes when the page's annotations or form values change, so its picture is redrawn. */
  readonly revision: number;
  /** The page's crop box and own rotation, for converting annotation coordinates. */
  readonly sourceGeometry: PageBoxes;
}

export interface PageGeometry {
  readonly pages: readonly PageDrawInfo[];
  readonly zoom: number;
  readonly layout: PageLayout;
}

/**
 * The document's pages as drawable items.
 * @returns One entry per page, in document order.
 */
export function usePageDrawInfo(): readonly PageDrawInfo[] {
  const sources = useDocument((state) => state.sources);
  const pages = useDocument((state) => state.pages);
  const annotationRevisions = useDocument((state) => state.annotationRevisions);
  return useMemo(
    () =>
      pages.map((page) => ({
        id: page.id,
        docId: docIdOf({ sources }, page) ?? "",
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
        size: displayedPageSize({ sources }, page),
        revision: annotationRevisionOf({ annotationRevisions }, page.id),
        sourceGeometry: sources[page.source]?.pages[page.sourceIndex] ?? LETTER,
      })),
    [sources, pages, annotationRevisions],
  );
}

/**
 * Pages, the resolved zoom and the scroll layout for the open document.
 * @param zoomMode Fit width, fit page or a percentage.
 * @param viewport The scroll area's size.
 * @param spacing Gap between pages and padding around them, in CSS pixels.
 * @param fitPage Index of the page to fit in fit-page mode (the current page).
 * @returns Everything the viewport needs to place pages.
 */
export function usePageGeometry(
  zoomMode: ZoomMode,
  viewport: { width: number; height: number },
  spacing: { gap: number; padding: number },
  fitPage: number,
): PageGeometry {
  const pages = usePageDrawInfo();

  const reference = useMemo(() => {
    if (zoomMode.kind === "fit-page") return pages[fitPage]?.size ?? pages[0]?.size;
    return pages.reduce<PageSize | undefined>(
      (widest, page) => (!widest || page.size.width > widest.width ? page.size : widest),
      undefined,
    );
  }, [pages, zoomMode.kind, fitPage]);

  const available = {
    width: Math.max(1, viewport.width - spacing.padding * 2),
    height: Math.max(1, viewport.height - spacing.padding * 2),
  };
  const zoom = reference ? resolveZoom(zoomMode, available, reference) : 1;
  const layout = useMemo(
    () =>
      layoutPages(
        pages.map((page) => cssPageSize(page.size, zoom)),
        spacing,
      ),
    [pages, zoom, spacing],
  );

  return { pages, zoom, layout };
}
