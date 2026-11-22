import {
  boundsOf,
  CSS_PIXELS_PER_POINT,
  newTextMarkup,
  screenRectToPdf,
  screenToPdf,
  type EditableAnnotation,
  type PageFrame,
  type ScreenPoint,
  type TextMarkupKind,
} from "@pdf-editor/core";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { useRef, useState, type PointerEvent } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi, type DrawingTool, type ToolStyle } from "../../state/annotation-store";
import { cssColor } from "./annotation-display";
import { AnnotationShape } from "./AnnotationShape";
import { CLICK_SLOP, extendStroke, rectBetween } from "./drawing-geometry";
import { useImageTool } from "../../state/image-store";
import { useSignatures } from "../../state/signature-store";
import { placeSignature } from "../signatures/signature-geometry";

/** A sticky note's size on the page, in points. */
const NOTE_SIZE = 24;
/** A placed signature's width, in points (about 5.6 cm); drag its corners to resize it. */
const SIGNATURE_WIDTH = 160;
/** The widest a picture starts when placed with a click, in points. */
const IMAGE_MAX_WIDTH = 300;
/** Room around a line for its round caps and arrowhead, as a multiple of its width. */
const LINE_MARGIN = 4;

/** An annotation before it has an id (spread over the union, so each kind keeps its own fields). */
type Unsaved = EditableAnnotation extends infer A ? (A extends unknown ? Omit<A, "id"> : never) : never;

type Draft =
  | { readonly kind: "stroke"; readonly points: readonly ScreenPoint[] }
  | { readonly kind: "drag"; readonly start: ScreenPoint; readonly end: ScreenPoint }
  | { readonly kind: "text"; readonly from: PdfPoint; readonly lines: readonly PdfRect[] };

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

const TEXT_MARKUPS: readonly DrawingTool[] = ["highlight", "underline", "strikeout", "squiggly"];
const isTextTool = (tool: DrawingTool): tool is TextMarkupKind => TEXT_MARKUPS.includes(tool);
const CURSORS: Record<DrawingTool, string> = {
  note: "cursor-copy",
  highlight: "cursor-text",
  underline: "cursor-text",
  strikeout: "cursor-text",
  squiggly: "cursor-text",
  ink: "cursor-crosshair",
  square: "cursor-crosshair",
  circle: "cursor-crosshair",
  line: "cursor-crosshair",
  arrow: "cursor-crosshair",
  textBox: "cursor-text",
  sign: "cursor-copy",
  image: "cursor-crosshair",
};

/**
 * Catches pointer input over a page while a drawing tool is in hand, shows the annotation as it is
 * being made, and hands it over when the pointer is released.
 *
 * Draw: each stroke becomes a drawing. Rectangle, Ellipse: drag a box. Line, Arrow: drag from start
 * to end. Highlight, Underline, Strikethrough, Squiggly: drag across text (PDFium reports where the
 * text is, line by line). Note: click to stick one, which opens its comment. Text box: click and
 * type (the text becomes page text).
 * @param props The page, the tool and its style, the frame, and what to do with the result.
 * @returns A transparent SVG rectangle over the page, plus the preview.
 */
