import { annotationRevisionOf } from "@pdf-editor/core";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDocument } from "../../editor/hooks";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "../../hooks/use-media-query";
import { useViewer } from "../../state/viewer-store";
import { InkSwatches, Swatches } from "./ColourPicker";
import type { FormatPanel } from "./FormatBar";
import { TextStyleMenu } from "./TextStyleMenu";
import { useMenuPresence } from "./use-menu-presence";
import { colorHex, displayFont, parseHex } from "./text-runs";
import { useTextPageColors } from "./use-text-page-colors";
import { displayTextSize, focusPageTextDraft, stepTextSize, TEXT_STYLE_TOGGLES, useTextStyle } from "./use-text-style";

const BUTTON = "grid min-h-9 min-w-9 place-items-center rounded-sm hover:bg-hover max-lg:min-h-11";
const FONT_BUTTON =
  "flex min-h-11 items-center justify-between rounded-md border border-line " +
  "bg-surface px-3 text-base hover:border-muted";

/**
 * Shows text formatting in the Properties panel and the phone tool tray.
 * @param props Whether the surrounding tray already has its own heading.
 * @returns Controls for the selected words or the next text typed.
 */
export function TextProperties({ hideHeading = false }: { readonly hideHeading?: boolean } = {}) {
  const { style, pageId, pageText, selectionText, blockText, setStyle } = useTextStyle();
  const current = useViewer((state) => state.currentPage);
  const page = useDocument((state) => (pageId ? state.pages.find(({ id }) => id === pageId) : state.pages[current]));
  const revision = useDocument((state) => annotationRevisionOf(state, page?.id ?? ""));
  const colors = useTextPageColors(page?.id ?? "", revision);
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [panel, setPanel] = useState<FormatPanel | null>(null);
  const mountedPanel = useMenuPresence(panel, wide);
  const trigger = useRef<HTMLButtonElement>(null);
  const editorFocused = useRef(false);
  const font = displayFont(style);
  const size = style.fontSize === null ? null : displayTextSize(style.fontSize);
  const color = style.color ? colorHex(style.color) : null;
  const mixedFormats = TEXT_STYLE_TOGGLES.some(([format]) => style[format] === null);

  useEffect(() => {
    if (!panel || !wide) return;
    /** @param event The interaction. @returns Nothing. */
    const outside = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest("[data-text-menu]") ||
        trigger.current?.contains(event.target)
      )
        return;
      setPanel(null);
      if (event.type === "pointerdown") trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
    };
  }, [panel, wide]);

  /** @param next The popup to toggle. @param button The popup's trigger. @returns Nothing. */
  const open = (next: FormatPanel, button: HTMLButtonElement) => {
    trigger.current = button;
    editorFocused.current = pageText && !!document.activeElement?.closest("[data-page-text-editor]");
    setPanel(panel === next ? null : next);
  };

  /** @returns Nothing. */
  const close = () => {
    setPanel(null);
    if (!wide && editorFocused.current) requestAnimationFrame(focusPageTextDraft);
    else trigger.current?.focus({ preventScroll: true });
  };

  /** @param value The new colour as hex. @returns Nothing. */
  const selectColor = (value: string) => {
    const color = parseHex(value);
    if (color) setStyle({ color });
  };

  return (
    <section
      aria-label="Text"
      data-text-style-controls=""
      className="grid gap-4"
      onMouseDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button") &&
          !event.target.closest('[role="dialog"], dialog') &&
          document.activeElement?.closest("[data-added-text-editor], [data-page-text-editor]")
        )
          event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (!panel || !wide || event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      {!hideHeading && <h3 className="font-hand text-xl">Text</h3>}
      <div className="grid gap-1">
        <span className="text-sm text-muted">Font</span>
        <button
          type="button"
          aria-label={`Font: ${font?.name ?? "Mixed"}`}
          aria-haspopup="dialog"
          aria-expanded={panel === "font"}
          className={FONT_BUTTON}
          style={{ fontFamily: font?.css }}
          onClick={(event) => open("font", event.currentTarget)}
        >
          {font?.name ?? "Mixed"}
          <ChevronDown className="size-4 text-muted" aria-hidden="true" />
        </button>
        {mountedPanel === "font" && (
          <TextStyleMenu
            panel={mountedPanel}
            trigger={trigger}
            closing={!panel}
            pageId={page?.id ?? ""}
            hasDraft={!!pageId}
            pageText={pageText}
            selectionText={selectionText}
            blockText={blockText}
            style={style}
            pageColors={colors}
            wide={wide}
            onChange={setStyle}
            onDismiss={close}
          />
        )}
      </div>
      <div className="grid gap-1">
        <span className="text-sm text-muted">Size</span>
        <div
          role="group"
          aria-label="Size"
          className="grid grid-cols-[auto_1fr_auto] items-center rounded-md border border-line"
        >
          <button
            type="button"
            className={BUTTON}
            aria-label="Decrease font size"
            disabled={size === 6}
            onClick={() => setStyle({ fontSize: stepTextSize(style.fontSize, -1) })}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="text-center text-sm tabular-nums">{size === null ? "Mixed" : `${size} pt`}</span>
          <button
            type="button"
            className={BUTTON}
            aria-label="Increase font size"
            disabled={size === 96}
            onClick={() => setStyle({ fontSize: stepTextSize(style.fontSize, 1) })}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-sm text-muted">{mixedFormats ? "Style · Mixed" : "Style"}</span>
        <div role="group" aria-label="Style" className="grid grid-cols-3 gap-1 rounded-md bg-surface p-1">
          {TEXT_STYLE_TOGGLES.map(([format, label, classes]) => (
            <button
              key={format}
              type="button"
              aria-pressed={style[format] ?? "mixed"}
              aria-label={`${format[0]!.toUpperCase()}${format.slice(1)}${style[format] === null ? ": Mixed" : ""}`}
              className={`${BUTTON} ${classes} aria-pressed:bg-pressed ${style[format] === null ? "ring-1 ring-line" : ""}`}
              onClick={() => setStyle({ [format]: style[format] !== true })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <span className="text-sm text-muted">{color === null ? "Colour · Mixed" : "Colour"}</span>
        {colors.length > 0 && (
          <Swatches
            title="On this page"
            items={colors.map((value) => [value.toUpperCase(), value])}
            color={color}
            onChange={selectColor}
          />
        )}
        <InkSwatches color={color} onChange={selectColor} />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={panel === "colour"}
          className="flex min-h-9 items-center gap-1 justify-self-start rounded-sm px-2 text-sm hover:bg-hover max-lg:h-11"
          onClick={(event) => open("colour", event.currentTarget)}
        >
          <Plus className="size-4" aria-hidden="true" />
          More colours
        </button>
        {mountedPanel === "colour" && (
          <TextStyleMenu
            panel={mountedPanel}
            trigger={trigger}
            closing={!panel}
            pageId={page?.id ?? ""}
            hasDraft={!!pageId}
            selectionText={selectionText}
            blockText={blockText}
            style={style}
            pageColors={colors}
            wide={wide}
            onChange={setStyle}
            onDismiss={close}
          />
        )}
      </div>
      <p className="text-sm text-muted">Changes apply to the selected words or to the next text you type.</p>
    </section>
  );
}
