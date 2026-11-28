import { BookOpen, Ellipsis, FileOutput, FilePlus2, RotateCw, SquareCheck, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PageActionProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

/**
 * Renders a labelled page action in the floating bar.
 * @param props Icon, label, and interaction state.
 * @returns The action button.
 */
function PageAction({ icon: Icon, label, disabled, onClick }: PageActionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-[46px] min-w-[54px] touch-manipulation place-content-center justify-items-center gap-[3px] rounded-[13px] px-1 text-[11px]/none font-medium text-ink active:bg-hover disabled:text-disabled motion-safe:active:scale-95"
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </button>
  );
}

interface PhonePageBarProps {
  readonly count: number;
  readonly busy: boolean;
  readonly canDelete: boolean;
  readonly onClear: () => void;
  readonly onSelectAll: () => void;
  readonly onInsert: () => void;
  readonly onRead: () => void;
  readonly onRotate: () => void;
  readonly onExtract: () => void;
  readonly onDelete: () => void;
  readonly onMore: () => void;
}

/**
 * Displays the phone's organize commands in the floating toolbar.
 * @param props Selection state and page commands.
 * @returns The phone page toolbar.
 */
export function PhonePageBar(props: PhonePageBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Page actions"
      className="absolute bottom-3 left-1/2 z-6 flex -translate-x-1/2 items-center rounded-[18px] bg-raised p-[5px] shadow-[0_10px_28px_-10px_rgb(var(--shadow-rgb)/38%),0_2px_6px_-2px_rgb(var(--shadow-rgb)/18%)] ring-1 ring-ink/9"
    >
      {props.count > 0 ? (
        <>
          <button
            type="button"
            aria-label={`Clear selection, ${props.count} selected`}
            onClick={props.onClear}
            className="mr-1 inline-flex h-[46px] min-w-11 items-center gap-1.5 rounded-[13px] bg-signal-soft pr-2.5 pl-3.5 text-sm/none font-semibold whitespace-nowrap tabular-nums"
          >
            {props.count} <X className="size-4 text-muted" aria-hidden="true" />
          </button>
          <PageAction icon={RotateCw} label="Rotate" disabled={props.busy} onClick={props.onRotate} />
          <PageAction icon={FileOutput} label="Extract" disabled={props.busy} onClick={props.onExtract} />
          <PageAction icon={Trash2} label="Delete" disabled={props.busy || !props.canDelete} onClick={props.onDelete} />
          <PageAction icon={Ellipsis} label="More" onClick={props.onMore} />
        </>
      ) : (
        <>
          <PageAction icon={SquareCheck} label="Select all" onClick={props.onSelectAll} />
          <PageAction icon={FilePlus2} label="Insert pages" disabled={props.busy} onClick={props.onInsert} />
          <PageAction icon={BookOpen} label="Read" onClick={props.onRead} />
        </>
      )}
    </div>
  );
}
