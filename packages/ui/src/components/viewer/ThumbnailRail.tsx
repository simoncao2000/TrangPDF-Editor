import { visibleRange } from "@pdf-editor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import { LayoutGrid, Plus } from "lucide-react";
import { useViewMode } from "../../routing/hooks";
import { useViewer } from "../../state/viewer-store";
import { IconButton } from "../primitives/IconButton";
import { PanelHeader } from "../primitives/PanelHeader";
import { PageCanvas } from "./PageCanvas";
import { usePageDrawInfo } from "./use-page-geometry";

import { useDocumentActions } from "../../editor/use-document-actions";
import { useStartInsertPages } from "../../editor/use-insert-pages";
import { PageMenu, type PageMenuAnchor } from "../organize/PageMenu";
import {
  canDeletePage,
  CAPTION_HEIGHT,
  currentAfterMove,
  GAP,
  keyboardMove,
  railLayout,
  THUMB_WIDTH,
} from "./rail-reorder";
import { useRailDrag } from "./use-rail-drag";

/** Thumbnails render after every main page that is waiting. */
const THUMBNAIL_PRIORITY = 1000;

const thumbnailOutline = [
  "rounded-xs outline-offset-3 outline-signal",
  "group-focus-visible:outline-2 group-aria-[current=page]:outline-2",
].join(" ");

/**
 * The page thumbnail sidebar (wide layout). Virtualized like the main viewport; clicking a page
 * scrolls the document to it, and the rail follows the page being read.
 * @returns The rail.
 */
