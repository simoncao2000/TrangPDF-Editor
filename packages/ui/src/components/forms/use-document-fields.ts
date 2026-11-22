import { summarizeFields, type DocumentSession, type FieldSummary, type FormField } from "@pdf-editor/core";
import { useEffect, useRef, useState } from "react";
import { useDocument, useEditorServices } from "../../editor/hooks";

export interface DocumentField extends FieldSummary {
  readonly pageId: string;
}

interface PageFields {
  readonly pageId: string;
  readonly revision: number;
  readonly widgets: readonly FormField[];
}

interface FieldRead {
  readonly session: DocumentSession;
  readonly pages: ReadonlyMap<string, PageFields>;
  readonly fields: readonly DocumentField[];
}

/**
 * Reads the document's widgets in page order and refreshes them on page revisions.
 * @returns One entry per field, with the location of its first widget.
 */
export function useDocumentFields(): readonly DocumentField[] {
  const { session } = useEditorServices();
  const pages = useDocument((state) => state.pages);
  const revisions = useDocument((state) => state.annotationRevisions);
  const [read, setRead] = useState<FieldRead>();
  const lastRead = useRef<FieldRead>(undefined);

  useEffect(() => {
    let active = true;
    const previous = lastRead.current?.session === session ? lastRead.current.pages : undefined;
    const reads = pages.map(({ id }) => {
      const revision = revisions[id] ?? 0;
      const cached = previous?.get(id);
      if (cached?.revision === revision) return cached;
      return session.readFormFields(id).then(
        (widgets) => ({ pageId: id, revision, widgets }),
        () => undefined,
      );
    });
    void Promise.all(reads).then((perPage) => {
      if (!active) return;
      const resolved = perPage.filter((page) => page !== undefined);
      const next = {
        session,
        pages: new Map(resolved.map((page) => [page.pageId, page])),
        fields: summarizeDocumentFields(resolved),
      };
      lastRead.current = next;
      setRead(next);
    });
    return () => {
      active = false;
    };
  }, [session, pages, revisions]);

  return read?.session === session ? read.fields : [];
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
