import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 * @param query e.g. "(min-width: 1024px)".
 * @returns Whether it currently matches.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Layout switches by width, not platform (architecture §9). */
export const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";
