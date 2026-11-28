import { ArrowDownToLine, FileOutput, FilePlus2, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { movePosition } from "../viewer/rail-reorder";

export interface PageMenuAnchor {
  readonly id: string;
  readonly element: HTMLElement;
  readonly point?: { x: number; y: number };
}

interface PageMenuProps {
  readonly anchor: PageMenuAnchor;
  readonly label?: string;
  readonly number: number;
  readonly narrow?: boolean;
  readonly rail?: { count: number; move: (index: number) => void };
  readonly canDelete: boolean;
  readonly canMove: boolean;
  readonly onDismiss: () => void;
  readonly onRotate?: (degrees: -90 | 90) => void;
  readonly onDelete: () => void;
  readonly onMove?: () => void;
  readonly onInsert?: () => void;
  readonly onExtract?: () => void;
}

/**
 * Displays page-specific actions against a viewport-clamped tile anchor.
 * @param props The anchor, page details, and available commands.
 * @returns The page actions and their dismiss surface.
 */
export function PageMenu(props: PageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const target = props.rail && movePosition(value, props.number, props.rail.count);
  const [position, setPosition] = useState({ left: 0, top: 0, origin: "", ready: false });
  const { anchor, onDismiss } = props;

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const first = menu.querySelector<HTMLElement>('input:enabled, [role="menuitem"]:enabled');
    (first ?? menu).focus({ preventScroll: true });

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
        left: Math.max(8, Math.min(anchor.point?.x ?? x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(anchor.point?.y ?? y, window.innerHeight - height - 8)),
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
    { icon: RotateCcw, label: "Rotate left", act: () => props.onRotate?.(-90) },
    { icon: RotateCw, label: "Rotate right", act: () => props.onRotate?.(90) },
    { icon: Trash2, label: "Delete", act: props.onDelete, disabled: !props.canDelete, color: "text-danger" },
  ];
  const move = { icon: ArrowDownToLine, label: "Move to…", act: props.onMove, disabled: !props.canMove };
  const remove = { icon: Trash2, label: "Delete page", act: props.onDelete, disabled: !props.canDelete };
  const rows = props.rail
    ? [remove]
    : [
        move,
        { icon: FilePlus2, label: "Insert pages after…", act: props.onInsert, disabled: false },
        { icon: FileOutput, label: "Extract page…", act: props.onExtract, disabled: false },
      ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" aria-hidden="true" onPointerDown={onDismiss} />
      <div
        ref={ref}
        role={props.rail ? "menu" : "group"}
        aria-label={`Actions for page ${props.number}`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (!props.rail && event.key !== "Escape") return;
          if (
            /^\d$/.test(event.key) &&
            event.target !== input.current &&
            input.current?.matches(":enabled") &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            event.preventDefault();
            input.current.focus();
            setValue(event.key);
            return;
          }
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:enabled, input:enabled"));
          const index = items.indexOf(document.activeElement as HTMLElement);
          const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
          if (step || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const next = step
              ? (index + step + items.length) % items.length
              : event.key === "Home"
                ? 0
                : items.length - 1;
            items[next]?.focus();
            return;
          }
          if (event.key !== "Escape" && event.key !== "Tab") return;
          if (event.key === "Escape") event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }}
        style={{ left: position.left, top: position.top, transformOrigin: position.origin }}
        className={`fixed z-41 max-h-[calc(100dvh-16px)] w-[264px] max-w-[calc(100vw-16px)] overflow-auto rounded-xs bg-raised p-1 text-ink shadow-3 ring-1 ring-line transition-[opacity,scale] duration-(--duration-enter) ease-out outline-none motion-reduce:transition-opacity starting:opacity-0 motion-safe:starting:scale-95 ${position.ready ? "" : "opacity-0"}`}
      >
        {!props.rail && (
          <div className="grid gap-0.5 px-3 py-2">
            <span className="truncate font-hand text-lg/none">
              {props.label ? `${props.label} · page` : "Page"} {props.number}
            </span>
            {props.narrow && <span className="text-xs text-muted">Keep holding and drag to move it</span>}
          </div>
        )}
        {!props.rail && (
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {quick.map(({ icon: Icon, label, act, disabled, color }) => (
              <button
                key={label}
                type="button"
                onClick={act}
                disabled={disabled}
                className={`active:bg-active grid min-h-11 justify-items-center gap-1 rounded-[2px] bg-hover px-1 pt-2.5 pb-2 text-xs/none font-medium disabled:text-disabled ${color ?? ""}`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
        {props.rail && (
          <label className="flex min-h-[46px] items-center gap-2 px-3">
            Move to:
            <input
              ref={input}
              className="w-14 rounded-xs border border-line bg-raised px-2 py-1 text-ink"
              type="text"
              inputMode="numeric"
              min={1}
              max={props.rail.count}
              disabled={!props.canMove}
              placeholder={String(props.number)}
              aria-label={`Move page ${props.number} to position`}
              aria-describedby={target === "range" ? "rail-move-hint" : undefined}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                if (typeof target === "number") props.rail?.move(target);
              }}
            />
            {target === "range" && (
              <span id="rail-move-hint" className="text-xs text-muted">
                1–{props.rail.count}
              </span>
            )}
          </label>
        )}
        {rows.map(({ icon: Icon, label, act, disabled }) => (
          <button
            role={props.rail ? "menuitem" : undefined}
            tabIndex={props.rail ? -1 : undefined}
            key={label}
            type="button"
            onClick={act}
            disabled={disabled}
            aria-describedby={props.rail && disabled && label === "Delete page" ? "rail-delete-hint" : undefined}
            className="active:bg-active flex min-h-[46px] w-full items-center gap-2 rounded-[2px] px-3 text-base hover:bg-hover disabled:text-disabled"
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
        {props.rail && !props.canDelete && (
          <p id="rail-delete-hint" className="px-3 py-1 text-xs text-muted">
            Keep at least one page.
          </p>
        )}
      </div>
    </>,
    document.body,
  );
}
