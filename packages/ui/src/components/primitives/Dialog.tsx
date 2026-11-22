import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface DialogProps {
  readonly title: string;
  /** One or two sentences under the title. */
  readonly description?: ReactNode;
  /** A Lucide icon component shown beside the title. */
  readonly icon?: LucideIcon;
  readonly tone?: "neutral" | "danger";
  /** Called when the user presses Esc or clicks the backdrop. */
  readonly onDismiss: () => void;
  readonly children?: ReactNode;
  /** The buttons row. Put the primary action last. */
  readonly actions: ReactNode;
}

/**
 * A modal built on the native `<dialog>`, so focus trapping, Esc and the top layer come from the browser.
 * Used only for prompts that must be answered before continuing (password, open errors).
 * @param props Title, optional description, icon and tone, body, actions and dismiss handler.
 * @returns The open dialog.
 */
export function Dialog({
  title,
  description,
  icon: IconComponent,
  tone = "neutral",
  onDismiss,
  children,
  actions,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      className="m-auto w-[min(100%-2rem,440px)] rounded-sm border border-line bg-raised p-0 text-ink transition-[opacity,scale] duration-(--duration-enter) ease-out backdrop:bg-scrim open:scale-100 open:opacity-100 starting:scale-96 starting:opacity-0"
    >
      <div className="grid gap-4 p-5">
        <div className="flex items-start gap-3">
          {IconComponent && (
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${tone === "danger" ? "bg-danger/15 text-danger" : "bg-signal-soft text-signal"}`}
            >
              <IconComponent className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="grid gap-1">
            <h2 id="dialog-title" className="font-hand text-[1.62rem] leading-tight font-normal">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
        </div>
        {children}
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </dialog>
  );
}
