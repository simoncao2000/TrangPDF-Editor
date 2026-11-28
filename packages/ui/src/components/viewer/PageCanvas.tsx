import {
  bitmapSize,
  EngineCallError,
  RenderCancelledError,
  type DocId,
  type RenderTicket,
  type Rotation,
} from "@pdf-editor/core";
import { useEffect, useRef, useState } from "react";
import { useEditorServices } from "../../editor/hooks";

/** Wait this long after a size change (zooming, resizing) before asking for a sharp re-render. */
const RESIZE_SETTLE_MS = 120;

interface PageCanvasProps {
  readonly docId: DocId;
  /** Page index inside the source file. */
  readonly pageIndex: number;
  /** Extra clockwise rotation from the Rotate command. */
  readonly rotation: Rotation;
  /** The page's annotation revision: a new one redraws the page. */
  readonly revision: number;
  /** Leave out the annotations the annotation layer draws on top (the main view only). */
  readonly hideEditable?: boolean;
  /** On-screen size in CSS pixels (already turned for a quarter rotation). */
  readonly width: number;
  readonly height: number;
  /** Render order: lower first. */
  readonly priority: number;
  readonly className?: string;
}

/**
 * True for errors that only mean "this render is no longer wanted".
 * @param error A render rejection.
 * @returns Whether to ignore it.
 */
function isCancellation(error: unknown): boolean {
  return (
    error instanceof RenderCancelledError || (error instanceof EngineCallError && error.detail.code === "cancelled")
  );
}

/**
 * Draws one page bitmap, sharp for the screen's pixel density. While a new size renders, the best
 * cached copy is shown stretched, so zooming never flashes white (architecture §8.1).
 * @param props Which page, its CSS size and its render priority.
 * @returns A `<canvas>` sized in CSS pixels.
 */
export function PageCanvas({
  docId,
  pageIndex,
  rotation,
  revision,
  hideEditable = false,
  width,
  height,
  priority,
  className = "",
}: PageCanvasProps) {
  const { renderer } = useEditorServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ticketRef = useRef<RenderTicket | null>(null);
  /** The bitmap size whose render failed; the message shows only while that size is wanted. */
  const [failedSize, setFailedSize] = useState<string | null>(null);

  const target = bitmapSize({ width, height }, window.devicePixelRatio || 1);
  const [settled, setSettled] = useState(target);
  useEffect(() => {
    if (target.width === settled.width && target.height === settled.height) return;
    const timer = setTimeout(() => setSettled(target), RESIZE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [target.width, target.height, settled.width, settled.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    /** False once this effect is cleaned up: a late result must not draw (its bitmap may be released). */
    let active = true;
    const draw = (bitmap: ImageBitmap) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      // A closed ImageBitmap reports 0 × 0.
      if (!active || !canvas || !context || bitmap.width === 0) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
    };

    const image = { docId, pageIndex, rotation, hideEditable };
    const placeholder = renderer.bestCached(image);
    if (placeholder) draw(placeholder);

    const ticket = renderer.request({ ...image, revision, width: settled.width, height: settled.height, priority });
    ticketRef.current = ticket;
    ticket.promise.then(draw, (error: unknown) => {
      if (active && !isCancellation(error)) setFailedSize(`${settled.width}x${settled.height}`);
    });
    return () => {
      active = false;
      ticket.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, docId, pageIndex, rotation, hideEditable, revision, settled.width, settled.height]);

  useEffect(() => ticketRef.current?.setPriority(priority), [priority]);

  return (
    <div className={`relative bg-paper ${className}`} style={{ width, height }}>
      <canvas ref={canvasRef} data-page-canvas="" className="block size-full" aria-hidden="true" />
      {failedSize === `${settled.width}x${settled.height}` && (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-paper-muted">
          This page couldn’t be drawn.
        </p>
      )}
    </div>
  );
}
