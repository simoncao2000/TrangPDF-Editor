/**
 * Each tab remembers how it was being viewed (reading or organizing, zoom, page), like editors in
 * VS Code keep their scroll position. The view store holds the tab in front; this swaps it on switch.
 */
import { useEffect, useRef } from "react";
import { useAnnotationUi } from "../state/annotation-store";
import { useToast } from "../state/toast-store";
import { useViewer, type ViewSnapshot } from "../state/viewer-store";

/**
 * Saves the view of the tab being left and restores the view of the tab coming to the front (or
 * the default view for a tab seen for the first time).
 * @param activeId The tab in front, or `null`.
 */
export function useTabViewMemory(activeId: string | null): void {
  const saved = useRef(new Map<string, ViewSnapshot>());
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const viewer = useViewer.getState();
    if (previous.current) saved.current.set(previous.current, viewer.snapshot());
    previous.current = activeId;
    const restored = activeId ? saved.current.get(activeId) : undefined;
    if (restored) viewer.restore(restored);
    else viewer.reset();
    // A selected annotation, and a toast's Undo, belong to the tab they were made in.
    useAnnotationUi.getState().select(null);
    useToast.getState().dismiss();
  }, [activeId]);
}
