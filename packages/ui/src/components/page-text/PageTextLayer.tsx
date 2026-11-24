import { pageHit } from "./page-hit";
import { commitPageDraft } from "./draft-commands";
import { selectWord } from "./select-word";
import { useTextSelection } from "../../state/text-selection-store";
import {
  movePageText,
  pageFrame,
  pdfRectToScreen,
  screenDeltaToPdf,
  screenToPdf,
  type PageTextObject,
  type ScreenPoint,
  type TextRun,
} from "@pdf-editor/core";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { usePageTextObjects } from "../annotations/use-page-annotations";
import type { PageDrawInfo } from "../viewer/use-page-geometry";
import { DraggedText } from "./DraggedText";
import { PageTextEditor } from "./PageTextEditor";
import { SelectedText } from "./SelectedText";
import { useSelectText } from "./use-select-text";
import { useTextDrag } from "./use-text-drag";

const NewTextEditor = lazy(async () => ({ default: (await import("../annotations/NewTextEditor")).NewTextEditor }));

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
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The page's own text, made editable. With Select, double-click a word to select it. With Edit text,
 * every piece of text is outlined: click to change it, drag (or use the arrow keys) to move it.
 * Sits under the annotation layer, which only catches presses on annotations.
 * @param props The page, the zoom and the page's on-screen size.
 * @returns An SVG the size of the page, plus the editor or drag preview when active.
 */
export function PageTextLayer({ page, zoom, width, height }: PageTextLayerProps) {
  const { session } = useEditorServices();
  const tool = useAnnotationUi((state) => state.tool);
  const frame = useMemo(
    () => pageFrame(page.sourceGeometry, page.rotation, zoom),
    [page.sourceGeometry, page.rotation, zoom],
  );
  const objects = usePageTextObjects(page.id, page.revision, tool === "editText");
  const [editing, setEditing] = useState<PageTextObject | null>(null);

  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const request = useRef(0);
  const move = (object: PageTextObject, dx: number, dy: number) =>
    session.dispatch((content) => movePageText(content, page.id, object, { dx, dy }));
  const drag = useTextDrag(frame, move, setEditing);
  const selectText = useSelectText(page.id, frame);
  // The page's fresh text (read after a move, as the page redraws) replaces the drag preview.
  const { clear } = drag;
  useEffect(clear, [objects, clear]);

  const touchStart = useRef<ScreenPoint | null>(null);
  const lastTap = useRef<{ at: ScreenPoint; time: number } | null>(null);
  useEffect(() => {
    /** @returns Nothing. */
    const invalidate = () => {
      request.current++;
    };
    document.addEventListener("pointerdown", invalidate, true);
    return () => {
      invalidate();
      document.removeEventListener("pointerdown", invalidate, true);
    };
  }, [page.id, page.revision, tool, frame]);

  /** @param at The on-page screen position. @returns Completion of the hit test. */
  const editAt = async (at: ScreenPoint) => {
    const point = screenToPdf(at, frame);
    const ticket = ++request.current;
    const found = await pageHit(session, page.id, point).catch(() => undefined);
    if (ticket !== request.current || useAnnotationUi.getState().tool !== "select") return;
    if (found === null) setAt(at);
    else if (found && found !== "occupied") {
      const selection = await selectWord(session, page.id, point, found).catch(() => null);
      if (ticket === request.current && useAnnotationUi.getState().tool === "select" && selection?.text) {
        useTextSelection.getState().select({ ...selection, pageId: page.id, settled: true });
      }
    }
  };

  /** @param runs The changed runs. @param offset The committed translation in screen pixels. @returns Nothing. */
  const finish = (runs: readonly TextRun[] | null, offset?: { x: number; y: number }) => {
    const object = editing;
    setEditing((current) => (current === object ? null : current));
    const delta = screenDeltaToPdf(offset ?? { x: 0, y: 0 }, frame);
    if (object) commitPageDraft(session, page.id, object, { runs, delta });
  };

  /** @param event The released Select pointer. @returns Nothing. */
  function release(event: PointerEvent<SVGRectElement>) {
    selectText.onPointerUp(event);
    const start = touchStart.current;
    touchStart.current = null;
    if (
      !start ||
      !event.isPrimary ||
      event.pointerType !== "touch" ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
    ) {
      lastTap.current = null;
      return;
    }
    const previous = lastTap.current;
    const now = event.timeStamp;
    lastTap.current = { at: start, time: now };
    if (!previous || now - previous.time > 300 || Math.hypot(start.x - previous.at.x, start.y - previous.at.y) > 16) {
      return;
    }
    lastTap.current = null;
    const box = event.currentTarget.getBoundingClientRect();
    void editAt({ x: event.clientX - box.left, y: event.clientY - box.top });
  }

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
        {tool === "select" && (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            className="pointer-events-auto cursor-text"
            onDoubleClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              void editAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
            }}
            {...selectText}
            onPointerDown={(event) => {
              touchStart.current = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
              selectText.onPointerDown(event);
            }}
            onPointerUp={release}
            onPointerCancel={() => {
              lastTap.current = null;
              touchStart.current = null;
              selectText.onPointerCancel();
            }}
          />
        )}
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
                className={`pointer-events-auto cursor-text touch-none fill-transparent stroke-paper-focus/35 transition-[fill,stroke] duration-(--duration-press) outline-none hover:fill-paper-focus/8 hover:stroke-paper-focus focus-visible:stroke-paper-focus active:cursor-grabbing ${hidden === object.id ? "invisible" : ""}`}
                strokeWidth={1}
                strokeDasharray="4 3"
                onKeyDown={(event) => onKeyDown(event, object)}
                {...drag.handlersFor(object)}
              />
            );
          })}
      </svg>
      {drag.moving && (
        <DraggedText pageId={page.id} object={drag.moving.object} offset={drag.moving.offset} frame={frame} />
      )}
      {tool === "select" && <SelectedText pageId={page.id} frame={frame} width={width} height={height} />}
      {at && tool === "select" && (
        <Suspense fallback={null}>
          <NewTextEditor at={at} pageId={page.id} revision={page.revision} frame={frame} onDone={() => setAt(null)} />
        </Suspense>
      )}
      {editing && (
        <PageTextEditor
          key={editing.id}
          object={editing}
          pageId={page.id}
          revision={page.revision}
          frame={frame}
          onDone={finish}
        />
      )}
    </>
  );
}
