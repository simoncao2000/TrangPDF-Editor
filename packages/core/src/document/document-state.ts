/**
 * The document model (architecture §6.1): an ordered list of page references into source files.
 * Reordering, rotating, deleting and merging only change this list; bytes are built when saving.
 */
import type { OpenErrorKind, PageSize } from "@pdf-editor/shared";
import type { DocId, Rotation } from "../engine/protocol";

export type SourceId = string;

/** Status drives the UI (architecture §6.3). */
export type DocumentStatus = "empty" | "loading" | "needsPassword" | "clean" | "dirty" | "saving" | "failed";

export interface SourceDoc {
  readonly id: SourceId;
  readonly name: string;
  readonly pageCount: number;
  /** Page sizes in points, the page's own rotation applied. */
  readonly pageSizes: readonly PageSize[];
  /** The engine's id for this file. */
  readonly docId: DocId;
}

export interface PageRef {
  /** Stable id that survives reordering. */
  readonly id: string;
  readonly source: SourceId;
  /** Page index inside the source file. */
  readonly sourceIndex: number;
  /** Added to the page's own rotation. */
  readonly rotation: Rotation;
}

/** What commands change: the files in play and the page order the user sees. */
export interface DocumentContent {
  readonly sources: Readonly<Record<SourceId, SourceDoc>>;
  readonly pages: readonly PageRef[];
}

export interface DocumentState extends DocumentContent {
  readonly status: DocumentStatus;
  /** Name of the file being opened or open; `null` when empty. */
  readonly fileName: string | null;
  /** The platform's id for the open file, used to save in place. */
  readonly fileId: string | null;
  /** Selected page ids, in page order. */
  readonly selection: readonly string[];
  /** Why opening failed, or a wrong password. */
  readonly error: OpenErrorKind | null;
  /** Labels of the commands Undo and Redo would run; `null` when there is none. */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export const EMPTY_DOCUMENT: DocumentState = {
  status: "empty",
  fileName: null,
  fileId: null,
  sources: {},
  pages: [],
  selection: [],
  error: null,
  undoLabel: null,
  redoLabel: null,
};

/**
 * Size of a page as shown, after the page reference's extra rotation.
 * @param content Sources and pages.
 * @param page A page in `content.pages`.
 * @returns Width and height in points.
 */
export function displayedPageSize(content: DocumentContent, page: PageRef): PageSize {
  const size = content.sources[page.source]?.pageSizes[page.sourceIndex] ?? { width: 612, height: 792 };
  return page.rotation % 180 === 0 ? size : { width: size.height, height: size.width };
}

/**
 * The engine document a page comes from.
 * @param content Sources and pages.
 * @param page A page in `content.pages`.
 * @returns Its docId, or `null` if the source is unknown.
 */
export function docIdOf(content: DocumentContent, page: PageRef): DocId | null {
  return content.sources[page.source]?.docId ?? null;
}
