import type { Annotation, PageTextObject } from "@pdf-editor/core";
import { useEffect, useState } from "react";
import { useEditorServices } from "../../editor/hooks";

/**
 * Something read about a page, read again whenever the page's revision changes. While a new
 * revision loads, the previous result stays, so nothing blinks after an edit.
 * @param read Reads it (a session method).
 * @param pageId The page.
 * @param revision The page's revision.
 * @returns The latest result (empty until the first read finishes).
 */
function usePageRead<T>(
  read: (pageId: string) => Promise<readonly T[]>,
  pageId: string,
  revision: number,
): readonly T[] {
  const [items, setItems] = useState<readonly T[]>([]);
  useEffect(() => {
    let active = true;
    read(pageId).then(
      (list) => active && setItems(list),
      () => active && setItems([]),
    );
    return () => {
      active = false;
    };
  }, [read, pageId, revision]);
  return items;
}

/**
 * A page's annotations.
 * @param pageId The page.
 * @param revision The page's annotation revision.
 * @returns The annotations in drawing order.
 */
export function usePageAnnotations(pageId: string, revision: number): readonly Annotation[] {
  const { session } = useEditorServices();
  return usePageRead(session.readAnnotations, pageId, revision);
}

/**
 * The page's own text that can be edited.
 * @param pageId The page.
 * @param revision The page's revision.
 * @param enabled Read only while it is needed (the Edit text tool is in hand).
 * @returns The text objects in drawing order (empty while disabled).
 */
export function usePageTextObjects(pageId: string, revision: number, enabled: boolean): readonly PageTextObject[] {
  const { session } = useEditorServices();
  const items = usePageRead(enabled ? session.readTextObjects : noRead, pageId, revision);
  return enabled ? items : [];
}

/** Reads nothing; stands in while a read is disabled. */
const noRead = (): Promise<readonly never[]> => Promise.resolve([]);
