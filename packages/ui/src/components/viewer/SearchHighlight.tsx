import { pageFrame, pdfRectToScreen } from "@pdf-editor/core";
import { useViewer } from "../../state/viewer-store";
import type { PageDrawInfo } from "./use-page-geometry";

interface SearchHighlightProps {
  readonly page: PageDrawInfo;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** Room around the matched text, in CSS pixels. */
const PAD = 2;

/**
 * Marks the search match picked in the command palette on its page, until the next search or a
 * click on the pages.
 * @param props The page, the zoom and the page's on-screen size.
 * @returns An SVG over the page, or nothing when the match is elsewhere.
 */
export function SearchHighlight({ page, zoom, width, height }: SearchHighlightProps) {
  const hit = useViewer((state) => (state.searchHit?.pageId === page.id ? state.searchHit : null));
  if (!hit) return null;
  const frame = pageFrame(page.sourceGeometry, page.rotation, zoom);
  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {hit.rects.map((rect, index) => {
        const box = pdfRectToScreen(rect, frame);
        return (
          <rect
            key={index}
            x={box.left - PAD}
            y={box.top - PAD}
            width={box.width + 2 * PAD}
            height={box.height + 2 * PAD}
            rx={2}
            className="animate-[search-hit_900ms_var(--curve-out)] fill-mark-highlight/60 stroke-paper-focus motion-reduce:animate-none"
            strokeWidth={1.5}
            style={{ mixBlendMode: "multiply" }}
          />
        );
      })}
    </svg>
  );
}
