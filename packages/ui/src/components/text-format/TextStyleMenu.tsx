import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Sheet } from "../primitives/Sheet";
import { ColourPicker } from "./ColourPicker";
import { FontPicker } from "./FontPicker";
import type { FormatPanel } from "./FormatBar";
import { colorHex, parseHex, type RunStyle } from "./text-runs";
import type { TextStyle } from "./use-text-style";

interface TextStyleMenuProps {
  readonly blockText: string;
  readonly hasDraft: boolean;
  readonly pageText?: boolean;
  readonly pageId: string;
  readonly selectionText: string;
  readonly panel: FormatPanel;
  readonly style: TextStyle;
  readonly pageColors: readonly string[];
  readonly wide: boolean;
  readonly trigger: RefObject<HTMLElement | null>;
  readonly closing: boolean;
  onChange(patch: Partial<RunStyle>): void;
  onDismiss(): void;
}

/**
 * Opens the shared font or colour controls in a desktop popup or a phone sheet.
 * @param props The popup, its current values and change handlers.
 * @returns The font menu or colour picker.
 */
export function TextStyleMenu({
  panel,
  style,
  pageColors,
  wide,
  trigger,
  closing,
  onChange,
  onDismiss,
  pageId,
  selectionText,
  hasDraft,
  blockText,
  pageText,
}: TextStyleMenuProps) {
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = popup.current;
    const button = trigger.current;
    if (!wide || !button || !menu) return;
    menu.showPopover();
    /** @returns Nothing. */
    function place() {
      if (!menu || !button) return;
      const anchor = button.getBoundingClientRect();
      const below = innerHeight - anchor.bottom - 12;
      const above = anchor.top - 12;
      menu.style.minWidth = `${anchor.width}px`;
      const up = menu.scrollHeight > below && above > below;
      menu.style.maxHeight = `${Math.max(0, up ? above : below)}px`;
      const left = Math.max(8, Math.min(anchor.left, innerWidth - menu.offsetWidth - 8));
      menu.style.left = `${left}px`;
      menu.style.top = up ? "auto" : `${anchor.bottom + 4}px`;
      menu.style.bottom = up ? `${innerHeight - anchor.top + 4}px` : "auto";
      menu.style.transformOrigin = `${anchor.left + anchor.width / 2 - left}px ${up ? "bottom" : "top"}`;
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(button);
    observer.observe(menu);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      menu.hidePopover();
    };
  }, [panel, trigger, wide]);
  useEffect(() => {
    if (wide && panel === "colour") popup.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [panel, wide]);

  const title = panel === "font" ? "Font" : "Text colour";
  const content =
    panel === "font" ? (
      <FontPicker
        pageId={pageId}
        hasDraft={hasDraft}
        pageText={pageText}
        blockText={blockText}
        text={selectionText}
        style={style}
        wide={wide}
        onPick={(patch) => {
          onChange(patch);
          onDismiss();
        }}
      />
    ) : (
      <ColourPicker
        color={style.color ? colorHex(style.color) : null}
        pageColors={pageColors}
        onChange={(value) => {
          const color = parseHex(value);
          if (color) onChange({ color });
        }}
      />
    );

  if (!wide)
    return (
      <Sheet title={title} onDismiss={onDismiss}>
        {content}
      </Sheet>
    );
  return (
    <div
      ref={popup}
      role="dialog"
      aria-label={title}
      popover="manual"
      inert={closing}
      data-text-menu=""
      className={[
        "z-10 max-h-[70vh] overflow-y-auto rounded-xs bg-raised text-sm text-ink ring-1 ring-line",
        panel === "colour" && "p-3",
        "fixed inset-auto m-0 shadow-3 transition-[opacity,scale] ease-(--curve-out) motion-reduce:transition-opacity",
        closing
          ? "opacity-0 duration-(--duration-exit)"
          : "duration-(--duration-pop) starting:opacity-0 motion-safe:starting:scale-97",
        panel === "font" ? "w-80" : "w-[268px]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {content}
    </div>
  );
}
