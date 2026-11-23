/**
 * Owns the document state, its undo history and the open/edit/save lifecycle (architecture §6.2–6.3,
 * §7.3). Talks to the engine worker; never imports React or a platform. The UI reads `store` and calls
 * the methods; every edit goes through `dispatch` so it can be undone.
 */
import {
  err,
  ok,
  type OpenErrorKind,
  type OpenedFile,
  type PdfPoint,
  type PdfRect,
  type Result,
  type SavedFile,
} from "@pdf-editor/shared";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Annotation } from "../annotations/annotation";
import type { FormField } from "../forms/form-field";
import type { PageFont, PageTextObject, TextMatch, TextSelection } from "../page-text/page-text";
import { EngineCallError } from "../engine/engine-client";
import type {
  AssembleOptions,
  AssemblePart,
  EngineErrorCode,
  DocId,
  EngineMethod,
  EngineParams,
  EngineResult,
  OpenSource,
  PageAddress,
} from "../engine/protocol";
import type { CancellableWork } from "../render/render-queue";
import { inspectPdfBytes } from "../validate";
import type { Command, CommandEngine } from "./commands";
import {
  annotationRevisionOf,
  EMPTY_DOCUMENT,
  docIdOf,
  pageAddressOf,
  type DocumentContent,
  type DocumentState,
  type PageRef,
  type SourceDoc,
} from "./document-state";
import { EMPTY_HISTORY, execute, isDirty, markSaved, redo, undo, type History } from "./history";

/** The engine calls the session needs; `EngineClient` provides them. */
export interface SessionEngine {
  call<M extends EngineMethod>(
    method: M,
    params: EngineParams<M>,
    transfer?: Transferable[],
  ): CancellableWork<EngineResult<M>>;
}

interface RegisteredFont {
  readonly documents: Set<DocId>;
  readonly work: Promise<null>;
}

const fontsByEngine = new WeakMap<SessionEngine, Map<string, RegisteredFont>>();

/**
 * Gets registration state shared by sessions using the same worker.
 * @param engine The worker connection.
 * @returns The cache of font registrations.
 */
function fontRegistrations(engine: SessionEngine): Map<string, RegisteredFont> {
  const existing = fontsByEngine.get(engine);
  if (existing) return existing;
  const registrations = new Map<string, RegisteredFont>();
  fontsByEngine.set(engine, registrations);
  return registrations;
}

/** Writes finished bytes somewhere (the UI passes a FileAdapter call). Resolves `null` if cancelled. */
export type SaveWriter = (bytes: ArrayBuffer) => Promise<SavedFile | null>;

export type SaveResult =
  | { readonly saved: true; readonly file: SavedFile }
  | { readonly saved: false; readonly reason: "cancelled" | "build-failed" | "write-failed" };

/** A command, or a function that builds one from the current content (for commands that remember it). */
export type CommandInput = Command | ((content: DocumentContent) => Command);

/** A search match placed in the document: which page (as shown), and where on it. */
export interface DocumentMatch extends Omit<TextMatch, "pageIndex"> {
  readonly pageId: string;
  /** 1-based position of the page in the document as it is now. */
  readonly pageNumber: number;
}

