import { useState } from "react";
import { useDocument } from "../../editor/hooks";
import { useViewer } from "../../state/viewer-store";
import { IconButton } from "../primitives/IconButton";
import { ZoomMenu } from "./ZoomMenu";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";

/**
 * Floating page number box and zoom control at the foot of the canvas (wide layout).
 * Numbers are tabular so they never jump while scrolling.
 * @returns The control bar.
 */
export function PageControl() {
  const pageCount = useDocument((state) => state.pages.length);
  const { currentPage, goToPage, zoomBy } = useViewer();
  /** What the user is typing in the page box; `null` shows the current page. */
  const [draft, setDraft] = useState<string | null>(null);

  const commitPage = () => {
    const page = Number.parseInt(draft ?? "", 10);
    if (Number.isFinite(page) && page >= 1 && page <= pageCount) goToPage(page - 1);
    setDraft(null);
  };

  return (
    <div
      role="group"
      aria-label="Page and zoom"
      className="flex h-10 items-center gap-0.5 rounded-xs border border-line bg-raised p-0.5 text-sm tabular-nums"
    >
      <IconButton
        icon={ChevronUp}
        label="Previous page"
        disabled={currentPage === 0}
        onClick={() => goToPage(currentPage - 1)}
      />
      <label className="flex items-center gap-1.5 px-1 font-mono text-muted">
        <input
          value={draft ?? String(currentPage + 1)}
          onFocus={(event) => {
            setDraft(String(currentPage + 1));
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={commitPage}
          onKeyDown={(event) => event.key === "Enter" && commitPage()}
          inputMode="numeric"
          aria-label="Page number"
          className="h-6.5 w-9 rounded-xs border border-line bg-raised text-center font-semibold text-ink"
        />
        of {pageCount}
      </label>
      <IconButton
        icon={ChevronDown}
        label="Next page"
        disabled={currentPage >= pageCount - 1}
        onClick={() => goToPage(currentPage + 1)}
      />
      <span className="mx-1 h-5 w-px bg-divider" aria-hidden="true" />
      <IconButton icon={Minus} label="Zoom out" onClick={() => zoomBy(-1)} />
      <ZoomMenu />
      <IconButton icon={Plus} label="Zoom in" onClick={() => zoomBy(1)} />
    </div>
  );
}
