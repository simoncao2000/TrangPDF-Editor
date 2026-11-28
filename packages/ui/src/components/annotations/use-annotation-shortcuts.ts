import { deleteAnnotations } from "@pdf-editor/core";
import { useCallback } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useShortcuts } from "../../hooks/use-shortcut";
import { useAnnotationUi } from "../../state/annotation-store";
import { useToast } from "../../state/toast-store";
import { ANNOTATION_NAMES } from "./annotation-display";

/**
 * Keys for the selected annotation: Delete or Backspace removes it (with an Undo toast), Escape
 * lets go of it.
 * @param enabled Turn off while a dialog is open.
 */
export function useAnnotationShortcuts(enabled: boolean): void {
  const { session } = useEditorServices();
  const selected = useAnnotationUi((state) => state.selected);
  const select = useAnnotationUi((state) => state.select);
  const show = useToast((state) => state.show);

  const remove = useCallback(async () => {
    if (!selected) return;
    const target = (await session.readAnnotations(selected.pageId)).find((annotation) => annotation.id === selected.id);
    select(null);
    if (!target) return;
    session.dispatch((content) => deleteAnnotations(content, selected.pageId, [target]));
    show(`${ANNOTATION_NAMES[target.kind]} deleted`, { action: { label: "Undo", run: () => session.undo() } });
  }, [session, selected, select, show]);

  useShortcuts(
    [
      [{ key: "delete" }, () => void remove()],
      [{ key: "backspace" }, () => void remove()],
      [{ key: "escape" }, () => select(null)],
    ],
    enabled && selected !== null,
  );
}
