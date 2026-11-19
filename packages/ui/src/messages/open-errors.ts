import type { OpenErrorKind } from "@pdf-editor/shared";

/** User-facing text for each open failure: what happened and what to try next. Translations go next to this file. */
export const OPEN_ERROR_MESSAGES: Record<Exclude<OpenErrorKind, "password-required" | "wrong-password">, { title: string; body: string }> = {
  empty: { title: "This file is empty", body: "It has no content. If it came from an email or a download, get it again." },
  "too-large": { title: "This file is too large", body: "TrangPDF opens files up to 500 MB. Try a smaller copy of the document." },
  "not-pdf": { title: "This isn’t a PDF", body: "The file has a .pdf name but contains something else, often a photo or a scan. Export it as a PDF and try again." },
  damaged: { title: "This PDF is damaged", body: "Part of the file is missing or broken. If it came from a scanner or an email, export or download it again." },
  "engine-failed": { title: "The PDF engine stopped", body: "Something went wrong while reading the file. Try opening it again." },
  unreadable: { title: "The file couldn’t be read", body: "It may have been moved, renamed or deleted, or access was denied. Choose it again from its folder." },
};
