/**
 * Toggles the clicked page and returns the updated selection.
 * @param selected The currently selected page IDs.
 * @param clicked The ID of the page that was clicked.
 * @returns The updated selection.
 */
export function clickSelection(selected: readonly string[], clicked: string): readonly string[] {
  const next = new Set(selected);
  if (next.has(clicked)) next.delete(clicked);
  else next.add(clicked);
  return [...next];
}
