import { ChevronDown, Minus, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { colorHex, displayFont } from "./text-runs";
import { displayTextSize, stepTextSize, TEXT_STYLE_TOGGLES, type FormatToggle, type TextStyle } from "./use-text-style";

export type FormatPanel = "font" | "colour";

interface FormatBarProps {
  readonly style: TextStyle;
  readonly panel: FormatPanel | null;
  onPanel(panel: FormatPanel, trigger: HTMLButtonElement): void;
  onSize(size: number): void;
  onToggle(format: FormatToggle): void;
}

const BUTTON =
  "h-8 min-w-8 shrink-0 touch-manipulation place-items-center rounded-md px-1.5 hover:bg-hover " +
  "aria-pressed:bg-pressed aria-expanded:bg-pressed max-lg:h-11 max-lg:min-w-11 aria-disabled:text-disabled";

/**
 * Displays the inline text controls with one tab stop and arrow-key navigation.
 * @param props The selection's style and formatting actions.
 * @returns A formatting toolbar.
 */
export function FormatBar({ style, panel, onPanel, onSize, onToggle }: FormatBarProps) {
  const [active, setActive] = useState(0);
  const family = displayFont(style);

  const size = style.fontSize === null ? null : displayTextSize(style.fontSize);
  /** @param event The toolbar keyboard event. @returns Nothing. */
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
    const directions: Record<string, number> = {
      ArrowLeft: (active + buttons.length - 1) % buttons.length,
      ArrowRight: (active + 1) % buttons.length,
      Home: 0,
      End: buttons.length - 1,
    };
    const index = directions[event.key];
    if (index === undefined) return;
    event.preventDefault();
    buttons[index]?.focus();
  };

  /** @param index The control number. @returns Its roving focus properties. */
  const focus = (index: number) => ({
    tabIndex: active === index ? 0 : -1,
    onFocus: () => setActive(index),
  });

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex w-max items-center gap-0.5 rounded-xs bg-raised p-1 text-sm leading-none text-ink shadow-3 ring-1 ring-line select-none max-lg:w-full max-lg:justify-between max-lg:overflow-x-auto max-lg:rounded-none max-lg:bg-toolbar max-lg:px-1.5 max-lg:shadow-none"
      onKeyDown={navigate}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        {...focus(0)}
        aria-label={`Font: ${family?.name ?? "Mixed"}`}
        aria-haspopup="dialog"
        aria-expanded={panel === "font"}
        className={`${BUTTON} flex min-w-20 items-center justify-between gap-1 text-base whitespace-nowrap`}
        onClick={(event) => onPanel("font", event.currentTarget)}
        style={{ fontFamily: family?.css }}
      >
        {family?.name ?? "Mixed"}
        <ChevronDown className="size-4 text-muted" aria-hidden="true" />
      </button>
      <Divider />
      <div className="flex items-center">
        <button
          type="button"
          {...focus(1)}
          className={`grid ${BUTTON}`}
          aria-label="Decrease font size"
          aria-disabled={size === 6}
          onClick={() => onSize(stepTextSize(style.fontSize, -1))}
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span
          className="min-w-7 text-center font-semibold tabular-nums"
          aria-label={size === null ? "Mixed sizes" : `${size} points`}
        >
          {size ?? "Mixed"}
        </span>
        <button
          type="button"
          {...focus(2)}
          className={`grid ${BUTTON}`}
          aria-label="Increase font size"
          aria-disabled={size === 96}
          onClick={() => onSize(stepTextSize(style.fontSize, 1))}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      <Divider />
      {TEXT_STYLE_TOGGLES.map(([format, label, classes], index) => (
        <button
          key={format}
          type="button"
          {...focus(index + 3)}
          aria-pressed={style[format] ?? "mixed"}
          className={`grid ${BUTTON} ${classes}`}
          aria-label={`${format[0]!.toUpperCase()}${format.slice(1)}${style[format] === null ? ": Mixed" : ""}`}
          onClick={() => onToggle(format)}
        >
          {label}
        </button>
      ))}
      <Divider />
      <button
        type="button"
        {...focus(6)}
        className={`grid ${BUTTON} content-center gap-0.5 font-semibold`}
        aria-label={style.color ? "Text colour" : "Text colour: Mixed"}
        aria-haspopup="dialog"
        aria-expanded={panel === "colour"}
        onClick={(event) => onPanel("colour", event.currentTarget)}
      >
        A
        <span
          className="h-1 w-4 rounded-xs ring-1 ring-line"
          style={{ backgroundColor: style.color ? colorHex(style.color) : undefined }}
        />
      </button>
    </div>
  );
}

/** @returns A separator between desktop toolbar control groups. */
function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-divider max-lg:hidden" />;
}
