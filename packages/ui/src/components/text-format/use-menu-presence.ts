import { useState, useEffect } from "react";
import type { FormatPanel } from "./FormatBar";

/** @param panel The active panel. @param wide Whether the desktop popup is in use. @returns Its mounted panel. */
export function useMenuPresence(panel: FormatPanel | null, wide: boolean) {
  const [last, setLast] = useState(panel);
  if (panel && panel !== last) setLast(panel);
  useEffect(() => {
    if (panel) return;
    const timer = window.setTimeout(() => setLast(null), 150);
    return () => window.clearTimeout(timer);
  }, [panel, wide]);
  return panel ?? (wide ? last : null);
}
