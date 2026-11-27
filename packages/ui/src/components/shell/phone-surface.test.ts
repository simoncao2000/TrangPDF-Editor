import { describe, expect, it } from "bun:test";
import {
  isPhoneTrayVisible,
  phoneBottomPadding,
  phoneChromeHeight,
  PHONE_SURFACE_INITIAL,
  phoneSurfaceReducer,
} from "./phone-surface";

describe("phone tool surfaces", () => {
  it("hides the tray while a menu is open and restores it on close", () => {
    const open = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "open-menu", id: "markup" });
    expect(isPhoneTrayVisible(open, true, "draw")).toBe(false);
    const closed = phoneSurfaceReducer(open, { type: "close-menu" });
    expect(isPhoneTrayVisible(closed, true, "draw")).toBe(true);
  });

  it("shows the picked tool card after a menu closes", () => {
    const open = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "open-menu", id: "markup" });
    const picked = phoneSurfaceReducer(open, { type: "pick-tool" });
    expect(picked.menuId).toBeNull();
    expect(isPhoneTrayVisible(picked, true, "highlight")).toBe(true);
  });

  it("toggles an active tool card without changing the tool", () => {
    const hidden = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "tap-active-tool" });
    expect(isPhoneTrayVisible(hidden, true, "draw")).toBe(false);
    const shown = phoneSurfaceReducer(hidden, { type: "tap-active-tool" });
    expect(isPhoneTrayVisible(shown, true, "draw")).toBe(true);
  });

  it("ends closed after two quick taps on a group key", () => {
    const opened = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "open-menu", id: "markup" });
    const closed = phoneSurfaceReducer(opened, { type: "close-menu" });
    expect(closed.menuId).toBeNull();
  });

  it("collapses on a page gesture and expands on request", () => {
    const collapsed = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "page-gesture" });
    expect(collapsed.trayCollapsed).toBe(true);
    const expanded = phoneSurfaceReducer(collapsed, { type: "expand" });
    expect(expanded.trayCollapsed).toBe(false);
  });

  it("collapses options without changing the active tool card", () => {
    const collapsed = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "collapse" });
    expect(collapsed.trayCollapsed).toBe(true);
    expect(collapsed.menuId).toBeNull();
    expect(isPhoneTrayVisible(collapsed, true, "draw")).toBe(true);
  });
});

it("reserves the card, chip or bar alone with their gaps", () => {
  expect(phoneChromeHeight(600, 532, 380)).toBe(220);
  expect(phoneChromeHeight(600, 532, 488)).toBe(112);
  expect(phoneChromeHeight(600, 532)).toBe(68);
  expect(phoneBottomPadding(8, "112px")).toBe("calc(8px + 112px)");
});

it("fades within the gesture band and restores on exit or release", () => {
  const start = phoneSurfaceReducer(PHONE_SURFACE_INITIAL, { type: "page-gesture", inBand: true });
  expect(start.seeThrough).toBe(true);
  const outside = phoneSurfaceReducer(start, { type: "gesture-band", inBand: false });
  expect(outside.seeThrough).toBe(false);
  const inside = phoneSurfaceReducer(outside, { type: "gesture-band", inBand: true });
  expect(inside.seeThrough).toBe(true);
  expect(phoneSurfaceReducer(inside, { type: "gesture-end" }).seeThrough).toBe(false);
});
