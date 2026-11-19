import type { Rgb } from "@pdf-editor/core";
import { Check } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

interface ColorSwatchesProps {
  readonly label: string;
  readonly swatches: readonly { readonly name: string; readonly color: Rgb }[];
  /** The current colour; a colour that matches no swatch leaves none checked. */
  readonly value: Rgb;
  onChange(color: Rgb): void;
}

/**
 * Whether two colours are the same.
 * @param a A colour.
 * @param b Another colour.
 * @returns True when every channel matches.
 */
function sameColor(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/**
 * Relative luminance, to put a light or dark tick on a swatch.
 * @param color A colour.
 * @returns 0 (black) to 1 (white).
 */
function luminance({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * A row of round colour swatches, one radio button each. Arrow keys move between them.
 * @param props Label, swatches, the current colour and the change callback.
 * @returns A radiogroup.
 */
export function ColorSwatches({ label, swatches, value, onChange }: ColorSwatchesProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const checked = swatches.findIndex((swatch) => sameColor(swatch.color, value));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (Math.max(checked, 0) + step + swatches.length) % swatches.length;
    onChange(swatches[next]!.color);
    groupRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {swatches.map((swatch, index) => {
        const isChecked = index === checked;
        const { r, g, b } = swatch.color;
        return (
          <button
            key={swatch.name}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-label={swatch.name}
            title={swatch.name}
            tabIndex={isChecked || (checked === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(swatch.color)}
            className={`grid size-7.5 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/14%)] transition-[transform,box-shadow] duration-(--duration-press) ease-out active:scale-[0.92] ${
              isChecked ? "ring-2 ring-signal ring-offset-2 ring-offset-surface" : "hover:scale-105"
            }`}
            style={{ backgroundColor: `rgb(${r} ${g} ${b})` }}
          >
            <Check className={`size-3.5 transition-opacity duration-(--duration-press) ${isChecked ? "opacity-100" : "opacity-0"} ${luminance(swatch.color) > 0.5 ? "text-paper-ink" : "text-paper-field"}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
