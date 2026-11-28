import { CircleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TOAST_MS, useToast } from "../../state/toast-store";

/**
 * Shows the current toast at the bottom centre. Rises in from the bottom edge (400 ms, Sonner timing),
 * waits while the pointer is over it, and announces itself to screen readers.
 * @returns The toast region.
 */
export function Toaster() {
  const { toast, dismiss } = useToast();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!toast || paused) return;
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, paused, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          className="pointer-events-auto flex min-h-11 max-w-[min(100%,460px)] items-center gap-2 rounded-sm bg-inverse py-1.5 pr-1.5 pl-4 text-sm text-on-inverse shadow-3 transition-[opacity,translate] duration-(--duration-toast) ease-out motion-reduce:transition-opacity starting:translate-y-4 starting:opacity-0"
        >
          {toast.tone === "error" && <CircleAlert className="size-4.5 shrink-0" aria-hidden="true" />}
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                dismiss(toast.id);
              }}
              className="h-8 rounded-xs px-3 font-semibold underline-offset-2 transition-colors hover:bg-on-inverse/15"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(toast.id)}
            className="grid size-8 place-items-center rounded-xs opacity-80 hover:bg-on-inverse/15 hover:opacity-100"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
