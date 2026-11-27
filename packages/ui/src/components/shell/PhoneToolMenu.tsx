import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { ToolInfo } from "../../editor/tool-catalog";

import { PHONE_SURFACE_MOTION } from "./phone-surface-motion";

const MENU_STYLE = [
  "absolute -m-1 flex max-h-[min(62vh,420px)] flex-col-reverse gap-2 overflow-y-auto",
  "overscroll-contain p-1 [scrollbar-width:none]",
].join(" ");
const ROW_STYLE = [
  "flex min-h-12 shrink-0 touch-manipulation items-center gap-3 rounded-pill bg-raised",
  "py-0 pr-4 pl-[5px] text-base/none font-medium whitespace-nowrap shadow-[0_8px_20px_-10px_rgb(var(--shadow-rgb)/40%)]",
  "ring-1 ring-ink/8 active:bg-hover active:delay-0 motion-safe:active:scale-97",
].join(" ");

interface PhoneToolMenuProps {
  readonly label: string;
  readonly open: boolean;
  readonly alignStart?: boolean;
  readonly rows: readonly ToolInfo[];
  readonly checked: ToolInfo["tool"];
  onPick(index: number): void;
}

/**
 * A rising column in nearest-first keyboard and animation order.
 * @param props The menu's anchor, tools, selection and pick handler.
 * @returns The tool menu.
 */
export function PhoneToolMenu({ label, open, alignStart, rows, checked, onPick }: PhoneToolMenuProps) {
  const menu = useRef<HTMLDivElement>(null);

  /**
   * Moves focus to the nearest tool when the column opens.
   * @returns Nothing.
   */
  function focusFirst() {
    if (open) menu.current?.querySelector("button")?.focus();
  }

  useLayoutEffect(focusFirst, [open]);

  /**
   * Moves focus through the visual column with the arrow keys.
   * @param event The keyboard event from the menu.
   * @returns Nothing.
   */
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll("button"));
    const index = items.findIndex((item) => item === document.activeElement);
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = (index + 1) % items.length;
        break;
      case "ArrowDown":
        next = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        next = items.length - 1;
        break;
      case "End":
        next = 0;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  const anchor = alignStart
    ? "bottom-[calc(100%+var(--space-3)+5px)] left-0 items-start"
    : "right-0 bottom-[calc(100%+var(--space-3))] items-end";
  const origin = alignStart ? "origin-bottom-left" : "origin-bottom-right";
  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={navigate}
      className={`${MENU_STYLE} ${anchor}`}
    >
      {rows.map(({ tool, icon: Icon, label: name }, index) => (
        <button
          key={tool}
          type="button"
          role="menuitemradio"
          aria-checked={checked === tool}
          tabIndex={-1}
          onClick={() => onPick(index)}
          style={{ "--tool-delay": `${index * 32}ms` } as CSSProperties}
          data-closed={open ? undefined : true}
          className={`${ROW_STYLE} ${origin} ${PHONE_SURFACE_MOTION} ${open ? "motion-safe:delay-(--tool-delay)" : ""}`}
        >
          <span
            className={`grid size-[38px] shrink-0 place-items-center rounded-pill ${checked === tool ? "bg-action text-on-action" : "bg-pressed"}`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {name}
        </button>
      ))}
    </div>
  );
}
