import type { DocumentSession } from "@pdf-editor/core";
import { useEffect, useMemo, useState } from "react";
import { useDocument, useEditorServices } from "./hooks";
import { scanPages } from "./scan-pages";

/**
 * Publishes complete panel scans for the current document and revision.
 * @param enabled Whether the panel needs its data.
 * @param read Reads a page for this panel.
 * @returns The complete results and a message while loading or on failure.
 */
export function usePanelScan<T>(
  enabled: boolean,
  read: (session: DocumentSession, id: string, index: number) => Promise<T>,
) {
  const { session } = useEditorServices();
  const pages = useDocument((state) => state.pages);
  const revisions = useDocument((state) => state.annotationRevisions);
  const key = useMemo(() => ({ session, pages, revisions, read }), [session, pages, revisions, read]);
  const [result, setResult] = useState<{ key: typeof key; values?: T[] }>();
  if (!enabled && result && (result.key !== key || !result.values)) setResult(undefined);
  useEffect(() => {
    if (!enabled || result?.key === key) return;
    const controller = new AbortController();
    const previous = result?.key.session === session && result.key.read === read ? result : undefined;
    const scan = scanPages(
      key.pages,
      async (page, i) => {
        if (
          previous?.values &&
          previous.key.pages[i]?.id === page.id &&
          previous.key.revisions[page.id] === key.revisions[page.id]
        ) {
          return previous.values[i]!;
        }
        return key.read(key.session, page.id, i);
      },
      controller.signal,
    );
    void scan.then(
      (values) => {
        if (values && !controller.signal.aborted) setResult({ key, values });
      },
      () => {
        if (!controller.signal.aborted) setResult({ key });
      },
    );
    return () => controller.abort();
  }, [enabled, key, result, session, read]);
  const current = result?.key === key ? result : undefined;
  const message = current?.values ? undefined : current ? "Could not load pages." : "Loading…";
  return { values: current?.values, message };
}
