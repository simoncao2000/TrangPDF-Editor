import { useRef, useState, type PointerEvent } from "react";
import { Button } from "../primitives/Button";
import { signatureFrom } from "./signature-geometry";

type Point = { readonly x: number; readonly y: number };

interface DrawSignatureProps {
  readonly onCancel: () => void;
  readonly onUse: (signature: NonNullable<ReturnType<typeof signatureFrom>>) => void;
}

/**
 * Draws a signature with the mouse, a finger or a pen.
 * @param props Cancel and use handlers.
 * @returns The drawing pad and its actions.
 */
export function DrawSignature({ onCancel, onUse }: DrawSignatureProps) {
  const [strokes, setStrokes] = useState<readonly (readonly Point[])[]>([]);
  const active = useRef<number | null>(null);

  /**
   * Reads a pointer in pad coordinates.
   * @param event Pointer event.
   * @returns The point.
   */
  const pointOf = (event: PointerEvent<SVGSVGElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  /**
   * Starts a stroke.
   * @param event Pointer event.
   * @returns Nothing.
   */
  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = event.pointerId;
    // Read now: React runs the update later, when the event no longer has its element.
    const point = pointOf(event);
    setStrokes((current) => [...current, [point]]);
  };
  /**
   * Extends a stroke.
   * @param event Pointer event.
   * @returns Nothing.
   */
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (active.current !== event.pointerId) return;
    const point = pointOf(event);
    setStrokes((current) => [...current.slice(0, -1), [...(current.at(-1) ?? []), point]]);
  };
  /**
   * Ends the active stroke.
   * @returns Nothing.
   */
  const onUp = () => {
    active.current = null;
  };
  /**
   * Accepts the normalized strokes.
   * @returns Nothing.
   */
  const use = () => {
    const signature = signatureFrom(crypto.randomUUID(), strokes);
    if (signature) onUse(signature);
  };

  return (
    <div className="grid gap-4">
      <svg
        role="img"
        aria-label="Signature pad: draw with the mouse, a finger or a pen"
        className="h-48 w-full cursor-crosshair touch-none rounded-sm bg-paper-field ring-1 ring-line"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <line x1="8%" x2="92%" y1="78%" y2="78%" className="stroke-paper-line" strokeDasharray="4 4" />
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            className="stroke-paper-ink"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="mr-auto" onClick={() => setStrokes([])} disabled={strokes.length === 0}>
          Clear
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={use} disabled={strokes.length === 0}>
          Use signature
        </Button>
      </div>
    </div>
  );
}
