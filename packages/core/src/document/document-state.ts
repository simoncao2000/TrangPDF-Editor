/**
 * The document model (architecture §6.1): an ordered list of page references into source files.
 * Reordering, rotating, deleting and merging only change this list; bytes are built when saving.
 */
import type { OpenErrorKind, PageSize } from "@pdf-editor/shared";
import type { DocId, PageAddress, PageGeometry, Rotation } from "../engine/protocol";
import { pageSizeOf } from "../geometry/coordinates";

export type SourceId = string;

/** Status drives the UI (architecture §6.3). */
export type DocumentStatus = "empty" | "loading" | "needsPassword" | "clean" | "dirty" | "saving" | "failed";

export interface SourceDoc {
  readonly id: SourceId;
  readonly name: string;
  readonly pageCount: number;
  /** Each page's crop box and own rotation. */
  readonly pages: readonly PageGeometry[];
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
  /**
   * A token per page that changes whenever the page's annotations or form values change (PDFium
   * holds those, architecture §6.1). Caches of a page's picture and annotations are keyed by it.
   * Pages without an entry are at revision 0.
   */
  readonly annotationRevisions: Readonly<Record<string, number>>;
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
  /** The newest edit the engine could not carry out; `serial` changes with every failure. */
  readonly failedEdit: { readonly label: string; readonly serial: number } | null;
}

export const EMPTY_DOCUMENT: DocumentState = {
  status: "empty",
  fileName: null,
  fileId: null,
  sources: {},
  pages: [],
  annotationRevisions: {},
  selection: [],
  error: null,
  undoLabel: null,
  redoLabel: null,
  failedEdit: null,
};

/** Stand-in geometry for a page whose source is unknown. */
const LETTER: PageGeometry = { cropBox: { x: 0, y: 0, width: 612, height: 792 }, rotation: 0 };

/**
 * Size of a page as shown, after the page reference's extra rotation.
 * @param content Sources and pages.
 * @param page A page in `content.pages`.
 * @returns Width and height in points.
 */
export function displayedPageSize(content: Pick<DocumentContent, "sources">, page: PageRef): PageSize {
  const geometry = content.sources[page.source]?.pages[page.sourceIndex] ?? LETTER;
  return pageSizeOf(geometry, page.rotation);
}

/**
 * A page's annotation revision.
 * @param content Sources, pages and revisions.
 * @param pageId A page id.
 * @returns The revision token; 0 until the page's annotations are first edited.
 */
export function annotationRevisionOf(content: Pick<DocumentContent, "annotationRevisions">, pageId: string): number {
  return content.annotationRevisions[pageId] ?? 0;
}

/**
 * Where a page lives in the engine.
 * @param content Sources and pages.
 * @param pageId A page id.
 * @returns Its engine document and page index, or `null` if the page or its source is unknown.
 */
export function pageAddressOf(content: DocumentContent, pageId: string): PageAddress | null {
  const page = content.pages.find((candidate) => candidate.id === pageId);
  const docId = page ? docIdOf(content, page) : null;
  return page && docId ? { docId, pageIndex: page.sourceIndex } : null;
}

/**
 * The engine document a page comes from.
 * @param content Sources and pages.
 * @param page A page in `content.pages`.
 * @returns Its docId, or `null` if the source is unknown.
 */
export function docIdOf(content: Pick<DocumentContent, "sources">, page: PageRef): DocId | null {
  return content.sources[page.source]?.docId ?? null;
}
