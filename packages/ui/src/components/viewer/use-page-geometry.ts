import { cssPageSize, displayedPageSize, docIdOf, layoutPages, resolveZoom, type PageLayout, type Rotation, type ZoomMode } from "@pdf-editor/core";
import type { PageSize } from "@pdf-editor/shared";
import { useMemo } from "react";
import { useDocument } from "../../editor/hooks";

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
  return useMemo(
    () =>
      pages.map((page) => ({
        id: page.id,
        docId: docIdOf({ sources, pages }, page) ?? "",
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
        size: displayedPageSize({ sources, pages }, page),
      })),
    [sources, pages],
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
export function usePageGeometry(zoomMode: ZoomMode, viewport: { width: number; height: number }, spacing: { gap: number; padding: number }, fitPage: number): PageGeometry {
  const pages = usePageDrawInfo();

  const reference = useMemo(() => {
    if (zoomMode.kind === "fit-page") return pages[fitPage]?.size ?? pages[0]?.size;
    return pages.reduce<PageSize | undefined>((widest, page) => (!widest || page.size.width > widest.width ? page.size : widest), undefined);
  }, [pages, zoomMode.kind, fitPage]);

  const available = { width: Math.max(1, viewport.width - spacing.padding * 2), height: Math.max(1, viewport.height - spacing.padding * 2) };
  const zoom = reference ? resolveZoom(zoomMode, available, reference) : 1;
  const layout = useMemo(() => layoutPages(pages.map((page) => cssPageSize(page.size, zoom)), spacing), [pages, zoom, spacing]);

  return { pages, zoom, layout };
}
