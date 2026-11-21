import {
  boundsOf,
  CSS_PIXELS_PER_POINT,
  pdfRectToScreen,
  screenRectToPdf,
  screenToPdf,
  type EditableAnnotation,
  type PageFrame,
  type ScreenPoint,
} from "@pdf-editor/core";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { useRef, useState, type PointerEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import type { DrawingTool, ToolStyle } from "../../state/annotation-store";
import { cssColor } from "./annotation-display";
import { CLICK_SLOP, extendStroke, rectBetween } from "./drawing-geometry";

type Draft =
  | { readonly kind: "ink"; readonly points: readonly ScreenPoint[] }
  | { readonly kind: "box"; readonly start: ScreenPoint; readonly end: ScreenPoint }
  | { readonly kind: "highlight"; readonly from: PdfPoint; readonly lines: readonly PdfRect[] };

interface DrawingSurfaceProps {
  readonly pageId: string;
  readonly tool: DrawingTool;
  readonly style: ToolStyle;
  readonly frame: PageFrame;
  readonly width: number;
  readonly height: number;
  /** Records a finished annotation. */
  onCreate(annotation: EditableAnnotation): void;
  /** Starts typing new page text where the user clicked (the Text box tool). */
  onTextAt(point: ScreenPoint): void;
}

const CURSORS: Record<DrawingTool, string> = {
  highlight: "cursor-text",
  ink: "cursor-crosshair",
  square: "cursor-crosshair",
  textBox: "cursor-text",
};

/**
 * The bounding box of some rectangles.
 * @param rects At least one rectangle.
 * @returns Their bounds.
 */
function boundsOfRects(rects: readonly PdfRect[]): PdfRect {
  return boundsOf(
    rects.flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ]),
  );
}

/**
 * Catches pointer input over a page while a drawing tool is in hand, shows the annotation as it is
 * being made, and hands it over when the pointer is released.
 *
 * Draw: each stroke becomes a drawing. Shape: drag a rectangle. Text box: click and type (the text
 * becomes page text). Highlight: drag across text; PDFium reports where the text is, line by line.
 * @param props The page, the tool and its style, the frame, and what to do with the result.
 * @returns A transparent SVG rectangle over the page, plus the preview.
 */
export function DrawingSurface({ pageId, tool, style, frame, width, height, onCreate, onTextAt }: DrawingSurfaceProps) {
  const { session } = useEditorServices();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Highlight preview: one text lookup at a time, always for the newest pointer position. */
  const lookingUp = useRef(false);
  const latestPoint = useRef<PdfPoint | null>(null);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const base = { id: "", color: style.color, opacity: style.opacity };

  const pointOf = (event: PointerEvent<SVGRectElement>): ScreenPoint => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const previewText = (from: PdfPoint): void => {
    const to = latestPoint.current;
    if (lookingUp.current || !to) return;
    latestPoint.current = null;
    lookingUp.current = true;
    session
      .textRects(pageId, from, to)
      .then((lines) =>
        setDraft((current) =>
          current?.kind === "highlight" && current.from === from ? { ...current, lines } : current,
        ),
      )
      .catch(() => {})
      .finally(() => {
        lookingUp.current = false;
        previewText(from);
      });
  };

  const onPointerDown = (event: PointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    if (tool === "ink") setDraft({ kind: "ink", points: [point] });
    else if (tool === "highlight") setDraft({ kind: "highlight", from: screenToPdf(point, frame), lines: [] });
    else setDraft({ kind: "box", start: point, end: point });
  };

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (!draft) return;
    const point = pointOf(event);
    if (draft.kind === "ink") setDraft({ ...draft, points: extendStroke(draft.points, point) });
    else if (draft.kind === "box") setDraft({ ...draft, end: point });
    else {
      latestPoint.current = screenToPdf(point, frame);
      previewText(draft.from);
    }
  };

  const onPointerUp = async (event: PointerEvent<SVGRectElement>) => {
    const finished = draft;
    setDraft(null);
    if (!finished) return;
    const id = crypto.randomUUID();
    if (finished.kind === "ink") {
      // A single click leaves a dot.
      const points = (finished.points.length === 1 ? [finished.points[0]!, finished.points[0]!] : finished.points).map(
        (point) => screenToPdf(point, frame),
      );
      onCreate({
        ...base,
        id,
        kind: "ink",
        lineWidth: style.lineWidth,
        strokes: [points],
        rect: boundsOf(points, style.lineWidth / 2),
      });
      return;
    }
    if (finished.kind === "highlight") {
      latestPoint.current = null;
      const lines = await session
        .textRects(pageId, finished.from, screenToPdf(pointOf(event), frame))
        .catch(() => finished.lines);
      if (lines.length > 0) onCreate({ ...base, id, kind: "highlight", lines, rect: boundsOfRects(lines) });
      return;
    }
    if (tool === "textBox") {
      onTextAt(finished.start);
      return;
    }
    const dragged = rectBetween(finished.start, finished.end);
    if (dragged.width >= CLICK_SLOP || dragged.height >= CLICK_SLOP)
      onCreate({ ...base, id, kind: "square", lineWidth: style.lineWidth, rect: screenRectToPdf(dragged, frame) });
  };

  return (
    <>
      {draft && <DraftPreview draft={draft} style={style} frame={frame} scale={scale} />}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        className={`pointer-events-auto touch-none ${CURSORS[tool]}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => void onPointerUp(event)}
        onPointerCancel={() => setDraft(null)}
      />
    </>
  );
}

interface DraftPreviewProps {
  readonly draft: Draft;
  readonly style: ToolStyle;
  readonly frame: PageFrame;
  readonly scale: number;
}

/**
 * The annotation as it is being made.
 * @param props The draft, the tool style, the frame and the point-to-pixel scale.
 * @returns SVG elements.
 */
function DraftPreview({ draft, style, frame, scale }: DraftPreviewProps) {
  const color = cssColor(style.color);
  if (draft.kind === "ink") {
    return (
      <polyline
        points={draft.points.map(({ x, y }) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeOpacity={style.opacity}
        strokeWidth={style.lineWidth * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (draft.kind === "highlight") {
    return (
      <g fill={color} fillOpacity={style.opacity} style={{ mixBlendMode: "multiply" }}>
        {draft.lines.map((line, index) => {
          const box = pdfRectToScreen(line, frame);
          return <rect key={index} x={box.left} y={box.top} width={box.width} height={box.height} />;
        })}
      </g>
    );
  }
  const box = rectBetween(draft.start, draft.end);
  return (
    <rect
      x={box.left}
      y={box.top}
      width={box.width}
      height={box.height}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, style.lineWidth * scale)}
      strokeDasharray="6 4"
    />
  );
}
