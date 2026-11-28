/** What the command palette's text means, and how well a name matches it. Pure, so easy to test. */

export type PaletteQuery =
  /** Plain text: search the document's text and the open files' names. */
  | { readonly mode: "search"; readonly text: string }
  /** ">" first: run a command. */
  | { readonly mode: "commands"; readonly text: string }
  /** ":" and a number: go to that page (1-based). */
  | { readonly mode: "page"; readonly page: number | null };

/**
 * Reads the palette's text.
 * @param raw What is typed.
 * @returns The mode and the rest of the text.
 */
export function parseQuery(raw: string): PaletteQuery {
  if (raw.startsWith(">")) return { mode: "commands", text: raw.slice(1).trim() };
  if (raw.startsWith(":")) {
    const page = Number.parseInt(raw.slice(1).trim(), 10);
    return { mode: "page", page: Number.isFinite(page) && page > 0 ? page : null };
  }
  return { mode: "search", text: raw.trim() };
}

/**
 * How well a name matches typed text: every typed character must appear in the name, in order.
 * Matches at the start of words and runs of matching characters score higher.
 * @param name The name to test, e.g. "Rotate page clockwise".
 * @param typed What is typed, e.g. "rot cl".
 * @returns A score above 0 for a match (higher is better), or 0 for none. Empty text matches all with 1.
 */
export function matchScore(name: string, typed: string): number {
  const needle = typed.toLowerCase().replace(/\s+/g, "");
  if (!needle) return 1;
  const haystack = name.toLowerCase();
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    const at = haystack.indexOf(char, from);
    if (at === -1) return 0;
    const startsWord = at === 0 || haystack[at - 1] === " ";
    score += 1 + (startsWord ? 3 : 0) + (at === previous + 1 ? 2 : 0);
    previous = at;
    from = at + 1;
  }
  return score;
}

/** The words around a search match. */
export interface Snippet {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** Bullets and separators that read as noise at the start of a snippet. */
const LEADING_NOISE = /^[\s·•\-–—|,.;:]+/;

/**
 * Trims a search snippet to whole words: the cut-off word at either end is dropped, separators at
 * the start are removed, and an ellipsis marks where text continues.
 * @param snippet The raw context around a match.
 * @returns A snippet that reads cleanly.
 */
export function tidySnippet(snippet: Snippet): Snippet {
  const space = snippet.before.search(/\s/);
  // The first word is cut off unless the snippet starts at a word boundary; drop it.
  const head = space === -1 ? "" : snippet.before.slice(space).replace(LEADING_NOISE, "");
  const lastSpace = snippet.after.search(/\s\S*$/);
  const tail = lastSpace === -1 ? snippet.after : snippet.after.slice(0, lastSpace);
  return {
    before: head ? `…${head}` : "",
    match: snippet.match,
    after: tail ? `${tail.replace(/\s+$/, "")}…` : "",
  };
}
