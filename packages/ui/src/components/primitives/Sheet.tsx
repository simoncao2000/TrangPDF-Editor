import { useEffect, useId, useRef, type ReactNode } from "react";

interface SheetProps {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

/**
 * A bottom sheet for phones, built on the native `<dialog>` (focus trapping, Esc and the top layer
 * come from the browser). Slides up from the bottom edge; a tap on the dimmed page closes it.
 * @param props Title, the dismiss handler and the content.
 * @returns The open sheet.
 */
export function Sheet({ title, onDismiss, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-lg border-t border-line bg-raised p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-3 backdrop:bg-scrim transition-[translate,opacity] duration-(--duration-enter) ease-(--ease-drawer) starting:translate-y-8 starting:opacity-0 motion-reduce:transition-opacity"
    >
      <span className="mx-auto mt-2 block h-1 w-10 rounded-pill bg-line" aria-hidden="true" />
      <h2 id={titleId} className="px-5 pt-3 pb-2 font-hand text-xl font-normal">
        {title}
      </h2>
      <div className="max-h-[70dvh] overflow-y-auto px-3 pb-4">{children}</div>
    </dialog>
  );
}
