/**
 * Reads pages in order, bounding outstanding requests when a scan is interrupted.
 * @param pages The pages in document order.
 * @param read Reads one page.
 * @param signal Aborted when the consumer closes or changes documents.
 * @returns Every result in order, or undefined when interrupted.
 */
export async function scanPages<P, R>(
  pages: readonly P[],
  read: (page: P, index: number) => Promise<R>,
  signal: AbortSignal,
): Promise<R[] | undefined> {
  const result: R[] = [];
  const batchSize = 8;
  for (let offset = 0; offset < pages.length; offset += batchSize) {
    if (signal.aborted) return;
    const batch = pages.slice(offset, offset + batchSize);
    result.push(...(await Promise.all(batch.map((page, i) => read(page, offset + i)))));
    if (offset + batchSize < pages.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return signal.aborted ? undefined : result;
}
