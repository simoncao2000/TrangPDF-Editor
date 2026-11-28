import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../primitives/Button";
import { Sheet } from "../primitives/Sheet";
import { PageCanvas } from "../viewer/PageCanvas";
import type { PageDrawInfo } from "../viewer/use-page-geometry";
import { moveTarget } from "./move-target";

interface MoveToSheetProps {
  readonly compactPreview?: boolean;
  readonly pages: readonly PageDrawInfo[];
  readonly id: string;
  readonly onDismiss: () => void;
  readonly onMove: (index: number) => void;
}

const STEP_STYLE = "grid h-11 w-11 place-items-center rounded-md hover:bg-hover disabled:text-disabled";

/**
 * Previews the result of moving a page before applying the existing reorder action.
 * @param props Pages in their current order, the moving page and sheet actions.
 * @returns The destination sheet.
 */
export function MoveToSheet({ pages, id, onDismiss, onMove, compactPreview }: MoveToSheetProps) {
  const original = pages.findIndex((page) => page.id === id);
  const [after, setAfter] = useState(original);
  const boundary = Math.min(after, pages.length);
  const target = moveTarget(
    pages.map((page) => page.id),
    new Set([id]),
    boundary,
  );
  const preview = pages.filter((page) => page.id !== id);
  const moving = pages[original];
  if (!moving) return null;
  preview.splice(target, 0, moving);
  const previewStart = Math.max(0, Math.min(target - 3, preview.length - 7));
  const visible = compactPreview ? preview.slice(previewStart, previewStart + 7) : preview;
  const title = `Move page ${original + 1}`;

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 text-base">
          <span>{boundary === 0 ? "Put it at the start" : "Put it after page"}</span>
          <div
            role="group"
            aria-label="After page"
            className="flex w-[136px] items-center rounded-xs border border-line"
          >
            <button
              type="button"
              aria-label="Earlier"
              disabled={boundary <= 0}
              className={STEP_STYLE}
              onClick={() => setAfter(boundary - 1)}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <output aria-live="polite" className="flex-1 text-center tabular-nums">
              {boundary}
            </output>
            <button
              type="button"
              aria-label="Later"
              disabled={boundary >= pages.length}
              className={STEP_STYLE}
              onClick={() => setAfter(boundary + 1)}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button aria-pressed={boundary === 0} onClick={() => setAfter(0)}>
            To the start
          </Button>
          <Button aria-pressed={boundary === pages.length} onClick={() => setAfter(pages.length)}>
            To the end
          </Button>
        </div>
        <ol
          aria-label="Resulting page order"
          className="flex items-end gap-1.5 overflow-x-auto rounded-lg bg-canvas p-3"
        >
          {visible.map((page) => (
            <li
              key={page.id}
              aria-current={page.id === id ? "true" : undefined}
              className="grid w-14 shrink-0 justify-items-center gap-1 text-[11px] text-muted tabular-nums aria-current:font-semibold aria-current:text-signal"
            >
              <PageCanvas
                docId={page.docId}
                pageIndex={page.sourceIndex}
                rotation={page.rotation}
                revision={page.revision}
                width={56}
                height={(page.size.height / page.size.width) * 56}
                priority={200}
                className={page.id === id ? "-translate-y-1 ring-2 ring-signal" : "ring-1 ring-line"}
              />
              {pages.indexOf(page) + 1}
            </li>
          ))}
        </ol>
        <Button variant="primary" disabled={target === original} onClick={() => onMove(target)}>
          {title}
        </Button>
      </div>
    </Sheet>
  );
}