export function ThumbnailRail() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(scrollRef);
  const [scrollTop, setScrollTop] = useState(0);
  const { currentPage, goToPage, reportCurrentPage } = useViewer();
  const { setMode } = useViewMode();
  const pages = usePageDrawInfo();
  const firstSource = pages[0]?.docId;
  const [idleSource, setIdleSource] = useState<string>();
  useEffect(() => {
    if (!firstSource) return;
    const ready = () => setIdleSource(firstSource);
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(ready, { timeout: 1000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(ready, 100);
    return () => window.clearTimeout(timer);
  }, [firstSource]);
  const layout = useMemo(() => railLayout(pages.map((page) => page.size)), [pages]);
  const actions = useDocumentActions();
  const startInsert = useStartInsertPages(true);
  const [menu, setMenu] = useState<PageMenuAnchor | null>(null);
  const [keyboard, setKeyboard] = useState<{ index: number; target: number } | null>(null);
  const order = useMemo(() => pages.map((page) => page.id), [pages]);
  const [moved, setMoved] = useState<string | null>(null);

  /**
   * @param ids The page being moved.
   * @param target Destination among the remaining pages.
   * @returns Nothing. Restores focus after the virtual list updates.
   */
  function movePages(ids: string[], target: number) {
    actions.move(ids, target);
    setMoved(ids[0] ?? null);
  }

  const drag = useRailDrag({ order, scroll: scrollRef, boxes: layout.boxes, move: movePages, menu: setMenu });
  const lifted = drag.lift?.index ?? keyboard?.index;
  const gap = drag.lift?.gap ?? (keyboard && keyboard.target + Number(keyboard.target > keyboard.index));
  const menuIndex = menu ? pages.findIndex((page) => page.id === menu.id) : -1;

  /**
   * @param index Page to remove.
   * @returns Nothing. Hands keyboard focus to an adjacent page.
   */
  function deletePage(index: number) {
    const page = pages[index];
    if (!page || !canDeletePage(pages.length)) return;
    const neighbor = index + 1 < pages.length ? index + 1 : index - 1;
    scrollRef.current?.querySelector<HTMLButtonElement>(`[data-index="${neighbor}"]`)?.focus();
    actions.remove([page.id]);
  }

  // Keep the current page's thumbnail in view.
  useEffect(() => {
    const element = scrollRef.current;
    const index = currentAfterMove(order, moved, currentPage);
    const box = layout.boxes[index];
    if (!element || !box) return;
    if (box.top < element.scrollTop || box.top + box.height > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: box.top - GAP });
    }
    if (moved && order[index] === moved) {
      let frame: number;
      /** @returns Nothing. Waits for the virtual rail to mount the destination thumbnail. */
      function focusThumbnail() {
        const button = element?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`);
        if (button) {
          button.focus({ preventScroll: true });
          reportCurrentPage(index);
          goToPage(index);
          setMoved(null);
        } else {
          frame = requestAnimationFrame(focusThumbnail);
        }
      }
      frame = requestAnimationFrame(focusThumbnail);
      return () => cancelAnimationFrame(frame);
    }
  }, [currentPage, goToPage, layout, moved, order, reportCurrentPage]);

  const range = visibleRange(layout, scrollTop, viewport.height, 2);
  const mounted = range ? layout.boxes.slice(range.first, range.last + 1) : [];

  if (lifted !== undefined && !mounted.some((box) => box.index === lifted) && layout.boxes[lifted]) {
    const box = layout.boxes[lifted];
    if (range && lifted < range.first) mounted.unshift(box);
    else mounted.push(box);
  }

  return (
    <nav aria-labelledby="pages-title" className="grid min-h-0 grid-rows-[auto_1fr] border-r border-divider bg-rail">
      <PanelHeader
        id="pages-title"
        title="Pages"
        actions={<IconButton icon={LayoutGrid} label="Organize pages" onClick={() => setMode("organize")} />}
      />
      <div
        ref={scrollRef}
        onScroll={() => setScrollTop(scrollRef.current?.scrollTop ?? 0)}
        className="min-h-0 overflow-y-auto"
      >
        <ol className="relative" style={{ height: layout.totalHeight }}>
          {mounted.map((box) => {
            const page = pages[box.index];
            if (!page)
              return (
                <li key="add" className="absolute inset-x-0 flex justify-center" style={{ top: box.top }}>
                  <button
                    type="button"
                    aria-label="Add pages"
                    onClick={() => void startInsert()}
                    style={{ width: box.width, height: box.height - CAPTION_HEIGHT }}
                    className={
                      "grid place-items-center rounded-xs border border-dashed border-line text-muted hover:bg-hover"
                    }
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </li>
              );
            const isCurrent = box.index === currentPage;
            const pageHeight = box.height - CAPTION_HEIGHT;
            return (
              <li
                key={page.id}
                className="absolute inset-x-0 flex justify-center"
                style={{
                  top: box.top + (drag.lift?.index === box.index ? drag.lift.offset : 0),
                  zIndex: lifted === box.index ? 1 : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    if (!event.detail || !drag.suppressClick.current) goToPage(box.index);
                  }}
                  onPointerDown={(event) => drag.down(event, page.id, box.index)}
                  onPointerMove={drag.motion}
                  onPointerUp={(event) => drag.end(event, true)}
                  onLostPointerCapture={(event) => drag.end(event, false)}
                  onPointerCancel={(event) => drag.end(event, false)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const point = { x: event.clientX, y: event.clientY };
                    setMenu({ id: page.id, element: event.currentTarget, point });
                  }}
                  onBlur={() => setKeyboard(null)}
                  onKeyDown={(event) => {
                    if (event.ctrlKey || event.metaKey || event.altKey) return;
                    const key = event.key;
                    if (key === "ContextMenu" || (event.shiftKey && key === "F10")) {
                      setMenu({ id: page.id, element: event.currentTarget });
                    } else if (key === "Delete" || key === "Backspace") {
                      setKeyboard(null);
                      deletePage(box.index);
                    } else {
                      const next = keyboardMove(key, keyboard?.target ?? null, box.index, pages.length);
                      if (next === undefined) return;
                      if (typeof next === "number") {
                        setKeyboard({ index: box.index, target: next });
                        const dest = layout.boxes[next]!;
                        const el = scrollRef.current!;
                        if (dest.top < el.scrollTop) el.scrollTop = dest.top - GAP;
                        if (dest.top + dest.height > el.scrollTop + el.clientHeight) {
                          el.scrollTop = dest.top + dest.height - el.clientHeight + GAP;
                        }
                      } else {
                        if (next === "drop" && keyboard && keyboard.target !== box.index) {
                          movePages([page.id], keyboard.target);
                        }
                        if (next === "cancel") event.currentTarget.scrollIntoView({ block: "nearest" });
                        setKeyboard(null);
                      }
                    }
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  style={lifted === box.index ? { scale: "1.02" } : undefined}
                  data-index={box.index}
                  aria-haspopup="menu"
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Page ${box.index + 1}`}
                  className={[
                    "group grid touch-none justify-items-center gap-1.5 outline-none",
                    "transition-transform duration-(--duration-press) ease-out",
                    "select-none active:scale-(--press-scale)",
                    lifted === box.index ? "shadow-3" : "",
                  ].join(" ")}
                >
                  {idleSource === firstSource ? (
                    <PageCanvas
                      docId={page.docId}
                      pageIndex={page.sourceIndex}
                      rotation={page.rotation}
                      revision={page.revision}
                      width={THUMB_WIDTH}
                      height={pageHeight}
                      priority={THUMBNAIL_PRIORITY + Math.abs(box.index - currentPage)}
                      className={`${thumbnailOutline} border border-paper-line group-hover:shadow-2`}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={thumbnailOutline}
                      style={{ width: THUMB_WIDTH, height: pageHeight }}
                    />
                  )}
                  {!isCurrent && <span className="font-mono text-sm text-muted">{box.index + 1}</span>}
                </button>
              </li>
            );
          })}
          {gap != null && layout.boxes[gap] && (
            <li
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 z-10 h-0.5 bg-ink"
              style={{ top: layout.boxes[gap].top - GAP / 2 }}
            />
          )}
        </ol>
      </div>
      {menu && menuIndex >= 0 && (
        <PageMenu
          key={menu.id}
          rail={{
            count: pages.length,
            move: (index) => {
              movePages([menu.id], index);
              setMenu(null);
            },
          }}
          anchor={menu}
          number={menuIndex + 1}
          canMove={pages.length > 1}
          canDelete={canDeletePage(pages.length)}
          onDismiss={() => setMenu(null)}
          onDelete={() => {
            deletePage(menuIndex);
            setMenu(null);
          }}
        />
      )}
    </nav>
  );
}
