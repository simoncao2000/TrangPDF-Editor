import type { FontChoice } from "./font-model";

interface LocalFontData {
  readonly family: string;
  readonly postscriptName: string;
  readonly style: string;
  /** @returns The font bytes when explicitly requested. */
  blob(): Promise<Blob>;
}

type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontData[]> };
let catalog: Promise<FontChoice[]> | undefined;

/** @returns Whether this browser exposes Local Font Access. */
export function supportsDeviceFonts(): boolean {
  return (
    typeof (window as LocalFontWindow).queryLocalFonts === "function" &&
    !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** @returns The previously requested catalog, including a pending request. */
export function requestedDeviceFonts(): Promise<FontChoice[]> | undefined {
  return catalog;
}

/**
 * Requests the device catalog from the permission button and keeps one face per family.
 * @returns The families sorted by display name.
 */
export function requestDeviceFonts(): Promise<FontChoice[]> {
  const localWindow = window as LocalFontWindow;
  catalog ??= (async () => {
    const fonts = await localWindow.queryLocalFonts!();
    const ordered = [...fonts].sort(
      (a, b) =>
        Number(!/^(regular|normal|roman|book)$/i.test(a.style)) -
          Number(!/^(regular|normal|roman|book)$/i.test(b.style)) ||
        a.style.localeCompare(b.style) ||
        a.postscriptName.localeCompare(b.postscriptName),
    );
    const families = new Map<string, FontChoice>();
    for (const font of ordered) {
      if (families.has(font.family)) continue;
      families.set(font.family, {
        id: `device-${crypto.randomUUID()}`,
        name: font.family,
        bundledId: "inter",
        preview: `${JSON.stringify(font.family)}, sans-serif`,
        local: { kind: "device", read: async () => (await font.blob()).arrayBuffer() },
      });
    }
    return [...families.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  // The picker may unmount before it can attach its status handler.
  void catalog.catch(() => undefined);
  return catalog;
}
