import { editPageText, movePageText, pageFrame, pdfRectToScreen, screenDeltaToPdf, screenToPdf, type PageTextObject } from "@pdf-editor/core";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { usePageTextObjects } from "../annotations/use-page-annotations";
import type { PageDrawInfo } from "../viewer/use-page-geometry";
import { DraggedText } from "./DraggedText";
import { PageTextEditor } from "./PageTextEditor";
import { useTextDrag } from "./use-text-drag";

interface PageTextLayerProps {
  readonly page: PageDrawInfo;
  readonly zoom: number;
  /** The page's on-screen size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

/** Space between page text and its outline in Edit text mode, in CSS pixels. */
const OUTLINE_GAP = 2;
/** Arrow keys move text this far, in screen pixels (Shift: ten times). */
const NUDGE = 1;
const NUDGE_FAR = 10;
const ARROWS: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * The page's own text, made editable. With Select, double-click text to change it. With Edit text,
 * every piece of text is outlined: click to change it, drag (or use the arrow keys) to move it.
 * Sits under the annotation layer, which only catches presses on annotations.
 * @param props The page, the zoom and the page's on-screen size.
 * @returns An SVG the size of the page, plus the editor or drag preview when active.
 */
export function PageTextLayer({ page, zoom, width, height }: PageTextLayerProps) {
  const { session } = useEditorServices();
  const tool = useAnnotationUi((state) => state.tool);
  const frame = useMemo(() => pageFrame(page.sourceGeometry, page.rotation, zoom), [page.sourceGeometry, page.rotation, zoom]);
  const objects = usePageTextObjects(page.id, page.revision, tool === "editText");
  const [editing, setEditing] = useState<PageTextObject | null>(null);

  const move = (object: PageTextObject, dx: number, dy: number) => session.dispatch((content) => movePageText(content, page.id, object, dx, dy));
  const drag = useTextDrag(frame, move, setEditing);
  // The page's fresh text (read after a move, as the page redraws) replaces the drag preview.
  const { clear } = drag;
  useEffect(clear, [objects, clear]);

  /** Double-click with Select: edit the text under the pointer, if there is any. */
  const editAt = async (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const point = screenToPdf({ x: event.clientX - box.left, y: event.clientY - box.top }, frame);
    const found = await session.textObjectAt(page.id, point).catch(() => null);
    if (found) setEditing(found);
  };

  const finish = (text: string | null) => {
    const object = editing;
    setEditing(null);
    if (!object || text === null || text === object.text) return;
    session.dispatch((content) => editPageText(content, page.id, object, text));
  };

  const onKeyDown = (event: KeyboardEvent<SVGElement>, object: PageTextObject) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setEditing(object);
      return;
    }
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const delta = screenDeltaToPdf({ x: arrow[0] * step, y: arrow[1] * step }, frame);
    move(object, delta.x, delta.y);
  };

  const hidden = editing?.id ?? drag.moving?.object.id;

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
        {tool === "select" && <rect x={0} y={0} width={width} height={height} fill="transparent" className="pointer-events-auto" onDoubleClick={(event) => void editAt(event)} />}
        {tool === "editText" &&
          objects.map((object) => {
            const box = pdfRectToScreen(object.bounds, frame);
            return (
              <rect
                key={object.id}
                data-annotation=""
                role="button"
                tabIndex={0}
                aria-label={`Edit text: ${object.text}`}
                aria-description="Click to change, drag or use the arrow keys to move"
                x={box.left - OUTLINE_GAP}
                y={box.top - OUTLINE_GAP}
                width={box.width + 2 * OUTLINE_GAP}
                height={box.height + 2 * OUTLINE_GAP}
                rx={2}
                className={`pointer-events-auto cursor-text touch-none fill-transparent stroke-paper-focus/35 outline-none transition-[fill,stroke] duration-(--duration-press) hover:fill-paper-focus/8 hover:stroke-paper-focus focus-visible:stroke-paper-focus active:cursor-grabbing ${hidden === object.id ? "invisible" : ""}`}
                strokeWidth={1}
                strokeDasharray="4 3"
                onKeyDown={(event) => onKeyDown(event, object)}
                {...drag.handlersFor(object)}
              />
            );
          })}
      </svg>
      {drag.moving && <DraggedText pageId={page.id} object={drag.moving.object} offset={drag.moving.offset} frame={frame} />}
      {editing && <PageTextEditor key={editing.id} object={editing} frame={frame} onDone={finish} />}
    </>
  );
}
