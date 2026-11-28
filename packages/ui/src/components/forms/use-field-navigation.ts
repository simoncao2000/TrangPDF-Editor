import { useEffect, useState } from "react";
import { useEditorServices } from "../../editor/hooks";
import { useAnnotationUi } from "../../state/annotation-store";
import { useViewer } from "../../state/viewer-store";
import type { DocumentField } from "./use-document-fields";

interface FieldVisit {
  readonly field: DocumentField;
}

/**
 * Navigates from the Inspector to a field, including pages mounted only after scrolling.
 * @returns The current field name and a callback to visit a field.
 */
export function useFieldNavigation() {
  const { session } = useEditorServices();
  const [visit, setVisit] = useState<FieldVisit>();

  useEffect(() => {
    if (!visit) return;
    const { field } = visit;
    const pageIndex = session.store.getState().pages.findIndex((page) => page.id === field.pageId);
    const viewport = document.querySelector('[aria-label="Document pages"]');
    if (pageIndex < 0 || !viewport) return;

    const pageSelector = `[data-page][aria-label="Page ${pageIndex + 1}"]`;
    const goToPage = useViewer.getState().goToPage;
    if (field.kind === "signature" || (field.first.readOnly && field.kind !== "text")) {
      goToPage(pageIndex);
      return;
    }

    useAnnotationUi.getState().setTool("select");
    // The form layer exposes widget names through its native controls' accessible labels.
    const label = CSS.escape(field.name);
    const controlSelector = `:is(input, textarea, select)[aria-label="${label}"]:not(:disabled)`;
    const focus = () => {
      const control = viewport.querySelector<HTMLElement>(`${pageSelector} ${controlSelector}`);
      if (!control || control.closest("[inert]")) return false;
      control.scrollIntoView({ block: "center", inline: "nearest" });
      control.focus({ preventScroll: true });
      return document.activeElement === control;
    };

    if (focus()) return;
    const abort = new AbortController();
    const observer = new MutationObserver(() => {
      if (focus()) cancel();
    });
    const cancel = () => {
      observer.disconnect();
      abort.abort();
    };
    observer.observe(viewport, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert"] });
    if (!viewport.querySelector(pageSelector)) goToPage(pageIndex);

    // A later interaction takes precedence over the pending jump.
    document.addEventListener("focusin", cancel, { signal: abort.signal, once: true });
    document.addEventListener("pointerdown", cancel, { signal: abort.signal, once: true });
    return cancel;
  }, [visit, session]);

  return { current: visit?.field.name, open: (field: DocumentField) => setVisit({ field }) };
}
