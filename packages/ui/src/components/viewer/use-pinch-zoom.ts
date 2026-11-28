import { clampZoom, type PageLayout, type ScreenPoint, type ZoomMode } from "@pdf-editor/core";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useViewer } from "../../state/viewer-store";

/** @param zoom Starting zoom. @param before Initial distance. @param after Current distance. @returns Bounded zoom. */
export function pinchZoom(zoom: number, before: number, after: number) {
  return clampZoom((zoom * after) / Math.max(1, before));
}

/** @param zoom Current zoom. @param pixels Normalized wheel delta. @returns Bounded zoom. */
export function wheelZoom(zoom: number, pixels: number) {
  return clampZoom(zoom * Math.exp(-pixels * 0.01));
}

/** @param origin New page origin. @param offset Scaled page offset. @param focal Viewport focus. @returns Scroll. */
export function focalScroll(origin: number, offset: number, focal: number) {
  return origin + offset - focal;
}

/** @param touch Whether this is a touch double-tap. @param hit Resolved page hit. @returns Whether to zoom. */
export function shouldZoomTap(touch: boolean, hit: unknown) {
  return touch && hit === null;
}

interface Geometry {
  layout: PageLayout;
  contentWidth: number;
  zoom: number;
}

/** @param viewport Scroll container. @param geometry Committed page geometry. @returns Stack ref and tap handler. */
export function usePinchZoom(viewport: RefObject<HTMLDivElement | null>, geometry: Geometry) {
  const stackRef = useRef<HTMLDivElement>(null);
  const latest = useRef(geometry);
  const tap = useRef<(point: ScreenPoint) => void>(() => {});
  useLayoutEffect(() => {
    latest.current = geometry;
  });
  useLayoutEffect(() => {
    const view = viewport.current;
    const stack = stackRef.current;
    if (!view || !stack) return;
    const abort = new AbortController();
    const options = { capture: true, passive: false, signal: abort.signal };
    const fingers = new Map<number, PointerEvent>();
    let active = false;
    let safari = false;
    let startDistance = 1;
    let frame = 0;
    let timer = 0;
    let bounds = view.getBoundingClientRect();
    let start = { x: 0, y: 0 };
    let focal = start;
    let target = 1;
    let index = 0;
    let offset = start;

    /** @param client Client-space focal point. @returns Nothing. */
    function begin(client: ScreenPoint) {
      bounds = view!.getBoundingClientRect();
      focal = start = { x: client.x - bounds.left, y: client.y - bounds.top };
      const { layout, contentWidth, zoom } = latest.current;
      const y = view!.scrollTop + start.y;
      const next = layout.boxes.findIndex((box) => box.top + box.height >= y);
      index = next < 0 ? layout.boxes.length - 1 : next;
      const box = layout.boxes[index];
      offset = { x: view!.scrollLeft + start.x - (contentWidth - (box?.width ?? 0)) / 2, y: y - (box?.top ?? 0) };
      target = zoom;
      stack!.style.transformOrigin = `${view!.scrollLeft + start.x}px ${y}px`;
    }

    /** @returns Nothing. */
    function preview() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const shift = `translate(${focal.x - start.x}px, ${focal.y - start.y}px)`;
        stack!.style.transform = `${shift} scale(${target / latest.current.zoom})`;
      });
    }

    /** @param mode Requested zoom mode. @returns Nothing. */
    function commit(mode: ZoomMode = { kind: "percent", zoom: target }) {
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(timer);
      timer = 0;
      const before = latest.current.zoom;
      stack!.style.transform = "";
      stack!.style.transformOrigin = "";
      flushSync(() => useViewer.getState().setZoomMode(mode));
      const { zoom, layout, contentWidth } = latest.current;
      const box = layout.boxes[index];
      if (!box) return;
      view!.scrollLeft = focalScroll((contentWidth - box.width) / 2, (offset.x * zoom) / before, focal.x);
      view!.scrollTop = focalScroll(box.top, (offset.y * zoom) / before, focal.y);
    }

    tap.current = (point) => {
      begin(point);
      commit(useViewer.getState().zoomMode.kind === "fit-width" ? { kind: "percent", zoom: 2 } : { kind: "fit-width" });
    };

    /** @returns Midpoint and span of the first two contacts. */
    function pair() {
      const [a, b] = [...fingers.values()];
      return {
        x: (a!.clientX + b!.clientX) / 2,
        y: (a!.clientY + b!.clientY) / 2,
        distance: Math.hypot(a!.clientX - b!.clientX, a!.clientY - b!.clientY),
      };
    }

    view.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch") return;
        fingers.set(event.pointerId, event);
        if (fingers.size < 2) return;
        event.stopPropagation();
        if (active && fingers.size > 2) return;
        safari = false;
        if (timer) commit();
        active = true;
        const first = [...fingers.values()][0]!;
        first.target?.dispatchEvent(
          new PointerEvent("pointercancel", {
            bubbles: true,
            pointerId: first.pointerId,
            pointerType: "touch",
            isPrimary: true,
          }),
        );
        for (const id of fingers.keys()) view.setPointerCapture(id);
        const midpoint = pair();
        begin(midpoint);
        startDistance = midpoint.distance;
      },
      options,
    );
    view.addEventListener(
      "pointermove",
      (event) => {
        if (!fingers.has(event.pointerId)) return;
        fingers.set(event.pointerId, event);
        if (!active) return;
        event.stopPropagation();
        if (fingers.size < 2) return;
        const midpoint = pair();
        focal = { x: midpoint.x - bounds.left, y: midpoint.y - bounds.top };
        target = pinchZoom(latest.current.zoom, startDistance, midpoint.distance);
        preview();
      },
      options,
    );
    /** @param event Released or cancelled contact. @returns Nothing. */
    function release(event: PointerEvent) {
      if (event.type === "pointercancel" && !event.isTrusted && active) return;
      if (!fingers.delete(event.pointerId) || !active) return;
      event.stopPropagation();
      if (fingers.size === 1) commit();
      active = fingers.size > 0;
    }
    view.addEventListener("pointerup", release, options);
    view.addEventListener("pointercancel", release, options);
    view.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length > 1) event.preventDefault();
      },
      options,
    );
    /** @param event Safari gesture with cumulative scale and client coordinates. @returns Nothing. */
    function gesture(event: Event) {
      event.preventDefault();
      if (active || fingers.size) return;
      const input = event as MouseEvent & { scale: number };
      if (event.type === "gesturestart") {
        if (timer) commit();
        begin({ x: input.clientX, y: input.clientY });
        safari = true;
      } else if (safari && event.type === "gesturechange") {
        focal = { x: input.clientX - bounds.left, y: input.clientY - bounds.top };
        target = pinchZoom(latest.current.zoom, 1, input.scale);
        preview();
      } else if (safari) {
        safari = false;
        commit();
      }
    }
    for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
      view.addEventListener(name, gesture, options);
    }
    view.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        if (active || safari) return;
        if (!timer) begin({ x: event.clientX, y: event.clientY });
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
        const next = wheelZoom(target, event.deltaY * unit);
        const ratio = next / target;
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        focal = { x: x + (focal.x - x) * ratio, y: y + (focal.y - y) * ratio };
        target = next;
        preview();
        clearTimeout(timer);
        timer = window.setTimeout(() => commit(), 120);
      },
      options,
    );
    return () => {
      abort.abort();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [viewport]);
  return { stackRef, doubleTap: (point: ScreenPoint) => tap.current(point) };
}
