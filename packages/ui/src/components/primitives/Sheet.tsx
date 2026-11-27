import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";

interface SheetProps {
  readonly title: string;
  readonly meta?: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * A bottom sheet for phones, built on the native `<dialog>` (focus trapping, Esc and the top layer
 * come from the browser). Slides up from the bottom edge; a tap on the dimmed page closes it.
 * @param props Title, optional header metadata, the dismiss handler and the content.
 * @returns The open sheet.
 */
export function Sheet({ title, meta, onDismiss, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<{ id: number; y: number; time: number } | null>(null);
  const swiped = useRef(false);

  /**
   * Starts a vertical drag from the sheet's handle.
   * @param event The handle's pointer event.
   * @returns Nothing.
   */
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    swiped.current = false;
    drag.current = { id: event.pointerId, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /**
   * Tracks the pointer directly while dragging.
   * @param event The handle's pointer event.
   * @returns Nothing.
   */
  function trackDrag(event: PointerEvent<HTMLButtonElement>) {
    const sheet = ref.current;
    if (!sheet || drag.current?.id !== event.pointerId) return;
    sheet.style.transitionProperty = "none";
    sheet.style.translate = `0 ${Math.max(0, event.clientY - drag.current.y)}px`;
  }

  /**
   * Resets the sheet or dismisses it after a downward swipe.
   * @param event The handle's release or cancellation event.
   * @returns Nothing.
   */
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const sheet = ref.current;
    const start = drag.current;
    if (!sheet || start?.id !== event.pointerId) return;
    drag.current = null;
    const distance = event.clientY - start.y;
    const flick = distance > 24 && distance / Math.max(1, event.timeStamp - start.time) > 0.5;
    swiped.current = event.type === "pointerup" && (distance > 72 || flick);
    if (swiped.current) onDismiss();
    else {
      sheet.style.transitionProperty = "";
      sheet.style.translate = "";
    }
  }

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-xs border-t border-line bg-raised p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-3 transition-[translate,opacity] duration-(--duration-enter) ease-(--ease-drawer) backdrop:bg-scrim motion-reduce:transition-opacity starting:translate-y-8 starting:opacity-0"
    >
      <button
        type="button"
        aria-label="Done"
        className="mx-auto mt-2 block h-1 w-10 touch-none rounded-pill bg-line"
        onClick={() => {
          if (!swiped.current) onDismiss();
          swiped.current = false;
        }}
        onPointerDown={startDrag}
        onPointerMove={trackDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      />
      <div className="flex items-baseline justify-between gap-2 px-5 pt-3 pb-2">
        <h2 id={titleId} className="min-w-0 truncate font-hand text-xl font-normal">
          {title}
        </h2>
        {meta && <span className="shrink-0 text-xs text-muted tabular-nums">{meta}</span>}
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-3 pb-4">{children}</div>
    </dialog>
  );
}
