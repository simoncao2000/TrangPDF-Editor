import { FileOutput, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

interface SelectionBarProps {
  readonly count: number;
  /** Deleting every page would leave an empty PDF, so Delete is off then. */
  readonly canDelete: boolean;
  readonly busy: boolean;
  readonly onRotateLeft: () => void;
  readonly onRotateRight: () => void;
  readonly onExtract: () => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}

interface BarButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly tone?: "danger";
  readonly title?: string;
  readonly children: ReactNode;
}

/**
 * A text button inside the selection bar.
 * @param props Label, handler, state and icon.
 * @returns The button.
 */
function BarButton({ label, onClick, disabled, tone, title, children }: BarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold transition-[background-color,transform] duration-(--duration-press) ease-out hover:bg-hover active:scale-(--press-scale) disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent ${tone === "danger" ? "text-danger" : "text-ink"}`}
    >
      {children}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

/**
 * Floating actions for the selected pages. Count first, then verbs.
 * It rises in from the bottom edge it is anchored to.
 * @param props Selection size, what is allowed, and the actions.
 * @returns The toolbar.
 */
export function SelectionBar({ count, canDelete, busy, onRotateLeft, onRotateRight, onExtract, onDelete, onClear }: SelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Selected pages"
      className="flex items-center gap-0.5 rounded-sm border border-line bg-raised p-1 shadow-3 transition-[opacity,translate] duration-(--duration-enter) ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-opacity"
    >
      <span className="mr-1 inline-flex h-9 items-center gap-2 rounded-xs bg-signal-soft pr-3 pl-2 text-sm font-semibold">
        <span className="grid min-w-5.5 place-items-center rounded-pill bg-signal px-1.5 font-mono text-xs text-raised">{count}</span>
        <span className="max-sm:sr-only">selected</span>
      </span>
      <BarButton label="Rotate left" onClick={onRotateLeft} disabled={busy}>
        <RotateCcw className="size-4" aria-hidden="true" />
      </BarButton>
      <BarButton label="Rotate right" onClick={onRotateRight} disabled={busy}>
        <RotateCw className="size-4" aria-hidden="true" />
      </BarButton>
      <BarButton label="Extract" onClick={onExtract} disabled={busy} title="Save the selected pages as a new PDF">
        <FileOutput className="size-4" aria-hidden="true" />
      </BarButton>
      <BarButton label="Delete" onClick={onDelete} disabled={busy || !canDelete} tone="danger" title={canDelete ? "Delete" : "A PDF needs at least one page"}>
        <Trash2 className="size-4" aria-hidden="true" />
      </BarButton>
      <span className="mx-1 h-5 w-px bg-divider" aria-hidden="true" />
      <button type="button" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClear} className="grid size-9 place-items-center rounded-sm text-muted hover:bg-hover hover:text-ink">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