export function DrawingSurface({ pageId, tool, style, frame, width, height, onCreate, onTextAt }: DrawingSurfaceProps) {
  const { session } = useEditorServices();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Text preview: one text lookup at a time, always for the newest pointer position. */
  const lookingUp = useRef(false);
  const latestPoint = useRef<PdfPoint | null>(null);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;

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
        setDraft((current) => (current?.kind === "text" && current.from === from ? { ...current, lines } : current)),
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
    if (tool === "ink") setDraft({ kind: "stroke", points: [point] });
    else if (isTextTool(tool)) setDraft({ kind: "text", from: screenToPdf(point, frame), lines: [] });
    else setDraft({ kind: "drag", start: point, end: point });
  };

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (!draft) return;
    const point = pointOf(event);
    if (draft.kind === "stroke") setDraft({ ...draft, points: extendStroke(draft.points, point) });
    else if (draft.kind === "drag") setDraft({ ...draft, end: point });
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
    if (finished.kind === "text" && isTextTool(tool)) {
      latestPoint.current = null;
      const lines = await session
        .textRects(pageId, finished.from, screenToPdf(pointOf(event), frame))
        .catch(() => finished.lines);
      if (lines.length > 0) onCreate(newTextMarkup(tool, id, lines, style));
      return;
    }
    if (tool === "textBox" && finished.kind === "drag") {
      onTextAt(finished.start);
      return;
    }
    if (tool === "image" && finished.kind === "drag") {
      const placed = imageFrom(finished, frame);
      if (!placed) return;
      onCreate({ ...placed, id });
      useAnnotationUi.getState().setTool("select");
      useAnnotationUi.getState().select({ pageId, id });
      return;
    }
    if (tool === "sign" && finished.kind === "drag") {
      const signed = signAt(screenToPdf(finished.start, frame), style);
      if (!signed) return;
      onCreate({ ...signed, id });
      useAnnotationUi.getState().setTool("select");
      useAnnotationUi.getState().select({ pageId, id });
      return;
    }
    if (tool === "note" && finished.kind === "drag") {
      const at = screenToPdf(finished.start, frame);
      onCreate({ ...noteAt(at), id, color: style.color, opacity: style.opacity });
      // Open the new note's comment, ready to write in.
      useAnnotationUi.getState().setTool("select");
      useAnnotationUi.getState().selectToComment({ pageId, id });
      return;
    }
    const made = annotationFrom(finished, tool, style, frame);
    if (made) onCreate({ ...made, id } as EditableAnnotation);
  };

  const preview = draft ? previewOf(draft, tool, style, frame) : null;
  return (
    <>
      {preview && <AnnotationShape annotation={preview} frame={frame} />}
      {draft?.kind === "drag" && tool === "textBox" && (
        <DragBox start={draft.start} end={draft.end} color={cssColor(style.color)} width={style.lineWidth * scale} />
      )}
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

/**
 * The chosen picture placed where a drag or click says: in the dragged box (its proportions kept
 * when the Image tool keeps them), or at its own size for a click, its top-left at the click.
 * @param draft The finished drag.
 * @param frame How the page is shown.
 * @returns The image (without an id), or `null` when no picture has been chosen.
 */
function imageFrom(draft: Extract<Draft, { kind: "drag" }>, frame: PageFrame): EditableAnnotation | null {
  const { pending, keepProportions } = useImageTool.getState();
  if (!pending) return null;
  const dragged = rectBetween(draft.start, draft.end);
  const clicked = dragged.width < CLICK_SLOP && dragged.height < CLICK_SLOP;
  const aspect = pending.height / pending.width;
  // A pixel is 3/4 of a point; big pictures start at most IMAGE_MAX_WIDTH wide.
  const width = clicked ? Math.min(IMAGE_MAX_WIDTH, pending.width * 0.75) : 0;
  const box = clicked
    ? { left: draft.start.x, top: draft.start.y, width: width * frame.zoom * CSS_PIXELS_PER_POINT, height: 0 }
    : dragged;
  const height = clicked || keepProportions ? box.width * aspect : box.height;
  const rect = screenRectToPdf({ ...box, height }, frame);
  return { kind: "image", id: "", rect, color: { r: 0, g: 0, b: 0 }, opacity: 1, image: pending.file };
}

/**
 * The chosen signature placed at a point, or the drawing pad opened when there is none yet.
 * @param at Where its top-left corner goes, in PDF space.
 * @param style The Sign tool's style.
 * @returns The ink, or `null` while the pad is opened instead.
 */
function signAt(at: PdfPoint, style: ToolStyle): EditableAnnotation | null {
  const { signatures, currentId, setDrawing } = useSignatures.getState();
  const signature = signatures.find((candidate) => candidate.id === currentId);
  if (!signature) {
    setDrawing(true);
    return null;
  }
  return placeSignature(signature, at, { color: style.color, lineWidth: style.lineWidth, width: SIGNATURE_WIDTH });
}

/**
 * A sticky note whose top-left corner is at a point.
 * @param at The point, in PDF space.
 * @returns The note's kind and rectangle.
 */
function noteAt(at: PdfPoint): { kind: "note"; rect: PdfRect } {
  return { kind: "note", rect: { x: at.x, y: at.y - NOTE_SIZE, width: NOTE_SIZE, height: NOTE_SIZE } };
}

/**
 * The annotation a stroke or a drag makes with a tool.
 * @param draft The finished gesture.
 * @param tool The tool in hand.
 * @param style Its style.
 * @param frame How the page is shown.
 * @returns The annotation (without an id), or `null` for a click too small to count.
 */
function annotationFrom(draft: Draft, tool: DrawingTool, style: ToolStyle, frame: PageFrame): Unsaved | null {
  const look = { color: style.color, opacity: style.opacity, lineWidth: style.lineWidth };
  if (draft.kind === "stroke" && tool === "ink") {
    // A single click leaves a dot.
    const points = (draft.points.length === 1 ? [draft.points[0]!, draft.points[0]!] : draft.points).map((point) =>
      screenToPdf(point, frame),
    );
    return { ...look, kind: "ink", strokes: [points], rect: boundsOf(points, style.lineWidth / 2) };
  }
  if (draft.kind !== "drag") return null;
  const dragged = rectBetween(draft.start, draft.end);
  if (dragged.width < CLICK_SLOP && dragged.height < CLICK_SLOP) return null;
  if (tool === "square" || tool === "circle") return { ...look, kind: tool, rect: screenRectToPdf(dragged, frame) };
  if (tool === "line" || tool === "arrow") {
    const [start, end] = [screenToPdf(draft.start, frame), screenToPdf(draft.end, frame)];
    return { ...look, kind: tool, start, end, rect: boundsOf([start, end], style.lineWidth * LINE_MARGIN) };
  }
  return null;
}

/**
 * The annotation as it is being made, to draw while the pointer moves.
 * @param draft The gesture so far.
 * @param tool The tool in hand.
 * @param style Its style.
 * @param frame How the page is shown.
 * @returns A provisional annotation, or `null` when there is nothing to show yet.
 */
function previewOf(draft: Draft, tool: DrawingTool, style: ToolStyle, frame: PageFrame): EditableAnnotation | null {
  if (draft.kind === "text") {
    return isTextTool(tool) && draft.lines.length > 0 ? newTextMarkup(tool, "", draft.lines, style) : null;
  }
  const made = annotationFrom(draft, tool, style, frame);
  return made ? ({ ...made, id: "" } as EditableAnnotation) : null;
}

/**
 * The dashed box dragged out for a text box.
 * @param props Where the drag started and is now, the colour and the line width in pixels.
 * @param props.start Where the drag started.
 * @param props.end Where the pointer is.
 * @param props.color The tool's colour.
 * @param props.width The outline's width.
 * @returns The box.
 */
function DragBox({ start, end, color, width }: { start: ScreenPoint; end: ScreenPoint; color: string; width: number }) {
  const box = rectBetween(start, end);
  return (
    <rect
      x={box.left}
      y={box.top}
      width={box.width}
      height={box.height}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, width)}
      strokeDasharray="6 4"
    />
  );
}
