import {
  CSS_PIXELS_PER_POINT,
  pdfRectToScreen,
  type PageFrame,
  type PageTextObject,
  type ScreenPoint,
} from "@pdf-editor/core";
import { useEffect, useRef } from "react";
import { useEditorServices } from "../../editor/hooks";

interface DraggedTextProps {
  readonly pageId: string;
  readonly object: PageTextObject;
  /** How far it has been dragged, in CSS pixels. */
  readonly offset: ScreenPoint;
  readonly frame: PageFrame;
}

/** Pages are rendered on pure white; the original spot is covered with it while the text moves. */
const PAGE_WHITE = "#ffffff";
/** Room around the text's box so the cover hides anti-aliased edges too, in CSS pixels. */
const COVER_BLEED = 1;

/**
 * The text being dragged: its original spot covered, and PDFium's own picture of the text (the
 * real glyphs, whatever the font) following the pointer.
 * @param props The page, the text object, the drag offset and the frame.
 * @returns The cover and the moving picture.
 */
export function DraggedText({ pageId, object, offset, frame }: DraggedTextProps) {
  const { session } = useEditorServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = frame.zoom * CSS_PIXELS_PER_POINT;
  const box = pdfRectToScreen(object.bounds, frame);
  // The picture is drawn unrotated; it is turned with the page about the box's centre.
  const width = object.bounds.width * scale;
  const height = object.bounds.height * scale;

  useEffect(() => {
    let active = true;
    let bitmap: ImageBitmap | null = null;
    void session.renderTextObject(pageId, object.id, scale * (window.devicePixelRatio || 1)).then((rendered) => {
      bitmap = rendered;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!active || !rendered || !canvas || !context) return;
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      context.drawImage(rendered, 0, 0);
    });
    return () => {
      active = false;
      bitmap?.close();
    };
  }, [session, pageId, object.id, scale]);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: box.left - COVER_BLEED,
          top: box.top - COVER_BLEED,
          width: box.width + 2 * COVER_BLEED,
          height: box.height + 2 * COVER_BLEED,
          backgroundColor: PAGE_WHITE,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute drop-shadow-sm"
        style={{
          left: box.left + offset.x + (box.width - width) / 2,
          top: box.top + offset.y + (box.height - height) / 2,
          width,
          height,
          transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        }}
      />
    </>
  );
}
