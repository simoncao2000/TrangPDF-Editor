/**
 * Splits "Report.pdf" into "Report" and ".pdf".
 * @param name A file name.
 * @returns The name without its .pdf extension.
 */
export function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/**
 * Describes page numbers compactly: "page 3", "pages 2–4", "pages 1, 3 and 6".
 * @param numbers One-based page numbers, ascending.
 * @returns A short phrase.
 */
export function describePages(numbers: readonly number[]): string {
  if (numbers.length === 1) return `page ${numbers[0]}`;
  const consecutive = numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1);
  if (consecutive) return `pages ${numbers[0]}–${numbers.at(-1)}`;
  return `pages ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}
