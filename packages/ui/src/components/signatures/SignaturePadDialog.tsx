import { Signature } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { useSignatures } from "../../state/signature-store";
import { Button } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { signatureFrom } from "./signature-geometry";

type Point = { readonly x: number; readonly y: number };

/**
 * Draw a signature with the mouse, a finger or a pen. "Use signature" saves it on this device and
 * makes it the one the Sign tool places.
 * @returns The dialog while the pad is open, otherwise nothing.
 */
export function SignaturePadDialog() {
  const drawing = useSignatures((state) => state.drawing);
  return drawing ? <SignaturePad /> : null;
}

/**
 * The pad itself.
 * @returns The dialog.
 */
function SignaturePad() {
  const setDrawing = useSignatures((state) => state.setDrawing);
  const add = useSignatures((state) => state.add);
  const [strokes, setStrokes] = useState<readonly (readonly Point[])[]>([]);
  const active = useRef<number | null>(null);
  const close = () => setDrawing(false);

  const pointOf = (event: PointerEvent<SVGSVGElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = event.pointerId;
    // Read now: React runs the update later, when the event no longer has its element.
    const point = pointOf(event);
    setStrokes((current) => [...current, [point]]);
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (active.current !== event.pointerId) return;
    const point = pointOf(event);
    setStrokes((current) => [...current.slice(0, -1), [...(current.at(-1) ?? []), point]]);
  };
  const onUp = () => {
    active.current = null;
  };
  const use = () => {
    const signature = signatureFrom(crypto.randomUUID(), strokes);
    if (signature) add(signature);
    close();
  };

  return (
    <Dialog
      title="Draw your signature"
      icon={Signature}
      description="It is saved on this device, to sign again later."
      onDismiss={close}
      actions={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setStrokes([])} disabled={strokes.length === 0}>
            Clear
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={use} disabled={strokes.length === 0}>
            Use signature
          </Button>
        </>
      }
    >
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
    </Dialog>
  );
}
