import { currentPageIndex, visibleRange } from "@pdf-editor/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import { useAnnotationUi } from "../../state/annotation-store";
import { useViewer } from "../../state/viewer-store";
import { AnnotationLayer } from "../annotations/AnnotationLayer";
import { PageTextLayer } from "../page-text/PageTextLayer";
import { useAnnotationShortcuts } from "../annotations/use-annotation-shortcuts";
import { PageCanvas } from "./PageCanvas";
import { SearchHighlight } from "./SearchHighlight";
import { usePageGeometry } from "./use-page-geometry";

interface PageViewportProps {
  readonly narrow: boolean;
}

/**
 * The scrolling document. Every page gets a correctly sized slot up front, but only pages in or next
 * to the view are mounted and rendered, so a 300-page file costs about as much as a 5-page one.
 * @param props Layout variant.
 * @returns The scroll area.
 */
export function PageViewport({ narrow }: PageViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(scrollRef);
  const [scrollTop, setScrollTop] = useState(0);
  const { zoomMode, currentPage, scrollRequest, reportZoom, reportCurrentPage } = useViewer();
  const spacing = useMemo(() => (narrow ? { gap: 12, padding: 8 } : { gap: 24, padding: 24 }), [narrow]);
  const { pages, zoom, layout } = usePageGeometry(zoomMode, viewport, spacing, currentPage);
  const selectAnnotation = useAnnotationUi((state) => state.select);
  const clearSearchHit = useViewer((state) => state.showSearchHit);
  useAnnotationShortcuts(true);

  useEffect(() => reportZoom(zoom), [zoom, reportZoom]);

  const current = currentPageIndex(layout, scrollTop, viewport.height);
  useEffect(() => reportCurrentPage(current), [current, reportCurrentPage]);

  // Keep the reading position when the zoom (and so every page's size) changes.
  const anchor = useRef<{ page: number; fraction: number; zoom: number } | null>(null);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previous = anchor.current;
    if (element && previous && previous.zoom !== zoom) {
      const box = layout.boxes[previous.page];
      if (box) element.scrollTop = box.top + previous.fraction * box.height - viewport.height * 0.4;
    }
    const box = layout.boxes[current];
    anchor.current = box
      ? { page: current, fraction: (scrollTop + viewport.height * 0.4 - box.top) / box.height, zoom }
      : null;
  }, [zoom, layout, current, scrollTop, viewport.height]);

  useEffect(() => {
    const box = scrollRequest ? layout.boxes[scrollRequest.page] : undefined;
    if (box) scrollRef.current?.scrollTo({ top: box.top - spacing.padding });
  }, [scrollRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // One state update per frame while scrolling.
  const frame = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setScrollTop(scrollRef.current?.scrollTop ?? 0));
  };

  const range = visibleRange(layout, scrollTop, viewport.height, 1);
  const contentWidth = Math.max(viewport.width, layout.maxWidth + spacing.padding * 2);
  const mounted = range ? layout.boxes.slice(range.first, range.last + 1) : [];

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      // A press anywhere but on an annotation lets go of the selected one.
      onPointerDown={(event) => {
        clearSearchHit(null);
        if (!(event.target as Element).closest("[data-annotation]")) selectAnnotation(null);
      }}
      tabIndex={0}
      aria-label="Document pages"
      className="relative min-h-0 overflow-auto bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
    >
      <div className="relative" style={{ height: layout.totalHeight, width: contentWidth }}>
        {mounted.map((box) => {
          const page = pages[box.index]!;
          return (
            <div
              key={page.id}
              role="img"
              data-page=""
              aria-label={`Page ${box.index + 1}`}
              className="absolute border border-paper-line"
              style={{ top: box.top, left: Math.max(spacing.padding, (contentWidth - box.width) / 2) }}
            >
              <PageCanvas
                docId={page.docId}
                pageIndex={page.sourceIndex}
                rotation={page.rotation}
                revision={page.revision}
                hideEditable
                width={box.width}
                height={box.height}
                priority={Math.abs(box.index - current)}
              />
              <SearchHighlight page={page} zoom={zoom} width={box.width} height={box.height} />
              <PageTextLayer page={page} zoom={zoom} width={box.width} height={box.height} />
              <AnnotationLayer page={page} zoom={zoom} width={box.width} height={box.height} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
