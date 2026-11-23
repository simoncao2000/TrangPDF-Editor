import { useMemo } from "react";
import { usePageTextObjects } from "../annotations/use-page-annotations";
import { colorHex } from "./text-runs";

/**
 * Lists colours already used in the page's text.
 * @param pageId The page to read.
 * @param revision The page's revision.
 * @returns Unique colours in page order.
 */
export function useTextPageColors(pageId: string, revision: number): readonly string[] {
  const records = usePageTextObjects(pageId, revision, !!pageId);
  return useMemo(() => [...new Set(records.map((record) => colorHex(record.color)))], [records]);
}