export interface DocumentSession {
  /** Subscribe with zustand's `useStore(session.store, selector)` in React. */
  readonly store: StoreApi<DocumentState>;
  /**
   * Opens a file, replacing any open document. Ask the user about unsaved changes first.
   * @param file The file from a FileAdapter. Its bytes are moved to the worker.
   * @returns Resolves when the file is open, waiting for a password, or failed.
   */
  load(file: OpenedFile): Promise<void>;
  /**
   * Retries an encrypted file with a password.
   * @param password What the user typed.
   * @returns Resolves when the file opened or the password was rejected.
   */
  submitPassword(password: string): Promise<void>;
  /** Closes the document and returns to `empty`. Ask the user about unsaved changes first. */
  close(): Promise<void>;
  /**
   * Runs an edit and records it for undo.
   * @param input The command, or a builder that receives the current content.
   */
  dispatch(input: CommandInput): void;
  /** Undoes the newest edit. */
  undo(): void;
  /** Re-applies the newest undone edit. */
  redo(): void;
  /**
   * Waits for the engine work of every edit made so far (annotation and form edits).
   * @returns Resolves when they have all finished, whether or not they succeeded.
   */
  settled(): Promise<void>;
  /**
   * A page's annotations as PDFium holds them, read once per annotation revision.
   * @param pageId A page id.
   * @returns The annotations in drawing order; empty for an unknown page.
   */
  readAnnotations(pageId: string): Promise<readonly Annotation[]>;
  /**
   * A page's form widgets, read once per page revision.
   * @param pageId A page id.
   * @returns The widgets in page order; empty for an unknown page.
   */
  readFormFields(pageId: string): Promise<readonly FormField[]>;
  /**
   * Reads the fonts used by text on one page.
   * @param pageId The page to inspect.
   * @returns Its distinct document font programs.
   */
  readPageFonts(pageId: string): Promise<readonly PageFont[]>;
  /**
   * Makes the font available for added text on a page's source document.
   * @param pageId The destination page.
   * @param fontId The stable font identifier.
   * @param bytes Original font bytes retained by the caller.
   * @returns The registration acknowledgement.
   */
  registerTextFont(pageId: string, fontId: string, bytes: ArrayBuffer): Promise<null>;
  /**
   * Every piece of the page's own text that can be edited, read once per page revision.
   * @param pageId A page id.
   * @returns The text objects in drawing order; empty for an unknown page.
   */
  readTextObjects(pageId: string): Promise<readonly PageTextObject[]>;
  /**
   * The text between two points on a page, for highlighting.
   * @param pageId A page id.
   * @param from Where the selection started, in PDF space.
   * @param to Where it ends, in PDF space.
   * @returns One rectangle per line; empty when a point misses the text or the page is unknown.
   */
  textRects(pageId: string, from: PdfPoint, to: PdfPoint): Promise<PdfRect[]>;
  /**
   * The text between two points on a page, as a reader selects it (to copy it or mark it).
   * @param pageId A page id.
   * @param from Where the selection started, in PDF space.
   * @param to Where it ends, in PDF space.
   * @returns Its line rectangles and characters; empty when a point misses the text or the page is unknown.
   */
  textSelection(pageId: string, from: PdfPoint, to: PdfPoint): Promise<TextSelection>;
  /**
   * The page's own text under a point, for editing it.
   * @param pageId A page id.
   * @param point A point in PDF space.
   * @returns The text object, or `null` when there is no text there or the page is unknown.
   */
  textObjectAt(pageId: string, point: PdfPoint): Promise<PageTextObject | null>;
  /**
   * Finds text in the document, page by page in the order shown, ignoring case.
   * @param query The text to find; blank finds nothing.
   * @param limit Stop after this many matches.
   * @returns The matches with their pages.
   */
  findText(query: string, limit: number): Promise<DocumentMatch[]>;
  /**
   * Draws one piece of page text on its own, for showing it while it is dragged.
   * @param pageId A page id.
   * @param id The text object's id.
   * @param scale Device pixels per point.
   * @returns A transparent bitmap cropped to the text (the caller closes it), or `null`.
   */
  renderTextObject(pageId: string, id: string, scale: number): Promise<ImageBitmap | null>;
  /**
   * Sets the selected pages.
   * @param pageIds Page ids; unknown ids are dropped and the rest are put in page order.
   */
  select(pageIds: readonly string[]): void;
  /**
   * Opens another file as a source for a merge, without changing the document yet. Dispatch
   * `insertPages(source, index)` to add its pages.
   * @param file The file to insert.
   * @returns The opened source, or why it could not be opened.
   */
  importSource(file: OpenedFile): Promise<Result<SourceDoc, OpenErrorKind>>;
  /**
   * Closes a source opened with `importSource` that was not inserted after all.
   * @param source The source to let go of; ignored if the document uses it.
   */
  releaseSource(source: SourceDoc): Promise<void>;
  /**
   * Builds a PDF from pages of the document, in document order (for Export).
   * @param pageIds Pages to include; all pages when omitted.
   * @param options `flatten`: draw annotations and form fields into the pages.
   * @returns The verified bytes.
   */
  buildPdf(pageIds?: readonly string[], options?: AssembleOptions): Promise<ArrayBuffer>;
  /**
   * Builds the document, verifies it and hands it to `write` (architecture figure 6). On success the
   * current state becomes the saved point and the file name follows the written file.
   * @param write Where to put the bytes (save in place, or save as).
   * @returns Whether it was saved, and why not.
   */
  save(write: SaveWriter): Promise<SaveResult>;
}

