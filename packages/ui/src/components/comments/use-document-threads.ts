import { commentText, type DocumentSession, type Annotation } from "@pdf-editor/core";
import { useMemo } from "react";
import { usePanelScan } from "../../editor/use-panel-scan";

/** One annotation's thread, and where it is. */
export interface ThreadEntry {
  readonly pageId: string;
  /** The page's position in the document, from 0. */
  readonly pageIndex: number;
  readonly annotation: Annotation;
}

/** Counts annotations that have a nonempty comment body.
 * @param threads The document annotations shown as comment threads.
 * @returns The number of threads with at least one comment.
 */
export function countCommentThreads(threads: readonly ThreadEntry[]): number {
  return threads.filter(({ annotation }) => {
    return Boolean(annotation.comment && commentText(annotation.comment.body).trim());
  }).length;
}

/**
 * @param session The current document session.
 * @param pageId The page to inspect.
 * @param pageIndex Its position in the document.
 * @returns All threads on the page.
 */
async function readThreads(session: DocumentSession, pageId: string, pageIndex: number) {
  const annotations = await session.readAnnotations(pageId);
  return annotations.map((annotation) => ({ pageId, pageIndex, annotation }));
}

/**
 * @param enabled Whether the comments panel is open.
 * @returns The complete threads, count and scan status.
 */
export function useDocumentThreads(enabled: boolean) {
  const { values, message } = usePanelScan(enabled, readThreads);
  const threads = useMemo(() => values?.flat() ?? [], [values]);
  return { threads, count: countCommentThreads(threads), message };
}
