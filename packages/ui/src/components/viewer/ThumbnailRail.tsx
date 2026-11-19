import { layoutPages, sizesAtWidth, visibleRange } from "@pdf-editor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocument } from "../../editor/hooks";
import { useElementSize } from "../../hooks/use-element-size";
import { LayoutGrid } from "lucide-react";
import { useViewer } from "../../state/viewer-store";
import { IconButton } from "../primitives/IconButton";
import { PageCanvas } from "./PageCanvas";
import { usePageDrawInfo } from "./use-page-geometry";

const THUMB_WIDTH = 104;
const CAPTION_HEIGHT = 26;
const SPACING = { gap: 12, padding: 12 };
/** Thumbnails render after every main page that is waiting. */
const THUMBNAIL_PRIORITY = 1000;

/**
 * The page thumbnail sidebar (wide layout). Virtualized like the main viewport; clicking a page
 * scrolls the document to it, and the rail follows the page being read.
 * @returns The rail.
 */
export function ThumbnailRail() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(scrollRef);
  const [scrollTop, setScrollTop] = useState(0);
  const { currentPage, goToPage, setMode } = useViewer();
  const pageCount = useDocument((state) => state.pages.length);
  const pages = usePageDrawInfo();
  const layout = useMemo(() => layoutPages(sizesAtWidth(pages.map((page) => page.size), THUMB_WIDTH), { ...SPACING, extraHeight: CAPTION_HEIGHT }), [pages]);

  // Keep the current page's thumbnail in view.
  useEffect(() => {
    const element = scrollRef.current;
    const box = layout.boxes[currentPage];
    if (!element || !box) return;
    if (box.top < element.scrollTop || box.top + box.height > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: box.top - SPACING.padding });
    }
  }, [currentPage, layout]);

  const range = visibleRange(layout, scrollTop, viewport.height, 2);
  const mounted = range ? layout.boxes.slice(range.first, range.last + 1) : [];

  return (
    <nav aria-label="Pages" className="grid min-h-0 grid-rows-[auto_1fr] border-r border-divider bg-rail">
      <div className="flex items-center gap-2 pt-2 pr-2 pb-1 pl-4">
        <h2 className="flex-1 font-hand text-[1.44rem] font-normal">{pageCount === 1 ? "Page" : "Pages"}</h2>
        <IconButton icon={LayoutGrid} label="Organize pages" onClick={() => setMode("organize")} />
      </div>
      <div ref={scrollRef} onScroll={() => setScrollTop(scrollRef.current?.scrollTop ?? 0)} className="min-h-0 overflow-y-auto">
        <ol className="relative" style={{ height: layout.totalHeight }}>
          {mounted.map((box) => {
            const page = pages[box.index]!;
            const isCurrent = box.index === currentPage;
            const pageHeight = box.height - CAPTION_HEIGHT;
            return (
              <li key={page.id} className="absolute inset-x-0 flex justify-center" style={{ top: box.top }}>
                <button
                  type="button"
                  onClick={() => goToPage(box.index)}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Page ${box.index + 1}`}
                  className="group grid justify-items-center gap-1.5 rounded-sm transition-transform duration-(--duration-press) ease-out active:scale-(--press-scale)"
                >
                  <PageCanvas
                    docId={page.docId}
                    pageIndex={page.sourceIndex}
                    rotation={page.rotation}
                    width={THUMB_WIDTH}
                    height={pageHeight}
                    priority={THUMBNAIL_PRIORITY + Math.abs(box.index - currentPage)}
                    className="border border-paper-line outline-offset-3 group-hover:shadow-2 group-aria-[current=page]:outline-2 group-aria-[current=page]:outline-signal"
                  />
                  { !isCurrent && 
                    <span className="font-mono text-sm text-muted">
                      {box.index + 1}
                    </span> 
                  }
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
