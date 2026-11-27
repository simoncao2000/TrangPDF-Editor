import { expect, mock, test } from "bun:test";
import { pdfToScreen, screenToPdf, type PageFrame } from "@pdf-editor/core";
import { pagePointer, trackSignature } from "./signature-hover";

/** @returns A page hit area with a viewport offset and an observable cursor. */
function makeSurface() {
  const style = {
    cursor: "",
    removeProperty: () => {
      style.cursor = "";
    },
  };
  return Object.assign(new EventTarget(), {
    style,
    getBoundingClientRect: () => ({ left: 20, top: 50 }),
  }) as unknown as SVGRectElement;
}

/** @param pointerType Input device. @param x Viewport x position. @returns A hover event. */
function move(pointerType: string, x = 120) {
  return Object.assign(new Event("pointermove"), { pointerType, buttons: 0, clientX: x, clientY: 194 });
}

test("the latest hover in a frame matches click placement, and touch, press and leave hide it", () => {
  const surface = makeSurface();
  const preview = { style: { visibility: "hidden" }, setAttribute: mock() };
  const cleanup = trackSignature(surface, preview as unknown as SVGGElement, { current: null });
  let paint: FrameRequestCallback;
  const request = mock((callback: FrameRequestCallback) => {
    paint = callback;
    return 1;
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: request });
  try {
    const pointer = move("mouse");
    surface.dispatchEvent(move("mouse", 80));
    surface.dispatchEvent(pointer);
    expect(request).toHaveBeenCalledTimes(1);
    paint!(0);
    const frame: PageFrame = { cropBox: { x: 5, y: 10, width: 200, height: 300 }, zoom: 1.5, rotation: 90 };
    const placed = pdfToScreen(screenToPdf(pagePointer(pointer, surface), frame), frame);
    expect(placed).toEqual({ x: 100, y: 144 });
    expect(preview.setAttribute).toHaveBeenCalledWith("transform", `translate(${placed.x} ${placed.y})`);
    for (const event of [move("touch"), new Event("pointerdown"), new Event("pointerleave")]) {
      surface.dispatchEvent(pointer);
      paint!(0);
      expect(surface.style.cursor).toBe("none");
      expect(preview.style.visibility).toBe("visible");
      surface.dispatchEvent(event);
      expect(surface.style.cursor).toBe("");
      expect(preview.style.visibility).toBe("hidden");
    }
  } finally {
    cleanup();
    if (original) Object.defineProperty(globalThis, "requestAnimationFrame", original);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  }
});

test("hover without a chosen signature preserves the page cursor", () => {
  const surface = makeSurface();
  const cleanup = trackSignature(surface, null, { current: null });
  surface.dispatchEvent(move("mouse"));
  expect(surface.style.cursor).toBe("");
  cleanup();
});
