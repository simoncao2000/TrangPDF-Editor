import {
  CSS_PIXELS_PER_POINT,
  pdfRectToScreen,
  pdfToScreen,
  type Annotation,
  type PageFrame,
  type TextMarkupKind,
} from "@pdf-editor/core";
import type { PdfPoint, PdfRect } from "@pdf-editor/shared";
import { cssColor } from "./annotation-display";

interface AnnotationShapeProps {
  readonly annotation: Annotation;
  readonly frame: PageFrame;
}

/**
 * Draws one annotation the editor understands, in screen space, the way PDFium's appearance will
 * look in the saved file. Annotations from other apps draw nothing here: they are part of the page
 * picture underneath.
 * @param props The annotation and how its page is shown.
 * @returns SVG elements, or `null`.
 */
export function AnnotationShape({ annotation, frame }: AnnotationShapeProps) {
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const color = cssColor(annotation.color);
  switch (annotation.kind) {
    case "highlight":
      return (
        <g fill={color} fillOpacity={annotation.opacity} style={{ mixBlendMode: "multiply" }}>
          {annotation.lines.map((line, index) => {
            const box = pdfRectToScreen(line, frame);
            return <rect key={index} x={box.left} y={box.top} width={box.width} height={box.height} />;
          })}
        </g>
      );
    case "underline":
    case "strikeout":
    case "squiggly":
      return (
        <g fill="none" stroke={color} strokeOpacity={annotation.opacity} strokeLinecap="round">
          {annotation.lines.map((line, index) => (
            <polyline
              key={index}
              strokeWidth={markupWidth(line) * scale}
              points={toScreen(markupPath(annotation.kind, line), frame)}
            />
          ))}
        </g>
      );
    case "circle": {
      // The border is drawn inside the ellipse's box.
      const box = pdfRectToScreen(annotation.rect, frame);
      const inset = (annotation.lineWidth * scale) / 2;
      return (
        <ellipse
          cx={box.left + box.width / 2}
          cy={box.top + box.height / 2}
          rx={Math.max(0, box.width / 2 - inset)}
          ry={Math.max(0, box.height / 2 - inset)}
          fill="none"
          stroke={color}
          strokeOpacity={annotation.opacity}
          strokeWidth={annotation.lineWidth * scale}
        />
      );
    }
    case "line":
    case "arrow": {
      const start = pdfToScreen(annotation.start, frame);
      const end = pdfToScreen(annotation.end, frame);
      const head = annotation.kind === "arrow" ? arrowHead(start, end, annotation.lineWidth * scale) : "";
      return (
        <g
          fill="none"
          stroke={color}
          strokeOpacity={annotation.opacity}
          strokeWidth={annotation.lineWidth * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
          {head && <polyline points={head} />}
        </g>
      );
    }
    case "note": {
      const box = pdfRectToScreen(annotation.rect, frame);
      const pad = box.width * 0.25;
      return (
        <g>
          <rect
            x={box.left}
            y={box.top}
            width={box.width}
            height={box.height}
            rx={box.width * 0.15}
            fill={color}
            stroke="rgb(0 0 0 / 0.35)"
          />
          <g stroke="rgb(0 0 0 / 0.55)" strokeWidth={Math.max(1, box.width / 14)} strokeLinecap="round">
            {[0.38, 0.55, 0.72].map((at) => (
              <line
                key={at}
                x1={box.left + pad}
                x2={box.left + box.width - pad}
                y1={box.top + box.height * at}
                y2={box.top + box.height * at}
              />
            ))}
          </g>
        </g>
      );
    }
    case "ink":
      return (
        <g
          fill="none"
          stroke={color}
          strokeOpacity={annotation.opacity}
          strokeWidth={annotation.lineWidth * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {annotation.strokes.map((stroke, index) => (
            <polyline
              key={index}
              points={stroke
                .map((point) => pdfToScreen(point, frame))
                .map(({ x, y }) => `${x},${y}`)
                .join(" ")}
            />
          ))}
        </g>
      );
    case "square": {
      // The border is drawn inside the rectangle.
      const box = pdfRectToScreen(annotation.rect, frame);
      const inset = (annotation.lineWidth * scale) / 2;
      return (
        <rect
          x={box.left + inset}
          y={box.top + inset}
          width={Math.max(0, box.width - 2 * inset)}
          height={Math.max(0, box.height - 2 * inset)}
          fill="none"
          stroke={color}
          strokeOpacity={annotation.opacity}
          strokeWidth={annotation.lineWidth * scale}
        />
      );
    }
    case "image":
      // PDFium draws images in the page picture; only their outline is drawn here when selected.
      return null;
    case "textBox":
      return <TextBoxShape annotation={annotation} frame={frame} scale={scale} color={color} />;
    case "other":
      return null;
  }
}

/** Squiggles per point of line length, and their height as a share of the line's height. */
const SQUIGGLES_PER_POINT = 1 / 4;
const SQUIGGLE_HEIGHT = 0.12;

/**
 * How thick an underline, strikethrough or squiggle is for a line of text.
 * @param line The line's rectangle, in PDF space.
 * @returns Its thickness in points.
 */
function markupWidth(line: PdfRect): number {
  return Math.max(1, line.height / 14);
}

/**
 * The path of an underline, strikethrough or squiggle along one line of text, in PDF space.
 * @param kind Which mark.
 * @param line The line's rectangle.
 * @returns Points along the path.
 */
function markupPath(kind: TextMarkupKind, line: PdfRect): PdfPoint[] {
  const right = line.x + line.width;
  if (kind === "strikeout") {
    const y = line.y + line.height / 2;
    return [
      { x: line.x, y },
      { x: right, y },
    ];
  }
  const y = line.y + markupWidth(line);
  if (kind === "underline")
    return [
      { x: line.x, y },
      { x: right, y },
    ];
  const count = Math.max(2, Math.round(line.width * SQUIGGLES_PER_POINT) * 2);
  const amplitude = line.height * SQUIGGLE_HEIGHT;
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: line.x + (line.width * i) / count,
    y: y + (i % 2 ? amplitude : 0),
  }));
}

