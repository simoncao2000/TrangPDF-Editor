import { useEffect } from "react";
import { isTyping } from "../../hooks/use-shortcut";
import { useAnnotationUi } from "../../state/annotation-store";
import { useTextSelection } from "../../state/text-selection-store";

/**
 * Copying selected page text with Ctrl/Cmd+C (and Edit › Copy): the browser's copy event takes the
 * page selection when nothing else is selected and no field is being typed in. Escape or another
 * tool clears the selection.
 */
export function useCopySelection(): void {
  const tool = useAnnotationUi((state) => state.tool);
  const clear = useTextSelection((state) => state.select);
  useEffect(() => clear(null), [tool, clear]);

  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      const { selection } = useTextSelection.getState();
      if (!selection || isTyping(document.activeElement) || !(window.getSelection()?.isCollapsed ?? true)) return;
      event.clipboardData?.setData("text/plain", selection.text);
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isTyping(event.target)) clear(null);
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [clear]);
}
