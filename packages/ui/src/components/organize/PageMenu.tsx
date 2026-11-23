import { ArrowDownToLine, FileOutput, FilePlus2, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface PageMenuAnchor {
  readonly id: string;
  readonly element: HTMLElement;
}

interface PageMenuProps {
  readonly anchor: PageMenuAnchor;
  readonly label: string;
  readonly number: number;
  readonly narrow: boolean;
  readonly canDelete: boolean;
  readonly canMove: boolean;
  readonly onDismiss: () => void;
  readonly onRotate: (degrees: -90 | 90) => void;
  readonly onDelete: () => void;
  readonly onMove: () => void;
  readonly onInsert: () => void;
  readonly onExtract: () => void;
}

/**
 * Displays page-specific actions against a viewport-clamped tile anchor.
 * @param props The anchor, page details, and available commands.
 * @returns The page actions and their dismiss surface.
 */
export function PageMenu(props: PageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, origin: "", ready: false });
  const { anchor, onDismiss } = props;

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    menu.focus({ preventScroll: true });

    /** @returns Nothing. Repositions the menu within the visible viewport. */
    function place() {
      if (!menu) return;
      const rect = anchor.element.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = menu;
      const above = rect.bottom + 8 + height > window.innerHeight - 8 && rect.top > window.innerHeight - rect.bottom;
      const alignLeft = rect.left < window.innerWidth / 2;
      const x = alignLeft ? rect.left : rect.right - width;
      const y = above ? rect.top - height - 8 : rect.bottom + 8;
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
        origin: `${alignLeft ? "left" : "right"} ${above ? "bottom" : "top"}`,
        ready: true,
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (menu.contains(document.activeElement)) anchor.element.focus({ preventScroll: true });
    };
  }, [anchor]);

  const quick = [
    { icon: RotateCcw, label: "Rotate left", act: () => props.onRotate(-90) },
    { icon: RotateCw, label: "Rotate right", act: () => props.onRotate(90) },
    { icon: Trash2, label: "Delete", act: props.onDelete, disabled: !props.canDelete, color: "text-danger" },
  ];
  const rows = [
    { icon: ArrowDownToLine, label: "Move to…", act: props.onMove, disabled: !props.canMove },
    { icon: FilePlus2, label: "Insert pages after…", act: props.onInsert },
    { icon: FileOutput, label: "Extract page…", act: props.onExtract },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" aria-hidden="true" onPointerDown={onDismiss} />
      <div
        ref={ref}
        role="group"
        aria-label={`Actions for page ${props.number}`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onDismiss();
        }}
        style={{ left: position.left, top: position.top, transformOrigin: position.origin }}
        className={`fixed z-41 max-h-[calc(100dvh-16px)] w-[264px] max-w-[calc(100vw-16px)] overflow-auto rounded-lg bg-raised p-1 text-ink shadow-3 ring-1 ring-line transition-[opacity,scale] duration-(--duration-enter) ease-out outline-none motion-reduce:transition-opacity starting:opacity-0 motion-safe:starting:scale-95 ${position.ready ? "" : "opacity-0"}`}
      >
        <div className="grid gap-0.5 px-3 py-2">
          <span className="truncate font-hand text-lg/none">
            {props.label} · page {props.number}
          </span>
          {props.narrow && <span className="text-xs text-muted">Keep holding and drag to move it</span>}
        </div>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {quick.map(({ icon: Icon, label, act, disabled, color }) => (
            <button
              key={label}
              type="button"
              onClick={act}
              disabled={disabled}
              className={`active:bg-active grid min-h-11 justify-items-center gap-1 rounded-md bg-hover px-1 pt-2.5 pb-2 text-xs/none font-medium disabled:text-disabled ${color ?? ""}`}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {rows.map(({ icon: Icon, label, act, disabled }) => (
          <button
            key={label}
            type="button"
            onClick={act}
            disabled={disabled}
            className="active:bg-active flex min-h-[46px] w-full items-center gap-2 rounded-md px-3 text-base hover:bg-hover disabled:text-disabled"
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
