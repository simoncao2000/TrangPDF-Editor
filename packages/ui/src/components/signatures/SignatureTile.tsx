import { CSS_PIXELS_PER_POINT, type ScreenPoint } from "@pdf-editor/core";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useAnnotationUi } from "../../state/annotation-store";
import { cssColor } from "../annotations/annotation-display";
import { useToast } from "../../state/toast-store";
import { useViewer } from "../../state/viewer-store";
import { useSignatures, type SavedSignature } from "../../state/signature-store";
import { acceptsDrop, placeSignature, signatureBounds, SIGNATURE_WIDTH, startedDrag } from "./signature-geometry";
import { signaturePages, signatureTarget, useSignatureDrag } from "./signature-pages";
import { SignaturePreview } from "./SignaturePreview";
import { renderTypedSignature } from "./typed-signature";

interface Gesture {
  id: number;
  start: ScreenPoint;
  point: ScreenPoint;
  tile: DOMRect;
  dragging: boolean;
}

type Target = ReturnType<typeof signatureTarget>;

/** @param props The library entry and its selection state. @returns A draggable signature button and its portal. */
export function SignatureTile({ signature, selected }: { signature: SavedSignature; selected: boolean }) {
  const style = useAnnotationUi((state) => state.styles.sign);
  const color = cssColor(style.color);
  const gesture = useRef<Gesture | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const rendering = useRef<ReturnType<typeof renderTypedSignature> | null>(null);
  const [raster, setImage] = useState<{ url: string; aspect: number; color: string; signature: SavedSignature }>();
  const image = raster?.color === color && raster.signature === signature ? raster : undefined;
  const aspect = signature.kind === "drawn" ? signature.aspect : image?.aspect;
  useEffect(() => {
    if (signature.kind !== "typed") return;
    let active = true;
    let url: string | undefined;
    const pending = renderTypedSignature(signature, color);
    rendering.current = pending;
    void pending
      .then((result) => {
        if (!active) return;
        url = URL.createObjectURL(new Blob([result.bytes], { type: "image/png" }));
        setImage({ url, aspect: result.aspect, color, signature });
      })
      .catch(() => {});
    return () => {
      active = false;
      rendering.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [signature, color]);

  /** @param target The page and local drop point. @returns Completion of placement and selection. */
  async function place(target: Target) {
    if (!target) return;
    const raster = signature.kind === "typed" ? await rendering.current?.catch(() => null) : null;
    if (signaturePages.get(target.surface)?.pageId !== target.pageId) return;
    if (signature.kind === "typed" && !raster) {
      useToast.getState().show("Could not render the signature. Try another name or style.", { tone: "error" });
      return;
    }
    const ratio = signature.kind === "drawn" ? signature.aspect : raster!.aspect;
    const margin = signature.kind === "drawn" ? style.lineWidth / 2 : 0;
    const rect = signatureBounds(target.point, target.frame, ratio, margin);
    const id = crypto.randomUUID();
    if (signature.kind === "drawn") {
      const at = { x: rect.x, y: rect.y + rect.height };
      target.onCreate({ ...placeSignature(signature, at, { ...style, width: rect.width }), id });
    } else {
      target.onCreate({
        id,
        kind: "image",
        rect,
        color: style.color,
        opacity: 1,
        image: { format: "png", bytes: raster!.bytes },
      });
    }
    useAnnotationUi.getState().setTool("select");
    useAnnotationUi.getState().select({ pageId: target.pageId, id });
    useToast.getState().show(`Signature placed on ${target.page.getAttribute("aria-label")?.toLowerCase()}`);
  }

  /** @param cancelled Whether the pointer operation was interrupted. @returns Nothing. */
  function finish(cancelled: boolean) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    suppressClick.current = active.dragging || cancelled;
    if (!active.dragging) return;
    useSignatureDrag.setState({ dragging: false });
    const target = cancelled ? null : signatureTarget(active.point);
    if (acceptsDrop(cancelled, !!target)) {
      setDragging(false);
      void place(target);
    } else if (ghost.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const x = active.tile.left + active.tile.width / 2;
      const y = active.tile.top + active.tile.height / 2;
      const node = ghost.current;
      const transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      const easing = getComputedStyle(node).getPropertyValue("--curve-out").trim() || "ease-out";
      const animation = node.animate([{ transform: node.style.transform }, { transform }], { duration: 180, easing });
      animation.onfinish = () => {
        if (!gesture.current?.dragging) setDragging(false);
      };
    } else setDragging(false);
  }

  useEffect(() => {
    /** @param event The pressed key. @returns Nothing. */
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && gesture.current) {
        event.stopImmediatePropagation();
        finish(true);
      }
    }
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      if (gesture.current?.dragging) useSignatureDrag.setState({ dragging: false });
    };
    // Cancellation only reads the current gesture and ghost refs.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    let outlined: Element | undefined;
    /** Positions the portal and scrolls beneath a stationary pointer. @returns Nothing. */
    function paint() {
      const point = gesture.current?.point;
      const node = ghost.current;
      const target = point && signatureTarget(point);
      if (outlined !== target?.surface) {
        outlined?.removeAttribute("data-drop");
        outlined = target?.surface;
        outlined?.setAttribute("data-drop", "");
      }
      if (!point || !node) return;
      const viewer = document.querySelector<HTMLElement>("[data-document-pages]");
      const box = viewer?.getBoundingClientRect();
      if (viewer && box && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) {
        const bottom = box.bottom - (parseFloat(getComputedStyle(viewer).scrollPaddingBottom) || 0);
        const delta = Math.min(48, Math.max(0, point.y - bottom + 48)) - Math.max(0, box.top + 48 - point.y);
        viewer.scrollTop += delta / 4;
      }
      const scale = CSS_PIXELS_PER_POINT * (target?.frame.zoom ?? useViewer.getState().zoom);
      const width =
        target && aspect !== undefined
          ? signatureBounds(target.point, target.frame, aspect, signature.kind === "drawn" ? style.lineWidth / 2 : 0)
              .width
          : SIGNATURE_WIDTH;
      node.style.setProperty("--signature-stroke", String(style.lineWidth / width));
      node.style.width = `${width * scale}px`;
      node.style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
      node.firstElementChild?.setAttribute("style", `transform: rotate(${target?.frame.rotation ?? 0}deg)`);
      frame = requestAnimationFrame(paint);
    }
    paint();
    return () => {
      cancelAnimationFrame(frame);
      outlined?.removeAttribute("data-drop");
    };
  }, [dragging, aspect, signature.kind, style.lineWidth]);

  /** @param event Captured tile pointer. @returns Nothing. */
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    active.point = { x: event.clientX, y: event.clientY };
    if (!active.dragging && startedDrag(active.start, active.point)) {
      active.dragging = true;
      setDragging(true);
      useSignatureDrag.setState({ dragging: true });
    }
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={signature.kind === "typed" ? `Use signature: ${signature.text}` : "Use this signature"}
        className="grid min-w-0 touch-none gap-1 rounded-xs text-left select-none focus-visible:ring-2"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || gesture.current) return;
          suppressClick.current = false;
          const start = { x: event.clientX, y: event.clientY };
          gesture.current = {
            id: event.pointerId,
            start,
            point: start,
            tile: event.currentTarget.getBoundingClientRect(),
            dragging: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (gesture.current?.id !== event.pointerId) return;
          move(event);
          finish(false);
        }}
        onPointerCancel={(event) => {
          if (gesture.current?.id === event.pointerId) finish(true);
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current?.id === event.pointerId) finish(true);
        }}
        onClick={(event) => {
          if (!suppressClick.current || event.detail === 0) {
            if (signature !== useSignatures.getState().temporary) useSignatures.getState().choose(signature.id);
            void place(signatureTarget());
          }
          suppressClick.current = false;
        }}
      >
        <SignaturePreview signature={signature} />
        <span className="text-xs text-muted">
          {signature === useSignatures.getState().temporary
            ? "Use once"
            : signature.kind === "typed"
              ? "Typed · saved on this device"
              : "Saved on this device"}
        </span>
      </button>
      {dragging &&
        createPortal(
          <div
            ref={ghost}
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 z-[2147483647] opacity-60 drop-shadow-xs"
            style={{ color }}
          >
            <div>
              {signature.kind === "typed" ? (
                image && <img src={image.url} alt="" className="block w-full" />
              ) : (
                <svg viewBox={`0 0 1 ${signature.aspect}`} className="block w-full overflow-visible">
                  {signature.strokes.map((stroke, index) => (
                    <polyline
                      key={index}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="var(--signature-stroke)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={(stroke.length === 1 ? [stroke[0]!, stroke[0]!] : stroke)
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
