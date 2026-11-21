import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** One choice in the menu. */
export interface MenuOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: LucideIcon;
  /** Keyboard shortcut shown on the right (action menus). */
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

/** A choice, or a thin line between groups of choices. */
export type MenuEntry<T extends string> = MenuOption<T> | "separator";

interface DropdownMenuProps<T extends string> {
  /** Accessible name of the menu, e.g. "Zoom". */
  readonly label: string;
  /** Accessible name of the button, e.g. "Zoom: Fit width". */
  readonly triggerLabel: string;
  /** What the button shows. Receives whether the menu is open (to turn a chevron, for example). */
  readonly renderTrigger: (open: boolean) => ReactNode;
  readonly triggerClassName?: string;
  readonly entries: readonly MenuEntry<T>[];
  /** The checked choice, or `null` when none matches (e.g. a custom zoom). */
  readonly value: T | null;
  readonly onSelect: (value: T) => void;
  /** Where the menu opens relative to the button. */
  readonly placement?: "below-end" | "below-start" | "above-center";
  /** "choice" checks the selected value (a picker); "action" runs commands and shows shortcuts. */
  readonly kind?: "choice" | "action";
  /** Tailwind width class for the menu. */
  readonly widthClassName?: string;
}

/** Matches --duration-exit; the menu stays mounted this long so it can fade out. */
const EXIT_MS = 150;

type Phase = "closed" | "open" | "closing";

const PLACEMENT = {
  "below-end": "top-[calc(100%+6px)] right-0 origin-top-right starting:-translate-y-1",
  "below-start": "top-[calc(100%+6px)] left-0 origin-top-left starting:-translate-y-1",
  "above-center": "bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 origin-bottom starting:translate-y-1",
} as const;

/**
 * A button that opens a list of choices (a single-select menu). Opens with a short scale-and-fade
 * from the side it is anchored to, and fades out on close. Keyboard: Enter, Space, ↓ or ↑ opens;
 * ↑/↓/Home/End move; Enter picks; Esc or Tab closes. A click outside closes it too.
 * @param props Labels, trigger content, entries, the checked value and the select handler.
 * @returns The button and, while open or closing, its menu.
 */
export function DropdownMenu<T extends string>({
  label,
  triggerLabel,
  renderTrigger,
  triggerClassName = "",
  entries,
  value,
  onSelect,
  placement = "below-end",
  widthClassName = "w-48",
  kind = "choice",
}: DropdownMenuProps<T>) {
  const [phase, setPhase] = useState<Phase>("closed");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const menuId = useId();
  const options = entries.filter((entry): entry is MenuOption<T> => entry !== "separator");
  const open = phase === "open";

  const close = useCallback((returnFocus: boolean) => {
    setPhase((current) => (current === "open" ? "closing" : current));
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPhase("closed"), EXIT_MS);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const openMenu = () => {
    clearTimeout(closeTimer.current);
    setPhase("open");
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** Focuses the next enabled item from `target` in the direction of `step`. */
  const moveFocus = (target: number, step: 1 | -1 = 1) => {
    const count = options.length;
    for (let tries = 0; tries < count; tries++) {
      const index = (((target + tries * step) % count) + count) % count;
      if (!options[index]?.disabled) return itemRefs.current[index]?.focus();
    }
  };

  // On open: focus the checked choice (or the first), and close on a click outside.
  useEffect(() => {
    if (!open) return;
    const checked = options.findIndex((option) => option.value === value);
    if (checked >= 0) itemRefs.current[checked]?.focus();
    else moveFocus(0);
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = itemRefs.current.findIndex((item) => item === document.activeElement);
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveFocus(index + 1),
      ArrowUp: () => moveFocus(index - 1, -1),
      Home: () => moveFocus(0),
      End: () => moveFocus(options.length - 1, -1),
      Escape: () => close(true),
      Tab: () => close(true),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  let optionIndex = -1;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={phase !== "closed" ? menuId : undefined}
        aria-label={triggerLabel}
        title={label}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`inline-flex items-center gap-1 rounded-sm text-ink transition-[background-color,transform] duration-(--duration-press) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-(--press-scale) aria-expanded:bg-hover ${triggerClassName}`}
      >
        {renderTrigger(open)}
      </button>

      {phase !== "closed" && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          data-phase={phase}
          className={`absolute z-30 grid gap-px rounded-sm border border-line bg-raised p-1 shadow-2 transition-[opacity,scale,translate] ease-out motion-reduce:transition-opacity starting:scale-96 starting:opacity-0 ${widthClassName} ${PLACEMENT[placement]} ${
            phase === "closing"
              ? "pointer-events-none scale-96 opacity-0 duration-(--duration-exit)"
              : "scale-100 opacity-100 duration-(--duration-pop)"
          }`}
        >
          {entries.map((entry, entryIndex) => {
            if (entry === "separator")
              return <span key={`separator-${entryIndex}`} role="separator" className="mx-2 my-1 h-px bg-divider" />;
            optionIndex++;
            const position = optionIndex;
            const checked = entry.value === value;
            const OptionIcon = entry.icon;
            return (
              <button
                key={entry.value}
                ref={(element) => {
                  itemRefs.current[position] = element;
                }}
                type="button"
                role={kind === "choice" ? "menuitemradio" : "menuitem"}
                aria-checked={kind === "choice" ? checked : undefined}
                disabled={entry.disabled}
                onClick={() => {
                  onSelect(entry.value);
                  close(true);
                }}
                className={`flex items-center gap-3 rounded-xs px-3 text-left text-sm text-ink outline-none transition-colors duration-(--duration-hover) hover:bg-hover focus-visible:bg-hover disabled:pointer-events-none disabled:text-disabled aria-checked:font-semibold ${kind === "action" ? "min-h-8" : "min-h-9"}`}
              >
                {OptionIcon && <OptionIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />}
                <span className="flex-1 whitespace-nowrap">{entry.label}</span>
                {kind === "choice" ? (
                  <Check
                    className={`size-4 shrink-0 text-signal transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                ) : (
                  entry.shortcut && <kbd className="shrink-0 pl-4 font-mono text-2xs text-muted">{entry.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
