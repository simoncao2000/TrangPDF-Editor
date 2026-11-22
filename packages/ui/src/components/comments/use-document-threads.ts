import type { Annotation } from "@pdf-editor/core";
import { useEffect, useState } from "react";
import { useDocument, useEditorServices } from "../../editor/hooks";

/** One annotation's thread, and where it is. */
export interface ThreadEntry {
  readonly pageId: string;
  /** The page's position in the document, from 0. */
  readonly pageIndex: number;
  readonly annotation: Annotation;
}

/**
 * Every annotation in the document, as comment threads in page order. Read again when a page's
 * annotations change; pages already read come from the session's cache.
 * @returns The threads (empty until the first read finishes).
 */
export function useDocumentThreads(): readonly ThreadEntry[] {
  const { session } = useEditorServices();
  const pages = useDocument((state) => state.pages);
  const revisions = useDocument((state) => state.annotationRevisions);
  const [threads, setThreads] = useState<readonly ThreadEntry[]>([]);

  useEffect(() => {
    let active = true;
    const reads = pages.map((page, pageIndex) =>
      session.readAnnotations(page.id).then(
        (annotations) => annotations.map((annotation) => ({ pageId: page.id, pageIndex, annotation })),
        () => [],
      ),
    );
    void Promise.all(reads).then((perPage) => active && setThreads(perPage.flat()));
    return () => {
      active = false;
    };
  }, [session, pages, revisions]);

  return threads;
}