/**
 * PDF points as an SVG `points` list on screen.
 * @param points Points in PDF space.
 * @param frame How the page is shown.
 * @returns "x,y x,y …".
 */
function toScreen(points: readonly PdfPoint[], frame: PageFrame): string {
  return points
    .map((point) => pdfToScreen(point, frame))
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
}

/**
 * An open arrowhead at the end of a line, on screen.
 * @param start The line's start.
 * @param end Where it points.
 * @param width The line's width in pixels.
 * @returns The arrowhead's three points as an SVG `points` list.
 */
function arrowHead(start: { x: number; y: number }, end: { x: number; y: number }, width: number): string {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.max(8, width * 4);
  const wing = (turn: number) => ({
    x: end.x - length * Math.cos(angle + turn),
    y: end.y - length * Math.sin(angle + turn),
  });
  const [left, right] = [wing(Math.PI / 6), wing(-Math.PI / 6)];
  return `${left.x},${left.y} ${end.x},${end.y} ${right.x},${right.y}`;
}

interface TextBoxShapeProps {
  readonly annotation: Extract<Annotation, { kind: "textBox" }>;
  readonly frame: PageFrame;
  readonly scale: number;
  readonly color: string;
}

/**
 * A text box: wrapped Helvetica text, turned with the page.
 * @param props The text box, its frame, the point-to-pixel scale and the text colour.
 * @returns A `<foreignObject>` holding the text.
 */
function TextBoxShape({ annotation, frame, scale, color }: TextBoxShapeProps) {
  const box = pdfRectToScreen(annotation.rect, frame);
  // Lay the text out unrotated, then turn it about the box's centre.
  const width = annotation.rect.width * scale;
  const height = annotation.rect.height * scale;
  return (
    <foreignObject x={box.left} y={box.top} width={box.width} height={box.height} opacity={annotation.opacity}>
      <div
        className="overflow-hidden break-words whitespace-pre-wrap"
        style={{
          position: "absolute",
          left: (box.width - width) / 2,
          top: (box.height - height) / 2,
          width,
          height,
          transform: `rotate(${frame.rotation}deg)`,
          color,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: annotation.fontSize * scale,
          lineHeight: 1.15,
        }}
      >
        {annotation.text}
      </div>
    </foreignObject>
  );
}
