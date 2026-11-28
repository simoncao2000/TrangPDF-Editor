import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check } from "lucide-react";
import { memo, useRef } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import type { PageMenuAnchor } from "./PageMenu";
import { PageCanvas } from "../viewer/PageCanvas";
import type { PageDrawInfo } from "../viewer/use-page-geometry";

/** Width of a page thumbnail in the organize grid, in CSS pixels. */
export const TILE_PAGE_WIDTH = 128;
/** Tiles render top to bottom, after any page the reader is looking at. */
const TILE_PRIORITY = 100;

interface PageTileProps {
  readonly page: PageDrawInfo;
  readonly number: number;
  readonly selected: boolean;
  readonly narrow: boolean;
  readonly held: boolean;
  readonly dimmed: boolean;
  readonly onMenu: (anchor: PageMenuAnchor) => void;
  /** Part of a group being dragged (not the one under the pointer): shown faded. */
  readonly carried: boolean;
  /** Receives this tile's page id. Pass a stable function so unchanged tiles skip re-rendering. */
  readonly onSelect: (pageId: string) => void;
  /** Receives this tile's page index. Pass a stable function too. */
  readonly onOpen: (pageIndex: number) => void;
}

/**
 * One page in the organize grid: a thumbnail you can click to select and drag to move.
 * Keyboard: Space toggles selection, M picks it up to move with the arrows, Enter opens it.
 * Memoised: a click re-renders only the tiles whose props changed.
 * @param props The page, its number and selection state, and the handlers.
 * @returns The sortable tile.
 */
export const PageTile = memo(function PageTile(props: PageTileProps) {
  const { page, number, selected, carried, onSelect, onOpen, narrow, held, dimmed, onMenu } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const paperRef = useRef<HTMLSpanElement>(null);
  const measured = useElementSize(paperRef).width;
  const width = narrow && measured > 0 ? measured : TILE_PAGE_WIDTH;
  const height = (page.size.height / page.size.width) * width;
  const faded = dimmed || carried || (isDragging && !held);
  const opacity = dimmed ? "opacity-[.32]" : faded ? "opacity-30" : "";
  const tileLayout = narrow ? "touch-pan-y p-0" : "touch-none p-1.5 sm:p-2";
  const lifted = narrow && held;
  const paperStyle = [
    "relative block border border-paper-line duration-(--duration-enter) ease-out",
    narrow ? "w-full overflow-hidden transition-[scale,box-shadow]" : "transition-transform",
    lifted ? "shadow-lift motion-safe:scale-105" : narrow ? "shadow-1" : "",
    selected ? "outline-2 outline-offset-2 outline-signal" : "",
    !selected && !lifted ? "group-hover:shadow-2" : "",
    selected && !narrow ? "scale-[0.94]" : "",
  ].join(" ");

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative list-none self-start transition-opacity duration-(--duration-enter) ease-out ${lifted ? "z-1" : ""} ${opacity}`}
    >
      <div
        {...attributes}
        {...listeners}
        data-page-tile=""
        role="option"
        aria-selected={selected}
        aria-label={`Page ${number}`}
        onClick={() => onSelect(page.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!narrow) onMenu({ id: page.id, element: event.currentTarget });
        }}
        onKeyDown={(event) => {
          listeners?.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            onMenu({ id: page.id, element: event.currentTarget });
          } else if (event.key === " ") {
            event.preventDefault();
            onSelect(page.id);
          } else if (event.key === "Enter") {
            event.preventDefault();
            onOpen(number - 1);
          }
        }}
        className={`group grid cursor-grab justify-items-center gap-2 rounded-sm outline-none select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing aria-selected:bg-signal-soft ${tileLayout}`}
      >
        <span ref={narrow ? paperRef : undefined} className={paperStyle}>
          <PageCanvas
            docId={page.docId}
            pageIndex={page.sourceIndex}
            rotation={page.rotation}
            revision={page.revision}
            width={width}
            height={height}
            priority={TILE_PRIORITY + number}
          />
        </span>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 m-auto grid size-5.5 place-items-center rounded-full border-[1.5px] transition-[opacity,scale] duration-(--duration-pop) ease-out ${
            selected
              ? "border-signal bg-signal text-raised opacity-100"
              : "border-paper-muted bg-paper/85 opacity-0 group-hover:opacity-100"
          }`}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className={`rounded-pill px-1.5 font-mono text-xs ${selected ? "bg-signal text-raised" : "text-muted"}`}>
          {number}
        </span>
      </div>
    </li>
  );
});
