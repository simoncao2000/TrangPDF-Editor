import { ZOOM_PRESETS, type ZoomMode } from "@pdf-editor/core";
import { ChevronDown, Maximize, MoveHorizontal } from "lucide-react";
import { useViewer } from "../../state/viewer-store";
import { DropdownMenu, type MenuEntry } from "../primitives/DropdownMenu";

type ZoomValue = "fit-width" | "fit-page" | `${number}`;

const ENTRIES: readonly MenuEntry<ZoomValue>[] = [
  { value: "fit-width", label: "Fit width", icon: MoveHorizontal },
  { value: "fit-page", label: "Fit page", icon: Maximize },
  "separator",
  ...ZOOM_PRESETS.map((preset) => ({ value: `${preset}` as ZoomValue, label: `${preset * 100}%` })),
];

/**
 * Turns a zoom mode into the menu value it matches.
 * @param mode The current zoom mode.
 * @returns The matching entry's value, or `null` for a zoom that is not a preset.
 */
function toValue(mode: ZoomMode): ZoomValue | null {
  if (mode.kind !== "percent") return mode.kind;
  return ZOOM_PRESETS.some((preset) => preset === mode.zoom) ? `${mode.zoom}` : null;
}

/**
 * Turns a menu value back into a zoom mode.
 * @param value The chosen entry.
 * @returns The zoom mode to apply.
 */
function toMode(value: ZoomValue): ZoomMode {
  return value === "fit-width" || value === "fit-page" ? { kind: value } : { kind: "percent", zoom: Number(value) };
}

/**
 * The zoom dropdown in the page control. The button always shows the real zoom percentage,
 * and the menu says which mode produced it.
 * @returns The dropdown, opening upwards from the floating control.
 */
export function ZoomMenu() {
  const { zoom, zoomMode, setZoomMode } = useViewer();
  const percent = `${Math.round(zoom * 100)}%`;
  const modeName = zoomMode.kind === "fit-width" ? "Fit width" : zoomMode.kind === "fit-page" ? "Fit page" : percent;

  return (
    <DropdownMenu
      label="Zoom"
      triggerLabel={`Zoom: ${modeName}, ${percent}`}
      entries={ENTRIES}
      value={toValue(zoomMode)}
      onSelect={(value) => setZoomMode(toMode(value))}
      placement="above-center"
      widthClassName="w-44"
      triggerClassName="h-8.5 px-2.5 font-mono text-sm font-semibold tabular-nums"
      renderTrigger={(open) => (
        <>
          <span className="min-w-11 text-center">{percent}</span>
          <ChevronDown
            className={`size-3.5 text-muted transition-transform duration-(--duration-pop) ease-out ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </>
      )}
    />
  );
}
