import type { ScreenPoint } from "@pdf-editor/core";

/** @param event Viewport pointer coordinates. @param surface The page hit area. @returns Page-local CSS pixels. */
export function pagePointer(event: Pick<PointerEvent, "clientX" | "clientY">, surface: SVGRectElement): ScreenPoint {
  const box = surface.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * Tracks a signature on the page, coalescing hover events into one transform per frame.
 * @param surface The page hit area.
 * @param preview The prepared signature at the page origin, if available.
 * @param hover Last hover position, retained while the typed image loads.
 * @returns Listener and pending frame cleanup.
 */
export function trackSignature(
  surface: SVGRectElement,
  preview: SVGGElement | null,
  hover: { current: ScreenPoint | null },
) {
  let frame: number | undefined;

  /** @returns Nothing. */
  function hide() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (preview) {
      preview.style.visibility = "hidden";
      surface.style.removeProperty("cursor");
    }
  }

  /** @returns Nothing. */
  function paint() {
    frame = undefined;
    const point = hover.current;
    if (!preview || !point) return;
    preview.setAttribute("transform", `translate(${point.x} ${point.y})`);
    preview.style.visibility = "visible";
    surface.style.cursor = "none";
  }

  /** @param event The latest pointer sample. @returns Nothing. */
  function move(event: PointerEvent) {
    if (event.pointerType === "touch" || event.buttons) return leave();
    hover.current = pagePointer(event, surface);
    if (!preview) return;
    if (frame === undefined) frame = requestAnimationFrame(paint);
  }

  /** @returns Nothing. */
  function leave() {
    hover.current = null;
    hide();
  }

  if (hover.current && preview) paint();
  surface.addEventListener("pointerenter", move);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerdown", leave);
  surface.addEventListener("pointerleave", leave);
  surface.addEventListener("pointercancel", leave);
  return () => {
    hide();
    surface.removeEventListener("pointerenter", move);
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerdown", leave);
    surface.removeEventListener("pointerleave", leave);
    surface.removeEventListener("pointercancel", leave);
  };
}
