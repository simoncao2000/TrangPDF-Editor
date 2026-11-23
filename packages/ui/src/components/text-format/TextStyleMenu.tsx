import { useEffect, useRef, type CSSProperties } from "react";
import { Sheet } from "../primitives/Sheet";
import { ColourPicker } from "./ColourPicker";
import { FontPicker } from "./FontPicker";
import type { FormatPanel } from "./FormatBar";
import { colorHex, parseHex, type RunStyle } from "./text-runs";
import type { TextStyle } from "./use-text-style";

interface TextStyleMenuProps {
  readonly blockText: string;
  readonly hasDraft: boolean;
  readonly pageId: string;
  readonly selectionText: string;
  readonly panel: FormatPanel;
  readonly style: TextStyle;
  readonly pageColors: readonly string[];
  readonly wide: boolean;
  readonly position?: CSSProperties;
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
  position,
  onChange,
  onDismiss,
  pageId,
  selectionText,
  hasDraft,
  blockText,
}: TextStyleMenuProps) {
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wide && panel === "colour") popup.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [panel, wide]);

  const title = panel === "font" ? "Font" : "Text colour";
  const content =
    panel === "font" ? (
      <FontPicker
        pageId={pageId}
        hasDraft={hasDraft}
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
      style={position}
      className={[
        "z-10 max-h-[70vh] overflow-y-auto rounded-lg bg-raised text-sm text-ink ring-1 ring-line",
        panel === "colour" && "p-3",
        position ? "absolute shadow-3" : "w-full",
        position && (panel === "font" ? "left-0 w-80" : "right-0 w-[268px]"),
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {content}
    </div>
  );
}