/** Page reads (annotations, text objects) × revisions kept; older ones are read again if needed. */
const PAGE_READ_CACHE_SIZE = 200;

/** An open call for the engine: the bytes (or held bytes), a password, and what to move to the worker. */
interface OpenRequest {
  readonly source: OpenSource;
  readonly password?: string;
  /** Moved to the worker instead of copied (the file's bytes). */
  readonly transfer: Transferable[];
}

/**
 * Maps an engine failure to what the user is told.
 * @param code The engine's error code.
 * @returns The matching open error.
 */
function toOpenError(code: EngineErrorCode): OpenErrorKind {
  if (code === "password-required" || code === "wrong-password" || code === "damaged") return code;
  return "engine-failed";
}

/**
 * Page references for a freshly opened file, in file order.
 * @param source The opened source.
 * @returns One reference per page.
 */
function pagesOf(source: SourceDoc): PageRef[] {
  return Array.from({ length: source.pageCount }, (_, sourceIndex) => ({
    id: `${source.id}:${sourceIndex}`,
    source: source.id,
    sourceIndex,
    rotation: 0,
  }));
}

/**
 * The engine instructions for building a file from pages.
 * @param content Sources and pages.
 * @param pages The pages to include, in order.
 * @returns One part per page.
 */
function partsOf(content: DocumentContent, pages: readonly PageRef[]): AssemblePart[] {
  return pages.map((page) => ({
    docId: docIdOf(content, page) ?? "",
    pageIndex: page.sourceIndex,
    rotation: page.rotation,
  }));
}

/**
 * Creates a document session.
 * @param engine The engine client (already initialised with the wasm URL).
 * @returns The session.
 */
