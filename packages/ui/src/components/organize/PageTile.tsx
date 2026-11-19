import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check } from "lucide-react";
import { memo } from "react";
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
export const PageTile = memo(function PageTile({ page, number, selected, carried, onSelect, onOpen }: PageTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const height = (page.size.height / page.size.width) * TILE_PAGE_WIDTH;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative list-none self-start transition-opacity ${isDragging || carried ? "opacity-30" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        role="option"
        aria-selected={selected}
        aria-label={`Page ${number}`}
        onClick={() => onSelect(page.id)}
        onKeyDown={(event) => {
          listeners?.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === " ") {
            event.preventDefault();
            onSelect(page.id);
          } else if (event.key === "Enter") {
            event.preventDefault();
            onOpen(number - 1);
          }
        }}
        className="group grid cursor-grab touch-none justify-items-center gap-2 rounded-sm p-1.5 outline-none select-none focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing aria-selected:bg-signal-soft sm:p-2"
      >
        <span
          className={`relative block border border-paper-line transition-transform duration-(--duration-enter) ease-out ${selected ? "scale-[0.94] outline-2 outline-offset-2 outline-signal" : "group-hover:shadow-2"}`}
        >
          <PageCanvas docId={page.docId} pageIndex={page.sourceIndex} rotation={page.rotation} revision={page.revision} width={TILE_PAGE_WIDTH} height={height} priority={TILE_PRIORITY + number} />
        </span>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 m-auto grid size-5.5 place-items-center rounded-full border-[1.5px] transition-[opacity,scale] duration-(--duration-pop) ease-out ${
            selected ? "border-signal bg-signal text-raised opacity-100" : "border-paper-muted bg-paper/85 opacity-0 group-hover:opacity-100"
          }`}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className={`rounded-pill px-1.5 font-mono text-xs ${selected ? "bg-signal text-raised" : "text-muted"}`}>{number}</span>
      </div>
    </li>
  );
});
