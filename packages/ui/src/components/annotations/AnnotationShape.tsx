import { CSS_PIXELS_PER_POINT, pdfRectToScreen, pdfToScreen, type Annotation, type PageFrame } from "@pdf-editor/core";
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
    case "textBox":
      return <TextBoxShape annotation={annotation} frame={frame} scale={scale} color={color} />;
    case "other":
      return null;
  }
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