export function createDocumentSession(engine: SessionEngine): DocumentSession {
  const store = createStore<DocumentState>(() => EMPTY_DOCUMENT);
  let history: History = EMPTY_HISTORY;
  /** Bumped on every load/close so a slow open cannot overwrite a newer one. */
  let generation = 0;
  let nextSourceNumber = 1;
  /** Where the worker is holding an encrypted file's bytes, plus what is needed to finish opening it. */
  let locked: { lockedId: string; name: string; fileId: string | null } | null = null;
  /** Engine work of edits that has not finished yet. */
  const pendingEdits = new Set<Promise<unknown>>();
  let failures = 0;

  /** Page reads by revision; dropped when a document opens or closes. */
  const pageReads = new Map<string, Promise<unknown>>();

  const registeredFonts = fontRegistrations(engine);

  const callEngine: CommandEngine = (method, params) => engine.call(method, params).promise;

  /**
   * Reads something about a page once per page revision.
   * @param kind What is read; part of the cache key.
   * @param pageId A page id.
   * @param read Reads it from the engine.
   * @returns The cached or fresh result; an empty list for an unknown page.
   */
  const readPage = <T>(
    kind: "annotations" | "forms" | "text" | "fonts",
    pageId: string,
    read: (at: PageAddress) => Promise<readonly T[]>,
  ): Promise<readonly T[]> => {
    const state = store.getState();
    const at = pageAddressOf(state, pageId);
    if (!at) return Promise.resolve([]);
    const key = `${kind}:${at.docId}#${at.pageIndex}@${annotationRevisionOf(state, pageId)}`;
    const cached = pageReads.get(key) as Promise<readonly T[]> | undefined;
    if (cached) return cached;
    const result = read(at);
    // A failed read is forgotten, so the next request tries again.
    result.catch(() => pageReads.delete(key));
    pageReads.set(key, result);
    if (pageReads.size > PAGE_READ_CACHE_SIZE) pageReads.delete(pageReads.keys().next().value!);
    return result;
  };
  const readAnnotations = (pageId: string) =>
    readPage("annotations", pageId, (at) => engine.call("getAnnotations", at).promise);
  const readFormFields = (pageId: string) =>
    readPage("forms", pageId, (at) => engine.call("getFormFields", at).promise);
  const readTextObjects = (pageId: string) =>
    readPage("text", pageId, (at) => engine.call("getTextObjects", at).promise);

  /**
   * Starts a command's engine work. The calls are sent right away, so they reach the worker before
   * anything asked for later (renders, saves) and see the edit.
   * @param work The command's `applyInEngine` or `undoInEngine`.
   * @param label The command's label, reported if the work fails.
   */
  const runInEngine = (work: ((engine: CommandEngine) => Promise<unknown>) | undefined, label: string): void => {
    if (!work) return;
    const loadedAt = generation;
    const pending = work(callEngine).catch(() => {
      if (loadedAt === generation) store.setState({ failedEdit: { label, serial: ++failures } });
    });
    pendingEdits.add(pending);
    void pending.finally(() => pendingEdits.delete(pending));
  };

  /** Writes content and history into the store, deriving status, selection and undo labels. */
  const commit = (content: DocumentContent, nextHistory: History, extra: Partial<DocumentState> = {}): void => {
    history = nextHistory;
    const current = store.getState();
    const pageIds = new Set(content.pages.map((page) => page.id));
    store.setState({
      ...current,
      ...content,
      selection: current.selection.filter((id) => pageIds.has(id)),
      status: isDirty(history) ? "dirty" : "clean",
      undoLabel: history.undoStack.at(-1)?.label ?? null,
      redoLabel: history.redoStack.at(-1)?.label ?? null,
      ...extra,
    });
  };

  const contentOf = (state: DocumentState): DocumentContent => ({
    sources: state.sources,
    pages: state.pages,
    annotationRevisions: state.annotationRevisions,
  });
  /** Edits are allowed only on an open document that is not being saved. */
  const editable = (): boolean => {
    const { status } = store.getState();
    return status === "clean" || status === "dirty";
  };

  const closeSources = async (sources: Readonly<Record<string, SourceDoc>>): Promise<void> => {
    const closing = Object.values(sources);
    for (const [fontId, registered] of registeredFonts) {
      for (const { docId } of closing) registered.documents.delete(docId);
      if (!registered.documents.size) registeredFonts.delete(fontId);
    }
    await Promise.allSettled(closing.map((source) => engine.call("close", { docId: source.docId }).promise));
  };

  const buildPdf = async (pageIds?: readonly string[], options: AssembleOptions = {}): Promise<ArrayBuffer> => {
    const state = store.getState();
    const wanted = pageIds ? new Set(pageIds) : null;
    const pages = wanted ? state.pages.filter((page) => wanted.has(page.id)) : state.pages;
    const { bytes } = await engine.call("assemble", { parts: partsOf(contentOf(state), pages), ...options }).promise;
    return bytes;
  };

  const openInEngine = ({ source, password, transfer }: OpenRequest) =>
    engine.call("open", { source, password }, transfer).promise;

  /**
   * Opens a file as the document, replacing whatever was open.
   * @param file The file's name and platform id.
   * @param request What to send to the engine.
   */
  const open = async (
    file: { readonly name: string; readonly fileId: string | null },
    request: OpenRequest,
  ): Promise<void> => {
    const { name, fileId } = file;
    const attempt = ++generation;
    store.setState({ ...EMPTY_DOCUMENT, status: "loading", fileName: name, fileId });
    try {
      const opened = await openInEngine(request);
      if (attempt !== generation) return void engine.call("close", { docId: opened.docId });
      const sourceDoc: SourceDoc = {
        id: `source-${nextSourceNumber++}`,
        name,
        pageCount: opened.pageCount,
        pages: opened.pages,
        docId: opened.docId,
      };
      locked = null;
      commit(
        { sources: { [sourceDoc.id]: sourceDoc }, pages: pagesOf(sourceDoc), annotationRevisions: {} },
        EMPTY_HISTORY,
        { fileName: name, fileId, selection: [], error: null },
      );
    } catch (error) {
      if (attempt !== generation) return;
      const detail = error instanceof EngineCallError ? error.detail : null;
      const kind = toOpenError(detail?.code ?? "engine-failed");
      if (detail?.lockedId && (kind === "password-required" || kind === "wrong-password")) {
        locked = { lockedId: detail.lockedId, name, fileId };
        store.setState({
          ...EMPTY_DOCUMENT,
          status: "needsPassword",
          fileName: name,
          fileId,
          error: kind === "wrong-password" ? kind : null,
        });
        return;
      }
      store.setState({ ...EMPTY_DOCUMENT, status: "failed", fileName: name, fileId, error: kind });
    }
  };

  return {
    store,

    async load(file) {
      pageReads.clear();
      await closeSources(store.getState().sources);
      locked = null;
      history = EMPTY_HISTORY;
      const problem = inspectPdfBytes(file.bytes);
      if (problem) {
        generation++;
        store.setState({ ...EMPTY_DOCUMENT, status: "failed", fileName: file.name, error: problem });
        return;
      }
      await open(
        { name: file.name, fileId: file.fileId ?? null },
        { source: { bytes: file.bytes }, transfer: [file.bytes] },
      );
    },

    async submitPassword(password) {
      if (!locked) return;
      await open(locked, { source: { lockedId: locked.lockedId }, password, transfer: [] });
    },

    async close() {
      pageReads.clear();
      generation++;
      locked = null;
      history = EMPTY_HISTORY;
      const { sources } = store.getState();
      store.setState(EMPTY_DOCUMENT);
      await closeSources(sources);
    },

    dispatch(input) {
      if (!editable()) return;
      const current = contentOf(store.getState());
      const command = typeof input === "function" ? input(current) : input;
      const step = execute({ content: current, history }, command);
      commit(step.content, step.history);
      runInEngine(command.applyInEngine, command.label);
    },

    undo() {
      const command = history.undoStack.at(-1);
      if (!editable() || !command) return;
      const step = undo({ content: contentOf(store.getState()), history });
      commit(step.content, step.history);
      runInEngine(command.undoInEngine, command.label);
    },

    redo() {
      const command = history.redoStack.at(-1);
      if (!editable() || !command) return;
      const step = redo({ content: contentOf(store.getState()), history });
      commit(step.content, step.history);
      runInEngine(command.applyInEngine, command.label);
    },

    async settled() {
      await Promise.allSettled([...pendingEdits]);
    },

    readAnnotations,
    readFormFields,
    readTextObjects,

    readPageFonts(pageId) {
      return readPage("fonts", pageId, (at) => engine.call("getPageFonts", at).promise);
    },

    registerTextFont(pageId, fontId, bytes) {
      const at = pageAddressOf(store.getState(), pageId);
      if (!at) return Promise.reject(new Error("The destination page is no longer open."));
      const registered = registeredFonts.get(fontId);
      if (registered?.documents.has(at.docId)) return registered.work;
      const copy = registered ? undefined : bytes.slice(0);
      const work = engine.call(
        "registerTextFont",
        { docId: at.docId, fontId, bytes: copy },
        copy ? [copy] : [],
      ).promise;
      const entry = { work, documents: registered?.documents ?? new Set<DocId>() };
      entry.documents.add(at.docId);
      registeredFonts.set(fontId, entry);
      void work.catch(() => {
        if (registeredFonts.get(fontId)?.documents === entry.documents) registeredFonts.delete(fontId);
      });
      return work;
    },

    async textRects(pageId, from, to) {
      const at = pageAddressOf(store.getState(), pageId);
      if (!at) return [];
      return engine.call("getTextRects", { ...at, from, to }).promise;
    },

    async textSelection(pageId, from, to) {
      const at = pageAddressOf(store.getState(), pageId);
      if (!at) return { rects: [], text: "" };
      return engine.call("getTextSelection", { ...at, from, to }).promise;
    },

    async renderTextObject(pageId, id, scale) {
      const at = pageAddressOf(store.getState(), pageId);
      if (!at) return null;
      return (await engine.call("renderTextObject", { ...at, id, scale }).promise).bitmap;
    },

    async findText(query, limit) {
      const { pages, sources } = store.getState();
      // Consecutive pages from the same file are searched in one engine call.
      const runs: { docId: string; pages: PageRef[] }[] = [];
      for (const page of pages) {
        const docId = sources[page.source]?.docId;
        if (!docId) continue;
        const last = runs.at(-1);
        if (last?.docId === docId) last.pages.push(page);
        else runs.push({ docId, pages: [page] });
      }
      const matches: DocumentMatch[] = [];
      for (const run of runs) {
        if (matches.length >= limit) break;
        const found = await engine.call("findText", {
          docId: run.docId,
          pageIndexes: run.pages.map((page) => page.sourceIndex),
          query,
          limit: limit - matches.length,
        }).promise;
        for (const { pageIndex, ...match } of found) {
          const page = run.pages.find((candidate) => candidate.sourceIndex === pageIndex)!;
          matches.push({ ...match, pageId: page.id, pageNumber: pages.indexOf(page) + 1 });
        }
      }
      return matches;
    },

    async textObjectAt(pageId, point) {
      const at = pageAddressOf(store.getState(), pageId);
      if (!at) return null;
      return engine.call("getTextObjectAt", { ...at, point }).promise;
    },

    select(pageIds) {
      const wanted = new Set(pageIds);
      const selection = store
        .getState()
        .pages.filter((page) => wanted.has(page.id))
        .map((page) => page.id);
      const current = store.getState().selection;
      // Same selection: skip the update so nothing re-renders.
      if (selection.length === current.length && selection.every((id, i) => id === current[i])) return;
      store.setState({ selection });
    },

    async importSource(file) {
      const problem = inspectPdfBytes(file.bytes);
      if (problem) return err(problem);
      try {
        const opened = await openInEngine({ source: { bytes: file.bytes }, transfer: [file.bytes] });
        return ok({
          id: `source-${nextSourceNumber++}`,
          name: file.name,
          pageCount: opened.pageCount,
          pages: opened.pages,
          docId: opened.docId,
        });
      } catch (error) {
        return err(toOpenError(error instanceof EngineCallError ? error.detail.code : "engine-failed"));
      }
    },

    async releaseSource(source) {
      if (store.getState().sources[source.id]) return;
      await engine.call("close", { docId: source.docId }).promise.catch(() => {});
    },

    buildPdf,

    async save(write) {
      if (!editable()) return { saved: false, reason: "build-failed" };
      // Status "saving" disables editing (architecture §6.3), so the history cannot change meanwhile.
      const before = store.getState().status;
      store.setState({ status: "saving" });
      let bytes: ArrayBuffer;
      try {
        bytes = await buildPdf();
      } catch {
        store.setState({ status: before });
        return { saved: false, reason: "build-failed" };
      }
      let file: SavedFile | null;
      try {
        file = await write(bytes);
      } catch {
        store.setState({ status: before });
        return { saved: false, reason: "write-failed" };
      }
      if (!file) {
        store.setState({ status: before });
        return { saved: false, reason: "cancelled" };
      }
      commit(contentOf(store.getState()), markSaved(history), { fileName: file.name, fileId: file.fileId ?? null });
      return { saved: true, file };
    },
  };
}
