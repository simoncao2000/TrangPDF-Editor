/** State that keeps phone tool menus and cards mutually exclusive. */
export interface PhoneSurfaceState {
  readonly seeThrough: boolean;
  readonly menuId: string | null;
  readonly trayHidden: boolean;
  readonly trayCollapsed: boolean;
}

/** Events that change the visible phone tool surface. */
export type PhoneSurfaceEvent =
  | { readonly type: "open-menu"; readonly id: string }
  | { readonly type: "close-menu" }
  | { readonly type: "pick-tool" }
  | { readonly type: "tap-active-tool" }
  | { readonly type: "page-gesture"; readonly inBand?: boolean; readonly collapse?: boolean }
  | { readonly type: "gesture-band"; readonly inBand: boolean }
  | { readonly type: "gesture-end" }
  | { readonly type: "collapse" }
  | { readonly type: "expand" }
  | { readonly type: "tool-changed" };

/** Initial phone surface state. */
export const PHONE_SURFACE_INITIAL: PhoneSurfaceState = {
  seeThrough: false,
  menuId: null,
  trayHidden: false,
  trayCollapsed: false,
};

/**
 * Applies one toolbar or page gesture to the phone surface state.
 * @param state The current menu and tray state.
 * @param event The requested surface transition.
 * @returns The next state.
 */
export function phoneSurfaceReducer(state: PhoneSurfaceState, event: PhoneSurfaceEvent): PhoneSurfaceState {
  switch (event.type) {
    case "open-menu":
      return { ...state, menuId: event.id, trayHidden: false };
    case "close-menu":
      return { ...state, menuId: null, trayHidden: false };
    case "pick-tool":
      return { ...state, menuId: null, trayHidden: false, trayCollapsed: false };
    case "tap-active-tool":
      return { ...state, trayHidden: !state.trayHidden };
    case "page-gesture":
      return { ...state, trayCollapsed: state.trayCollapsed || event.collapse !== false, seeThrough: !!event.inBand };
    case "gesture-band":
      return state.seeThrough === event.inBand ? state : { ...state, seeThrough: event.inBand };
    case "gesture-end":
      return { ...state, seeThrough: false };
    case "collapse":
      return { ...state, trayCollapsed: true };
    case "expand":
      return { ...state, trayCollapsed: false };
    case "tool-changed":
      return { ...state, trayHidden: false, trayCollapsed: false };
  }
}

/**
 * Reports whether the options tray can be shown for the current tool.
 * @param state The current phone surface state.
 * @param showTray Whether the toolbar is configured to show cards.
 * @param card The current tool or selected-content card identity.
 * @returns Whether the tray should be visible.
 */
export function isPhoneTrayVisible(state: PhoneSurfaceState, showTray: boolean, card: string): boolean {
  return showTray && !state.menuId && !state.trayHidden && card !== "select";
}

/**
 * Measures the overlap inside the viewport, which already ends above the tabs.
 * @param bottom Bottom edge of the viewport.
 * @param barTop Top edge of the bar.
 * @param trayTop Top edge of the card or chip when mounted.
 * @returns Reserved pixels, including the gaps between surfaces.
 */
export function phoneChromeHeight(bottom: number, barTop: number, trayTop?: number): number {
  return Math.max(0, bottom - Math.min(barTop, trayTop ?? barTop));
}

/**
 * @param base Page layout padding in pixels.
 * @param chrome Measured overlay inset in CSS units.
 * @returns Combined bottom padding.
 */
export function phoneBottomPadding(base: number, chrome = "var(--phone-chrome-bottom, 0px)"): string {
  return `calc(${base}px + ${chrome})`;
}
