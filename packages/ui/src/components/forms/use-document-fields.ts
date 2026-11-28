import { summarizeFields, type DocumentSession, type FieldSummary, type FormField } from "@pdf-editor/core";
import { useMemo } from "react";
import { usePanelScan } from "../../editor/use-panel-scan";

export interface DocumentField extends FieldSummary {
  readonly pageId: string;
}

interface PageFields {
  readonly pageId: string;
  readonly widgets: readonly FormField[];
}

/**
 * @param session The current document session.
 * @param id The page to inspect.
 * @returns All widgets on the page.
 */
async function readFields(session: DocumentSession, id: string) {
  return { pageId: id, widgets: await session.readFormFields(id) };
}

/**
 * @param enabled Whether a fields panel is open.
 * @returns All fields, or a status message until they are available.
 */
export function useDocumentFields(enabled = true) {
  const { values, message } = usePanelScan(enabled, readFields);
  const fields = useMemo(() => summarizeDocumentFields(values ?? []), [values]);
  return { fields, message };
}

/**
 * @param pages Page reads in document order.
 * @returns The summaries paired with their first widget's page.
 */
function summarizeDocumentFields(pages: readonly PageFields[]): readonly DocumentField[] {
  const pageByWidget = new Map<FormField, string>();
  for (const { pageId, widgets } of pages) {
    for (const widget of widgets) {
      if (!pageByWidget.has(widget)) pageByWidget.set(widget, pageId);
    }
  }
  return summarizeFields(pages.flatMap((page) => page.widgets)).map((field) => ({
    ...field,
    pageId: pageByWidget.get(field.first)!,
  }));
}
