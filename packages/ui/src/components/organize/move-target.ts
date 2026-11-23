/**
 * Converts a boundary in the original order into an insertion index after removing the moving pages.
 * @param order The original page order.
 * @param moving The page ids being moved together.
 * @param after The original page number to insert after, or zero for the start.
 * @returns An insertion index in the remaining pages.
 */
export function moveTarget(order: readonly string[], moving: ReadonlySet<string>, after: number): number {
  const boundary = Math.min(order.length, Math.max(0, Math.trunc(after) || 0));
  return order.slice(0, boundary).filter((id) => !moving.has(id)).length;
}
