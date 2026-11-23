import { useState, type PointerEvent } from "react";
import { colorHex, parseHex } from "./text-runs";

const INKS = [
  ["Black", "#000000"],
  ["Charcoal", "#3b3b38"],
  ["Blue", "#2a6fb0"],
  ["Teal", "#1f7a7a"],
  ["Moss", "#4f7a2a"],
  ["Brown", "#7a4b2a"],
  ["Plum", "#6a3d7a"],
  ["Amber", "#b06a1f"],
] as const;

interface Hsv {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
}

interface ColourPickerProps {
  readonly color: string | null;
  readonly pageColors: readonly string[];
  onChange(color: string): void;
}

/**
 * Reads a hex colour as hue, saturation and value.
 * @param hex The hexadecimal colour.
 * @returns Coordinates in the colour field.
 */
function toHsv(hex: string): Hsv {
  const { r, g, b } = parseHex(hex)!;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta) {
    const sector = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
    hue = (sector * 60 + 360) % 360;
  }
  return { hue, saturation: max ? delta / max : 0, value: max / 255 };
}

/**
 * Converts a field position to a hex colour.
 * @param hsv The field coordinates.
 * @returns Its hexadecimal colour.
 */
function fromHsv({ hue, saturation, value }: Hsv): string {
  /** @param offset The channel phase. @returns The corresponding byte. */
  const channel = (offset: number) => {
    const phase = (offset + hue / 60) % 6;
    return Math.round(255 * value * (1 - saturation * Math.max(0, Math.min(phase, 4 - phase, 1))));
  };
  return colorHex({ r: channel(5), g: channel(3), b: channel(1) });
}

/**
 * Clamps a coordinate in the colour field.
 * @param value A normalized pointer coordinate.
 * @returns A value from zero to one.
 */
function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Shows page and ink swatches, a saturation/value field, hue and editable hex.
 * @param props The current colour, page palette and change handler.
 * @returns The colour controls.
 */
export function ColourPicker({ color, pageColors, onChange }: ColourPickerProps) {
  const [hsv, setHsv] = useState(() => toHsv(color ?? "#000000"));
  const [hex, setHex] = useState(color?.toUpperCase() ?? "");
  const valid = parseHex(hex) !== null;

  /** @param next The new field coordinates. @returns Nothing. */
  const selectHsv = (next: Hsv) => {
    setHsv(next);
    const value = fromHsv(next);
    setHex(value.toUpperCase());
    onChange(value);
  };

  /** @param value The new hex value. @returns Nothing. */
  const selectHex = (value: string) => {
    setHex(value);
    const parsed = parseHex(value);
    if (!parsed) return;
    const next = colorHex(parsed);
    setHsv(toHsv(next));
    onChange(next);
  };

  /** @param event The pointer on the colour field. @returns Nothing. */
  const selectPoint = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    selectHsv({
      ...hsv,
      saturation: unit((event.clientX - rect.left) / rect.width),
      value: unit(1 - (event.clientY - rect.top) / rect.height),
    });
  };

  return (
    <div className="grid gap-3">
      {!!pageColors.length && (
        <Swatches
          title="In this PDF"
          items={pageColors.map((value) => [value.toUpperCase(), value])}
          color={color}
          onChange={selectHex}
        />
      )}
      <InkSwatches color={color} onChange={selectHex} />
      <div className="grid gap-2">
        <p className="text-xs font-semibold text-muted">Any colour</p>
        <button
          type="button"
          aria-label="Saturation and brightness"
          aria-description="Use Left and Right for saturation, Up and Down for brightness."
          className="relative h-[118px] w-full touch-none rounded-md"
          style={{
            background: `linear-gradient(to top, black, transparent),
              linear-gradient(to right, white, hsl(${hsv.hue} 100% 50%))`,
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            selectPoint(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) selectPoint(event);
          }}
          onKeyDown={(event) => {
            const dx = Number(event.key === "ArrowRight") - Number(event.key === "ArrowLeft");
            const dy = Number(event.key === "ArrowUp") - Number(event.key === "ArrowDown");
            if (!dx && !dy) return;
            event.preventDefault();
            selectHsv({ ...hsv, saturation: unit(hsv.saturation + dx / 20), value: unit(hsv.value + dy / 20) });
          }}
        >
          <span
            className="border-white pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-2 shadow-1"
            style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }}
          />
        </button>
        <input
          type="range"
          aria-label="Hue"
          min={0}
          max={360}
          value={Math.round(hsv.hue)}
          className="h-3 w-full appearance-none rounded-pill accent-action max-lg:h-11"
          style={{
            background:
              "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red) " +
              "center / 100% 12px no-repeat",
          }}
          onChange={(event) => selectHsv({ ...hsv, hue: Number(event.currentTarget.value) })}
        />
        <div className="flex items-center gap-2">
          <span
            className="size-7 shrink-0 rounded-sm ring-1 ring-line"
            style={{ backgroundColor: color ?? undefined }}
          />
          <input
            aria-label="Hex colour"
            aria-invalid={!valid}
            className="h-8 min-w-0 flex-1 rounded-sm border border-line bg-surface px-2 tabular-nums max-lg:h-11"
            placeholder={color === null ? "Mixed" : undefined}
            value={hex}
            onChange={(event) => selectHex(event.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Shows the standard ink colours shared by the picker and Properties.
 * @param props The active colour and change handler.
 * @returns The ink swatches.
 */
export function InkSwatches({ color, onChange }: Pick<ColourPickerProps, "color" | "onChange">) {
  return <Swatches title="Ink" items={INKS} color={color} onChange={onChange} />;
}

interface SwatchProps extends Pick<ColourPickerProps, "color" | "onChange"> {
  readonly title: string;
  readonly items: readonly (readonly [string, string])[];
}

/**
 * Renders a labelled group of keyboard-selectable swatches.
 * @param props The group, swatches and active colour.
 * @returns The colour swatches.
 */
export function Swatches({ title, items, color, onChange }: SwatchProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <div
        role="group"
        aria-label={title}
        className="mt-2 grid grid-cols-8 gap-1 max-lg:[grid-template-columns:repeat(auto-fill,minmax(44px,1fr))] max-lg:gap-0"
      >
        {items.map(([name, value]) => (
          <button
            key={value}
            type="button"
            aria-pressed={color === value}
            aria-label={name}
            className="grid aspect-square place-items-center rounded-pill max-lg:min-h-11 max-lg:min-w-11"
            onClick={() => onChange(value)}
          >
            <span
              className="size-[80%] rounded-full ring-1 ring-line"
              style={{
                backgroundColor: value,
                outline: color === value ? "2px solid var(--signal)" : undefined,
                outlineOffset: 2,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
